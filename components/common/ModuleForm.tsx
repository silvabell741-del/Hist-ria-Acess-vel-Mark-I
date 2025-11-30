
import React, { useState, useEffect, useCallback } from 'react';
import type { Module, ModulePage, ModulePageContent, ModulePageContentType } from '../../types';
import { ICONS, SpinnerIcon } from '../../constants/index';
import { useToast } from '../../contexts/ToastContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseClient';
import { storage } from '../firebaseStorage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../../utils/imageCompression';
import { useModuleEditor } from '../../hooks/useModuleEditor';

// Sub-Components
import { ModuleMetadataForm } from '../modules/ModuleMetadataForm';
import { ModuleContentEditor } from '../modules/ModuleContentEditor';
import { AIGeneratorModal } from '../modules/AIGeneratorModal';

export const SUBJECTS_LIST = [
    'Artes', 'Biologia', 'Ciências', 'Educação Física', 'Espanhol', 'Filosofia', 'Física', 
    'Geografia', 'História', 'História Sergipana', 'Inglês', 'Matemática', 
    'Português / Literatura', 'Química', 'Sociologia', 'Tecnologia / Informática'
];

export const SCHOOL_YEARS = [
    "6º Ano", "7º Ano", "8º Ano", "9º Ano",
    "1º Ano (Ensino Médio)", "2º Ano (Ensino Médio)", "3º Ano (Ensino Médio)",
];

const DIDACTIC_SYSTEM_PROMPT = `Você é um assistente especializado em criar material didático. Crie conteúdos claros e objetivos. Use fontes oficiais.`;

interface ModuleFormProps {
    initialData?: Module | null;
    userId: string | undefined;
    onSave: (data: any, isDraft: boolean) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
    title: string;
    subtitle: string;
    defaultSeries?: string[];
    defaultSubjects?: string[];
}

