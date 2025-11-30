
import React from 'react';
import { Card } from '../common/Card';
import { InputField, SelectField, MultiSelect } from '../common/FormHelpers';
import { SpinnerIcon } from '../../constants/index';
import { SCHOOL_YEARS, SUBJECTS_LIST } from '../common/ModuleForm';

interface ModuleMetadataFormProps {
    title: string;
    setTitle: (v: string) => void;
    description: string;
    setDescription: (v: string) => void;
    coverImageUrl: string;
    setCoverImageUrl: (v: string) => void;
    videoUrl: string;
    setVideoUrl: (v: string) => void;
    difficulty: string;
    setDifficulty: (v: any) => void;
    duration: string;
    setDuration: (v: string) => void;
    selectedSeries: string[];
    setSelectedSeries: (v: string[]) => void;
    selectedSubjects: string[];
    setSelectedSubjects: (v: string[]) => void;
    isUploading: boolean;
    handleCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
}

export const ModuleMetadataForm: React.FC<ModuleMetadataFormProps> = ({
    title, setTitle,
    description, setDescription,
    coverImageUrl, setCoverImageUrl,
    videoUrl, setVideoUrl,
    difficulty, setDifficulty,
    duration, setDuration,
    selectedSeries, setSelectedSeries,
    selectedSubjects, setSelectedSubjects,
    isUploading, handleCoverUpload,
    disabled
}) => {
    return (
        <Card>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 border-b dark:border-slate-700 pb-4 mb-6">Informações do Módulo</h3>
            <div className="space-y-6">
                <InputField label="Título" required>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white" disabled={disabled} />
                </InputField>
                <InputField label="Descrição">
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white" disabled={disabled} />
                </InputField>
                
                <InputField label="Imagem de Capa">
                    <div className="flex space-x-2">
                        <input 
                            type="text" 
                            value={coverImageUrl} 
                            onChange={e => setCoverImageUrl(e.target.value)} 
                            placeholder="URL da imagem (https://...)" 
                            className="flex-grow p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                            disabled={disabled}
                        />
                        <label className={`cursor-pointer px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center justify-center ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isUploading ? <SpinnerIcon className="h-5 w-5" /> : 'Upload'}
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={handleCoverUpload}
                                className="hidden" 
                                disabled={disabled || isUploading}
                            />
                        </label>
                    </div>
                    {coverImageUrl && <p className="text-xs text-green-600 mt-1">Imagem definida.</p>}
                </InputField>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <MultiSelect 
                        label="Séries" 
                        options={SCHOOL_YEARS} 
                        selected={selectedSeries} 
                        onChange={setSelectedSeries} 
                    />
                    <MultiSelect 
                        label="Matérias" 
                        options={SUBJECTS_LIST} 
                        selected={selectedSubjects} 
                        onChange={setSelectedSubjects} 
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField label="Dificuldade" required>
                            <SelectField value={difficulty} onChange={e => setDifficulty(e.target.value as any)}>
                                <option>Fácil</option>
                                <option>Médio</option>
                                <option>Difícil</option>
                            </SelectField>
                        </InputField>
                        <InputField label="Duração">
                            <input type="text" value={duration} onChange={e => setDuration(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white" disabled={disabled} />
                        </InputField>
                </div>
            </div>
        </Card>
    );
};
