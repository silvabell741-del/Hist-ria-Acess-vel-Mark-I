
import React, { useState, useMemo, useEffect } from 'react';
import { useTeacherClassContext } from '../contexts/TeacherClassContext';
import { Card } from './common/Card';
import { ICONS, SpinnerIcon } from '../constants/index';
import type { Unidade, StudentGradeSummaryDoc } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseClient';
import { useQuery } from '@tanstack/react-query';

// Helper functions kept inline or imported
const getUnitOrder = (unit: string): number => {
    const map: Record<string, number> = { '1ª Unidade': 1, '2ª Unidade': 2, '3ª Unidade': 3, '4ª Unidade': 4 };
    return map[unit] || 99;
};

const getScoreColor = (score: number | undefined | null): string => {
    if (score === undefined || score === null) return 'text-slate-500 border-slate-200 bg-slate-50';
    const val = Number(score.toFixed(1));
    if (val >= 10) return 'text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20';
    if (val >= 7.1) return 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20';
    if (val >= 5.0) return 'text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20';
    return 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
};

const SchoolRecords: React.FC = () => {
    const { teacherClasses, archivedClasses, fetchClassDetails } = useTeacherClassContext();

    const [showArchived, setShowArchived] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [expandedUnidade, setExpandedUnidade] = useState<string | null>(null);

    const availableClasses = showArchived ? archivedClasses : teacherClasses;

    // Auto-select first class
    useEffect(() => {
        if (availableClasses.length > 0) {
            const currentExists = availableClasses.find(c => c.id === selectedClassId);
            if (!currentExists) setSelectedClassId(availableClasses[0].id);
        } else {
            setSelectedClassId('');
        }
    }, [availableClasses, selectedClassId]);

    // Lazy load details
    useEffect(() => {
        if (selectedClassId) {
            const cls = availableClasses.find(c => c.id === selectedClassId);
            if (cls && !cls.isFullyLoaded) fetchClassDetails(selectedClassId);
        }
    }, [selectedClassId, availableClasses, fetchClassDetails]);

    // Fetch Report with React Query
    const { data: studentReport, isLoading: isLoadingReport } = useQuery({
        queryKey: ['studentGradeReport', selectedClassId, selectedStudentId],
        queryFn: async () => {
            if (!selectedClassId || !selectedStudentId) return null;
            const summaryId = `${selectedClassId}_${selectedStudentId}`;
            const docRef = doc(db, "student_grades", summaryId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? (docSnap.data() as StudentGradeSummaryDoc) : null;
        },
        enabled: !!selectedClassId && !!selectedStudentId,
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    const selectedClass = useMemo(() => availableClasses.find(c => c.id === selectedClassId), [availableClasses, selectedClassId]);
    const isClassLoading = selectedClass && !selectedClass.isFullyLoaded;

    const studentsInClass = useMemo(() => {
        if (!selectedClass?.students) return [];
        return [...selectedClass.students]
            .filter(s => s.status !== 'inactive') 
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedClass]);

    const selectedStudent = useMemo(() => studentsInClass.find(s => s.id === selectedStudentId), [studentsInClass, selectedStudentId]);

    const sortedUnits = useMemo(() => {
        if (!studentReport?.unidades) return [];
        return Object.keys(studentReport.unidades).sort((a, b) => getUnitOrder(a) - getUnitOrder(b));
    }, [studentReport]);

    const toggleUnidade = (unidade: string) => {
        setExpandedUnidade(prev => (prev === unidade ? null : unidade));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowArchived(!showArchived)}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors border ${
                        showArchived 
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' 
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600'
                    }`}
                >
                    {showArchived ? 'Voltar para Turmas Ativas' : 'Ver Turmas Concluídas'}
                </button>
            </div>

            <Card className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b-4 border-indigo-500">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <label htmlFor="class-filter" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                            {showArchived ? 'Turma Arquivada' : 'Turma Ativa'}
                        </label>
                        <select
                            id="class-filter"
                            value={selectedClassId}
                            onChange={e => setSelectedClassId(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
                        >
                            {availableClasses.length === 0 ? (
                                <option disabled value="">Nenhuma turma {showArchived ? 'arquivada' : 'disponível'}</option>
                            ) : (
                                availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                            )}
                        </select>
                    </div>
                </div>
            </Card>

            {isClassLoading ? (
                <div className="flex justify-center items-center h-64">
                    <SpinnerIcon className="h-12 w-12 text-indigo-600 dark:text-indigo-400" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Card className="lg:col-span-4 !p-0 overflow-hidden h-fit">
                        <div className="p-4 bg-slate-100 dark:bg-slate-700/50 border-b dark:border-slate-700">
                            <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center">
                                {ICONS.students}
                                <span className="ml-2">Alunos ({studentsInClass.length})</span>
                            </h2>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto p-2">
                            {studentsInClass.length > 0 ? (
                                studentsInClass.map(student => (
                                    <button
                                        key={student.id}
                                        onClick={() => setSelectedStudentId(student.id)}
                                        className={`w-full text-left px-4 py-3 rounded-lg mb-1 transition-all flex items-center space-x-3 ${
                                            selectedStudentId === student.id 
                                                ? 'bg-indigo-600 text-white shadow-md transform scale-[1.02]' 
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedStudentId === student.id ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300'}`}>
                                            {student.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-medium truncate">{student.name}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                                    <p>Nenhum aluno encontrado nesta turma.</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    <div className="lg:col-span-8">
                        {selectedStudent ? (
                            <Card className="!p-0 overflow-hidden min-h-[400px]">
                                 <div className="p-6 bg-white dark:bg-slate-800 border-b dark:border-slate-700">
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedStudent.name}</h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Relatório de Desempenho - {selectedClass?.name}</p>
                                </div>

                                {isLoadingReport ? (
                                    <div className="flex justify-center items-center h-64"><SpinnerIcon className="h-8 w-8 text-indigo-500" /></div>
                                ) : studentReport && sortedUnits.length > 0 ? (
                                    <div className="p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/20">
                                        {sortedUnits.map(unidade => {
                                            const unitData = studentReport.unidades[unidade as Unidade];
                                            if (!unitData) return null;
                                            const subjects = Object.keys(unitData.subjects || {});
                                            const unitTotal = subjects.reduce((acc, subj) => acc + (unitData.subjects[subj].totalPoints || 0), 0);
                                            
                                            return (
                                                <div key={unidade} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-200">
                                                    <button 
                                                        className="w-full flex justify-between items-center p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 text-left" 
                                                        onClick={() => toggleUnidade(unidade)}
                                                    >
                                                        <div className="flex items-center space-x-4">
                                                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">{getUnitOrder(unidade)}</div>
                                                            <div>
                                                                <h3 className="font-bold text-slate-800 dark:text-slate-200">{unidade}</h3>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">{subjects.length} matérias avaliadas</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{unitTotal.toFixed(1)} <span className="text-sm font-normal text-slate-400">pts</span></p>
                                                        </div>
                                                    </button>
                                                    
                                                    {expandedUnidade === unidade && (
                                                        <div className="border-t border-slate-100 dark:border-slate-700">
                                                            {subjects.map((subject, idx) => {
                                                                const subjData = unitData.subjects[subject];
                                                                const colorClass = getScoreColor(subjData.totalPoints);
                                                                return (
                                                                    <div key={subject} className={`p-4 ${idx > 0 ? 'border-t border-dashed border-slate-200 dark:border-slate-700' : ''}`}>
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <h4 className="font-bold text-slate-700 dark:text-slate-300 uppercase text-xs tracking-wide">{subject}</h4>
                                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${colorClass}`}>Total: {subjData.totalPoints}</span>
                                                                        </div>
                                                                        <ul className="space-y-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                                                                            {subjData.activities.map(act => (
                                                                                <li key={act.id} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 dark:hover:bg-slate-700/20 rounded">
                                                                                    <span className="text-slate-600 dark:text-slate-400">{act.title}</span>
                                                                                    <span className="font-medium text-slate-700 dark:text-slate-300">{act.grade} <span className="text-xs text-slate-400">/ {act.maxPoints}</span></span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                                        <p className="font-medium">Nenhuma nota lançada para este aluno nesta turma.</p>
                                    </div>
                                )}
                            </Card>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                                <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Selecione um Aluno</h3>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchoolRecords;