export const ModuleForm: React.FC<ModuleFormProps> = ({ 
    initialData, 
    userId, 
    onSave, 
    onCancel, 
    isSubmitting, 
    title: formTitle, 
    subtitle,
    defaultSeries = [SCHOOL_YEARS[0]],
    defaultSubjects = ['História']
}) => {
    const { addToast } = useToast();

    // Editor Hook
    const { 
        pages, setPages, addPage, removePage, updatePageTitle, 
        addBlock, removeBlock, updateBlock, moveBlock 
    } = useModuleEditor([{ id: Date.now(), title: 'Página 1', content: [] }]);

    // Metadata State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [coverImageUrl, setCoverImageUrl] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [difficulty, setDifficulty] = useState<'Fácil' | 'Médio' | 'Difícil'>('Fácil');
    const [duration, setDuration] = useState('');
    const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // AI Generation State
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [aiTargetPageId, setAiTargetPageId] = useState<number | null>(null);

    // Initialization
    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title);
            setDescription(initialData.description || '');
            setCoverImageUrl(initialData.coverImageUrl || '');
            setVideoUrl(initialData.videoUrl || '');
            setDifficulty(initialData.difficulty || 'Fácil');
            setDuration(initialData.duration || '');
            
            if (Array.isArray(initialData.series)) {
                setSelectedSeries(initialData.series);
            } else if (initialData.series) {
                setSelectedSeries([initialData.series]);
            } else {
                setSelectedSeries(defaultSeries);
            }

            const subjects = initialData.subjects || (initialData.materia ? (Array.isArray(initialData.materia) ? initialData.materia : [initialData.materia]) : []);
            setSelectedSubjects(subjects.length > 0 ? subjects : defaultSubjects);

            const loadPages = async () => {
                if (initialData.pages && initialData.pages.length > 0) {
                    setPages(JSON.parse(JSON.stringify(initialData.pages)));
                } else {
                    setIsLoadingContent(true);
                    try {
                        const docRef = doc(db, 'module_contents', initialData.id);
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists() && docSnap.data().pages) {
                            setPages(docSnap.data().pages);
                        } else {
                            setPages([{ id: Date.now(), title: 'Página 1', content: [] }]);
                        }
                    } catch (err) {
                        console.error("Error fetching module content:", err);
                        addToast("Erro ao carregar conteúdo do módulo.", "error");
                        setPages([{ id: Date.now(), title: 'Página 1', content: [] }]);
                    } finally {
                        setIsLoadingContent(false);
                    }
                }
            };
            loadPages();

        } else {
             setSelectedSeries(defaultSeries);
             setSelectedSubjects(defaultSubjects);
             setPages([{ id: Date.now(), title: 'Página 1', content: [] }]);
        }
    }, [initialData, defaultSeries, defaultSubjects, addToast, setPages]);

    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && userId) {
            const file = e.target.files[0];
            setIsUploading(true);
            try {
                const processedFile = await compressImage(file);
                const filePath = `module_covers/${userId}/${Date.now()}-${processedFile.name}`;
                const storageRef = ref(storage, filePath);
                await uploadBytes(storageRef, processedFile);
                const url = await getDownloadURL(storageRef);
                
                setCoverImageUrl(url);
                addToast("Capa enviada com sucesso!", "success");
            } catch (error) {
                console.error("Upload failed", error);
                addToast("Erro ao enviar imagem de capa.", "error");
            } finally {
                setIsUploading(false);
            }
        }
    };

    // AI Logic
    const openAIModal = (pageId: number) => {
        setAiTargetPageId(pageId);
        setIsAIModalOpen(true);
    };

    const handleAIGenerate = async (prompt: string, type: ModulePageContentType) => {
        try {
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "gemini-2.5-flash",
                    contents: [{ parts: [{ text: `Gere um conteúdo do tipo "${type}" sobre: "${prompt}". A resposta deve ser direta. ${DIDACTIC_SYSTEM_PROMPT}` }] }],
                })
            });

            if (!response.ok) throw new Error("Erro na comunicação com a IA");

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!text) throw new Error("Resposta vazia da IA");

            if (type === 'list') {
                return text.split('\n').filter((item: string) => item.trim() !== '');
            } else {
                return text;
            }
        } catch (error) {
            console.error("Error generating AI content:", error);
            throw error;
        }
    };

    const handleAddAIContent = (content: string | string[], type: ModulePageContentType) => {
        if (aiTargetPageId === null) return;
        
        // We add a generic block via hook and then immediately update it with content
        // This relies on knowing the index, but we can't easily get it here. 
        // Better: Direct update via state setter from hook.
        
        setPages(prev => prev.map(p => {
            if (p.id === aiTargetPageId) {
                const newBlock: ModulePageContent = {
                    type,
                    content,
                    align: 'left',
                };
                return { ...p, content: [...p.content, newBlock] };
            }
            return p;
        }));
        
        setIsAIModalOpen(false);
        setAiTargetPageId(null);
    };

    const handleSaveWrapper = async (isDraft: boolean) => {
        if (!title || selectedSeries.length === 0 || selectedSubjects.length === 0) {
            addToast("Preencha todos os campos obrigatórios (Título, Série e Matéria).", "error");
            return;
        }

        const moduleData = {
            title, description, coverImageUrl, videoUrl, difficulty, duration,
            pages,
            series: selectedSeries,
            materia: selectedSubjects,
            subjects: selectedSubjects
        };

        await onSave(moduleData, isDraft);
    };

    if (isLoadingContent) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="flex flex-col items-center space-y-4">
                    <SpinnerIcon className="h-12 w-12 text-indigo-600" />
                    <p className="text-slate-500">Carregando conteúdo do módulo...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <div>
                     <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 hc-text-primary">{formTitle}</h2>
                     <p className="text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
                </div>
                <button onClick={onCancel} className="px-4 py-2 bg-white border border-gray-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 hc-button-override">Voltar</button>
            </div>

            <ModuleMetadataForm 
                title={title} setTitle={setTitle}
                description={description} setDescription={setDescription}
                coverImageUrl={coverImageUrl} setCoverImageUrl={setCoverImageUrl}
                videoUrl={videoUrl} setVideoUrl={setVideoUrl}
                difficulty={difficulty} setDifficulty={setDifficulty}
                duration={duration} setDuration={setDuration}
                selectedSeries={selectedSeries} setSelectedSeries={setSelectedSeries}
                selectedSubjects={selectedSubjects} setSelectedSubjects={setSelectedSubjects}
                isUploading={isUploading} handleCoverUpload={handleCoverUpload}
                disabled={isSubmitting}
            />

            <ModuleContentEditor 
                pages={pages}
                updatePageTitle={updatePageTitle}
                addPage={addPage}
                removePage={removePage}
                addBlock={addBlock}
                removeBlock={removeBlock}
                updateBlock={updateBlock}
                moveBlock={moveBlock}
                openAIModal={openAIModal}
            />

            <AIGeneratorModal 
                isOpen={isAIModalOpen}
                onClose={() => { setIsAIModalOpen(false); setAiTargetPageId(null); }}
                onGenerate={handleAIGenerate}
                onAddContent={handleAddAIContent}
            />

            <div className="flex justify-end space-x-4 pb-8">
                <button 
                    onClick={() => handleSaveWrapper(true)} 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-amber-100 text-amber-900 font-semibold rounded-lg hover:bg-amber-200 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800 disabled:opacity-50"
                >
                    Salvar Rascunho
                </button>
                <button 
                    onClick={() => handleSaveWrapper(false)} 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow-lg disabled:opacity-50 flex items-center space-x-2 hc-button-primary-override"
                >
                     {isSubmitting ? <SpinnerIcon className="h-5 w-5 text-white" /> : <div className="h-5 w-5">{ICONS.plus}</div>}
                    <span>{initialData ? 'Salvar Alterações' : 'Criar Módulo'}</span>
                </button>
            </div>
        </div>
    );
};
