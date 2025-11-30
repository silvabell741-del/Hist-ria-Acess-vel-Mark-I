
import React, { useState, useMemo, useEffect, useContext } from 'react';
import type { Module, ModuleDownloadState } from '../types';
import { Card } from './common/Card';
import { SpinnerIcon } from '../constants/index';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
// Imports diretos dos Contextos para evitar erro de Hook fora do Provider
import { StudentAcademicContext } from '../contexts/StudentAcademicContext';
import { TeacherAcademicContext } from '../contexts/TeacherAcademicContext';
import { saveModuleOffline, removeModuleOffline, listOfflineModules } from '../utils/offlineManager';
import { useToast } from '../contexts/ToastContext';
import { useSettings } from '../contexts/SettingsContext';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, limit, startAfter, doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';

const PlayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ModuleCard: React.FC<{ 
    module: Module; 
    onStartModule: (module: Module) => void; 
    downloadState: ModuleDownloadState;
    onToggleDownload: (module: Module) => void;
}> = React.memo(({ module, onStartModule, downloadState, onToggleDownload }) => {
    const { theme } = useSettings();
    const isAurora = theme === 'galactic-aurora';
    const isDragon = theme === 'dragon-year';
    const isEmerald = theme === 'emerald-sovereignty';
    const isAkebono = theme === 'akebono-dawn';

    const isCompleted = module.progress === 100;
    const buttonText = isCompleted ? 'Revisar' : (module.progress && module.progress > 0) ? 'Continuar' : 'Iniciar';

    const difficultyColors: { [key: string]: string } = {
        'Fácil': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30',
        'Médio': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30',
        'Difícil': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
    };
    const difficultyColor = module.difficulty ? difficultyColors[module.difficulty] : '';
    
    const displayMateria = Array.isArray(module.materia) ? module.materia.join(', ') : module.materia;
    const displaySeries = Array.isArray(module.series) ? module.series.join(', ') : module.series;

    let materiaTagClass = 'bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-slate-600 dark:text-slate-200 dark:border-slate-500';
    let seriesTagClass = 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    let buttonClass = "mt-5 w-full font-bold py-3 px-4 rounded-lg text-white bg-gradient-to-r from-blue-500 to-green-400 hover:from-blue-600 hover:to-green-500 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center hc-button-primary-override";

    if (isAurora) {
        materiaTagClass = 'bg-black text-[#D90429] border border-[#D90429]/30';
        seriesTagClass = 'bg-black text-[#00B4D8] border border-[#00B4D8]/30';
        buttonClass = "mt-5 w-full font-bold py-3 px-4 rounded-lg text-white bg-[#6A0DAD] hover:bg-[#580b9e] border border-[#6A0DAD] transition-all duration-300 shadow-[0_0_15px_rgba(106,13,173,0.5)] hover:shadow-[0_0_25px_rgba(106,13,173,0.8)] flex items-center justify-center hc-button-primary-override";
    } else if (isDragon) {
        materiaTagClass = 'bg-[#5d0e0e] text-[#ffd700] border border-[#b71c1c]'; 
        seriesTagClass = 'bg-[#fff8e7] text-[#5d0e0e] border border-[#5d0e0e]'; 
        buttonClass = "mt-5 w-full font-bold py-3 px-4 rounded-lg text-white bg-gradient-to-r from-[#2E7D32] to-[#66BB6A] hover:from-[#1B5E20] hover:to-[#43A047] border border-[#1B5E20] transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center hc-button-primary-override";
    } else if (isEmerald) {
        materiaTagClass = 'bg-[#064E3B] text-[#34D399] border border-[#D4AF37]';
        seriesTagClass = 'bg-[#1F2937] text-[#D4AF37] border border-[#374151]'; 
        buttonClass = "mt-5 w-full font-bold py-3 px-4 rounded-lg text-black bg-gradient-to-r from-[#059669] to-[#34D399] hover:from-[#047857] hover:to-[#10B981] border border-[#047857] transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.5)] hover:shadow-[0_0_20px_rgba(52,211,153,0.8)] flex items-center justify-center hc-button-primary-override";
    } else if (isAkebono) {
        materiaTagClass = 'bg-[#FCE4EC] text-[#880E4F] border border-[#F8BBD0]';
        seriesTagClass = 'bg-[#F1F8E9] text-[#33691E] border border-[#DCEDC8]';
        // Botão Verde Grama (sem a classe de override global para evitar conflito com o azul padrão do tema)
        buttonClass = "mt-5 w-full font-bold py-3 px-4 rounded-lg text-white bg-gradient-to-r from-[#66BB6A] to-[#2E7D32] hover:from-[#4CAF50] hover:to-[#1B5E20] border border-[#2E7D32] transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center";
    }

    const statusDescription = isCompleted ? 'Concluído' : (module.progress && module.progress > 0) ? `Progresso: ${module.progress}%` : 'Não iniciado';
    const fullDescription = `Módulo ${module.title}. Matéria: ${displayMateria || 'Geral'}. Série: ${displaySeries || 'Geral'}. Dificuldade: ${module.difficulty || 'Não informada'}. Status: ${statusDescription}. Descrição: ${module.description}`;

    return (
        <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-md flex flex-col h-full group overflow-hidden border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            role="article"
            aria-label={fullDescription}
            tabIndex={0}
        >
            <div className="relative">
                <img 
                    src={module.coverImageUrl || 'https://images.unsplash.com/photo-1519781542343-dc12c611d9e5?q=80&w=800&auto=format&fit=crop'} 
                    alt=""
                    aria-hidden="true"
                    className="w-full aspect-video object-cover pointer-events-none" 
                    loading="lazy" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" aria-hidden="true"></div>

                <div className="absolute top-3 right-3 flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleDownload(module);
                        }}
                        disabled={downloadState === 'downloading'}
                        className={`p-3 rounded-full backdrop-blur-sm transition-colors shadow-sm border ${
                            downloadState === 'downloaded' 
                                ? 'bg-green-500/90 text-white border-green-400 hover:bg-red-500/90 hover:border-red-400' 
                                : 'bg-[#dc143c] text-white border-[#dc143c] hover:bg-[#b01030]'
                        }`}
                        title={downloadState === 'downloaded' ? "Baixado (Clique para remover)" : "Baixar para offline"}
                        aria-label={downloadState === 'downloaded' ? `Remover download do módulo ${module.title}` : `Baixar módulo ${module.title} para offline`}
                    >
                        {downloadState === 'downloading' ? (
                            <SpinnerIcon className="h-4 w-4 text-white" />
                        ) : downloadState === 'downloaded' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        )}
                    </button>
                    
                    {module.difficulty && (
                        <span aria-hidden="true" className={`text-xs font-bold px-2.5 py-1 rounded-full border ${difficultyColor}`}>{module.difficulty}</span>
                    )}
                </div>
                
                {(module.progress !== undefined && module.progress > 0) && (
                    <div className="absolute bottom-3 left-3 right-3 text-white" aria-hidden="true">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
                                {isCompleted ? 'Concluído' : 'Progresso'}
                            </span>
                            <span className="text-sm font-bold" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>{module.progress}%</span>
                        </div>
                        <div className="w-full bg-white/30 rounded-full h-2">
                            <div className={`${isCompleted ? 'bg-green-400' : 'bg-yellow-400'} h-2 rounded-full`} style={{ width: `${module.progress}%` }}></div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-5 flex flex-col flex-grow">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 hc-text-primary">{module.title}</h3>
                
                <div className="flex items-center flex-wrap gap-2 mt-3 text-xs font-medium" aria-hidden="true">
                    {displaySeries && <span className={`px-2 py-1 rounded truncate max-w-[150px] ${seriesTagClass}`}>{displaySeries}</span>}
                    {displayMateria && <span className={`px-2 py-1 rounded truncate max-w-[150px] ${materiaTagClass}`}>{displayMateria}</span>}
                </div>

                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 flex-grow hc-text-secondary" aria-hidden="true">{module.description}</p>
                
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStartModule(module);
                    }}
                    className={buttonClass}
                    aria-label={`${buttonText} módulo ${module.title}`}
                >
                    <PlayIcon />
                    <span>{buttonText}</span>
                </button>
            </div>
        </div>
    );
});


const Modules: React.FC = () => {
    const { user, userRole } = useAuth();
    const { addToast } = useToast();
    const { startModule } = useNavigation();
    const queryClient = useQueryClient();

    // Contexts
    const studentContext = useContext(StudentAcademicContext);
    const teacherContext = useContext(TeacherAcademicContext);

    const isStudent = userRole === 'aluno' && !!studentContext;
    const isTeacher = userRole === 'professor' && !!teacherContext;

    // --- UI STATE (Visual only, does not trigger query) ---
    const [searchTerm, setSearchTerm] = useState('');
    const [searchScope, setSearchScope] = useState<'my_modules' | 'public'>(
        isStudent && studentContext?.moduleFilters ? studentContext.moduleFilters.scope : 'my_modules'
    );
    const [selectedSerie, setSelectedSerie] = useState(
        isStudent && studentContext?.moduleFilters ? studentContext.moduleFilters.serie : (user?.series || 'all')
    );
    const [selectedMateria, setSelectedMateria] = useState(
        isStudent && studentContext?.moduleFilters ? studentContext.moduleFilters.materia : 'all'
    );
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'Concluído' | 'Não iniciado' | 'Em andamento'>(
        (isStudent && studentContext?.moduleFilters ? studentContext.moduleFilters.status as any : 'Em andamento')
    );

    // --- APPLIED FILTER STATE (Triggers Query) ---
    const [appliedFilters, setAppliedFilters] = useState({
        scope: searchScope,
        serie: selectedSerie,
        materia: selectedMateria,
        status: selectedStatus,
        text: searchTerm
    });
    
    const [offlineStatus, setOfflineStatus] = useState<Record<string, ModuleDownloadState>>({});
    
    // Check for refresh intent (Pull to refresh or manual trigger from context)
    useEffect(() => {
        // Optional: Could hook into a global refresh signal here
    }, []);

    // Offline Check
    useEffect(() => {
        const checkOffline = async () => {
            const offlineModules = await listOfflineModules();
            const statusMap: Record<string, ModuleDownloadState> = {};
            offlineModules.forEach(m => {
                statusMap[m.id] = 'downloaded';
            });
            setOfflineStatus(prev => ({ ...prev, ...statusMap }));
        };
        checkOffline();
    }, []);

    const handleSearch = () => {
        setAppliedFilters({
            scope: searchScope,
            serie: selectedSerie,
            materia: selectedMateria,
            status: selectedStatus,
            text: searchTerm
        });
        
        // Opcional: Invalidar query para forçar refetch fresco se o usuário clicar em buscar explicitamente
        // queryClient.invalidateQueries({ queryKey: ['modules', user?.id, searchScope] });
    };

    // FETCH FUNCTION FOR REACT QUERY
    const fetchModulesPage = async ({ pageParam }: { pageParam: string | null }) => {
        if (!user || !isStudent) return { modules: [], lastId: null };

        // Use appliedFilters here instead of UI state directly
        const { scope, serie, materia, status, text } = appliedFilters;

        let q = query(collection(db, "modules"), where("status", "==", "Ativo"));

        if (scope === 'public') {
            q = query(q, where("visibility", "==", "public"));
        } else {
            const myClassIds = studentContext.studentClasses.map(c => c.id);
            if (myClassIds.length === 0) return { modules: [], lastId: null };
            const classIdsToQuery = myClassIds.slice(0, 10);
            q = query(q, where("classIds", "array-contains-any", classIdsToQuery));
        }

        q = query(q, limit(10)); // Aggressive Pagination

        if (scope === 'public' && serie !== 'all') {
            q = query(q, where("series", "array-contains", serie));
        }
        
        if (pageParam) {
            try {
                const cursorRef = doc(db, "modules", pageParam);
                const cursorSnap = await getDoc(cursorRef);
                if (cursorSnap.exists()) {
                    q = query(q, startAfter(cursorSnap));
                }
            } catch (e) {
                console.warn("Could not rehydrate pagination cursor", e);
            }
        }

        const snap = await getDocs(q);
        
        let results = snap.docs.map(d => {
            const data = d.data();
            return { 
                id: d.id, 
                ...data,
                date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
            } as Module;
        });

        // Client Side Filtering
        if (scope === 'my_modules' && serie !== 'all') {
            results = results.filter(m => {
                const series = Array.isArray(m.series) ? m.series : [m.series];
                return series.includes(serie);
            });
        }

        if (materia !== 'all') {
            results = results.filter(m => {
                const mat = Array.isArray(m.materia) ? m.materia : [m.materia];
                return mat.includes(materia);
            });
        }

        // Text Search Filtering (Client-side because Firestore text search is limited)
        if (text && text.trim() !== '') {
            const lowerText = text.toLowerCase();
            results = results.filter(m => 
                m.title.toLowerCase().includes(lowerText) || 
                (m.description && m.description.toLowerCase().includes(lowerText))
            );
        }

        // Fetch Progress
        const progressPromises = results.map(async (m) => {
            try {
                const progRef = doc(db, "users", user.id, "modulesProgress", m.id);
                const pSnap = await getDoc(progRef);
                return pSnap.exists() ? pSnap.data().progress : 0;
            } catch { return 0; }
        });
        const progressValues = await Promise.all(progressPromises);
        
        const finalModules = results.map((m, i) => ({ ...m, progress: progressValues[i] }));

        let filteredByStatus = finalModules;
        if (status !== 'all') {
            filteredByStatus = finalModules.filter(m => {
                if (status === 'Concluído') return m.progress === 100;
                if (status === 'Não iniciado') return m.progress === 0;
                if (status === 'Em andamento') return m.progress > 0 && m.progress < 100;
                return true;
            });
        }

        return { 
            modules: filteredByStatus, 
            lastId: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null 
        };
    };

    // React Query Hook - Depends on appliedFilters
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status
    } = useInfiniteQuery({
        queryKey: ['modules', user?.id, appliedFilters],
        queryFn: fetchModulesPage,
        getNextPageParam: (lastPage) => lastPage.lastId || undefined,
        initialPageParam: null,
        enabled: isStudent && !!user && !!studentContext
    });

    const flattenedModules = useMemo(() => {
        return data?.pages.flatMap(page => page.modules) || [];
    }, [data]);

    // Teacher Logic (Keep using Context for Teachers as they have different needs/smaller lists usually)
    const teacherModules = useMemo(() => {
        if (!isTeacher) return [];
        let results = teacherContext.modules;
        if (appliedFilters.scope === 'my_modules') {
            results = results.filter(m => m.creatorId === user?.id);
        } else {
            results = results.filter(m => m.visibility === 'public');
        }
        if (appliedFilters.serie !== 'all') {
            results = results.filter(m => {
                const series = Array.isArray(m.series) ? m.series : [m.series];
                return series.includes(appliedFilters.serie);
            });
        }
        if (appliedFilters.materia !== 'all') {
            results = results.filter(m => {
                const mat = Array.isArray(m.materia) ? m.materia : [m.materia];
                return mat.includes(appliedFilters.materia);
            });
        }
        if (appliedFilters.text && appliedFilters.text.trim() !== '') {
            const lowerText = appliedFilters.text.toLowerCase();
            results = results.filter(m => m.title.toLowerCase().includes(lowerText));
        }
        return results;
    }, [isTeacher, teacherContext?.modules, appliedFilters, user?.id]);

    const displayedModules = isStudent ? flattenedModules : teacherModules;
    const isLoading = isStudent ? status === 'pending' : (isTeacher ? teacherContext.isLoadingContent : false);

    // Initial Teacher Load
    useEffect(() => {
        if (isTeacher) {
            teacherContext.fetchModulesLibrary();
        }
    }, [isTeacher]);

    const handleToggleDownload = async (module: Module) => {
        const currentStatus = offlineStatus[module.id] || 'not_downloaded';
        if (currentStatus === 'downloaded') {
            if (window.confirm(`Remover download de "${module.title}"?`)) {
                await removeModuleOffline(module.id);
                setOfflineStatus(prev => ({ ...prev, [module.id]: 'not_downloaded' }));
                addToast('Download removido.', 'info');
            }
        } else if (currentStatus === 'not_downloaded') {
            setOfflineStatus(prev => ({ ...prev, [module.id]: 'downloading' }));
            try {
                await saveModuleOffline(module);
                setOfflineStatus(prev => ({ ...prev, [module.id]: 'downloaded' }));
                addToast('Módulo baixado!', 'success');
            } catch (e) {
                setOfflineStatus(prev => ({ ...prev, [module.id]: 'not_downloaded' }));
                addToast('Erro ao baixar.', 'error');
            }
        }
    };

    const seriesOptions = ["6º Ano", "7º Ano", "8º Ano", "9º Ano", "1º Ano (Ensino Médio)", "2º Ano (Ensino Médio)", "3º Ano (Ensino Médio)"];
    const materiaOptions = ["História", "Geografia", "Filosofia", "Sociologia", "História Sergipana", "Artes", "Ciências"];
    
    return (
        <div className="space-y-6">
            {/* Toolbar em Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-300 dark:border-slate-700 hc-bg-override hc-border-override">
                <div className="flex flex-col gap-4">
                    
                    {/* Linha Superior: Escopo + Busca Textual Integrada */}
                    <div className="flex flex-col md:flex-row gap-4 w-full items-center">
                        
                        {/* 1. Seletor de Escopo (Primeiro) */}
                        <div className="w-full md:w-48 flex-shrink-0">
                            <select
                                value={searchScope}
                                onChange={(e) => setSearchScope(e.target.value as any)}
                                aria-label="Escopo da busca"
                                className="w-full appearance-none px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
                            >
                                <option value="my_modules">Meus Módulos</option>
                                <option value="public">Biblioteca Pública</option>
                            </select>
                        </div>

                        {/* 2. Campo de Busca com Botão Interno (Segundo) */}
                        <div className="relative flex-grow w-full md:w-auto group">
                            <input
                                type="text"
                                className="w-full pl-4 pr-12 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder-slate-400 transition-all"
                                placeholder="Buscar por título..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            />
                            <button
                                onClick={handleSearch}
                                className="absolute right-1 top-1 bottom-1 px-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors flex items-center justify-center dark:ring-offset-slate-800"
                                aria-label="Buscar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Linha Inferior: Filtros */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700">
                         <div className="relative">
                            <select 
                                value={selectedSerie} 
                                onChange={e => setSelectedSerie(e.target.value)}
                                aria-label="Filtrar por Série"
                                className="w-full appearance-none px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-300 shadow-sm"
                            >
                                <option value="all">Todas as Séries</option>
                                {seriesOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>

                         <div className="relative">
                            <select 
                                value={selectedMateria} 
                                onChange={e => setSelectedMateria(e.target.value)}
                                aria-label="Filtrar por Matéria"
                                className="w-full appearance-none px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-300 shadow-sm"
                            >
                                <option value="all">Todas as Matérias</option>
                                {materiaOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                         </div>

                         {isStudent && (
                             <div className="relative">
                                <select 
                                    value={selectedStatus} 
                                    onChange={e => setSelectedStatus(e.target.value as any)}
                                    aria-label="Filtrar por Status"
                                    className="w-full appearance-none px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-300 shadow-sm"
                                >
                                    <option value="all">Todos os Status</option>
                                    <option value="Em andamento">Em andamento</option>
                                    <option value="Concluído">Concluídos</option>
                                    <option value="Não iniciado">Não iniciados</option>
                                </select>
                             </div>
                         )}
                    </div>
                </div>
            </div>

            {/* Resultados */}
            <div className="mt-6">
                {isLoading ? (
                     <div className="text-center py-20" role="status" aria-live="polite">
                        <SpinnerIcon className="h-10 w-10 text-indigo-500 mx-auto mb-4" />
                        <p className="text-slate-500 dark:text-slate-400">Buscando módulos...</p>
                    </div>
                ) : displayedModules.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in" role="list">
                            {displayedModules.map((module) => (
                                <div key={module.id} role="listitem">
                                    <ModuleCard 
                                        module={module} 
                                        onStartModule={startModule} 
                                        downloadState={offlineStatus[module.id] || 'not_downloaded'}
                                        onToggleDownload={handleToggleDownload}
                                    />
                                </div>
                            ))}
                        </div>
                        
                        {/* Load More Button for Student Infinite Scroll */}
                        {isStudent && hasNextPage && (
                            <div className="flex justify-center mt-8">
                                <button
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center transition-colors"
                                >
                                    {isFetchingNextPage ? <SpinnerIcon className="h-5 w-5 mr-2" /> : null}
                                    {isFetchingNextPage ? 'Carregando...' : 'Carregar Mais'}
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <Card className="text-center py-16 bg-slate-50 dark:bg-slate-800/50 border-dashed border-2 border-slate-300 dark:border-slate-700">
                        <div className="inline-block p-4 bg-white dark:bg-slate-800 rounded-full mb-4 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                            Não encontrou o que procurava?
                        </h3>
                        <p className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800 text-sm text-slate-600 dark:text-slate-400">
                            Tente ajustar os filtros, verificar a ortografia ou mudar para <strong>"Biblioteca Pública"</strong>.
                        </p>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default Modules;
