
import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './common/Card';
import { SpinnerIcon } from '../constants/index';
import { useNavigation } from '../contexts/NavigationContext';
import type { ActivityItem } from '../types';
import { useToast } from '../contexts/ToastContext';
import { generateFeedbackAndGrade } from '../utils/gradingAI';
import { useTeacherGrading } from '../hooks/teacher/useTeacherGrading';
import { useAuth } from '../contexts/AuthContext';

// Sub-components
import { StudentListSidebar } from './grading/StudentListSidebar';
import { QuestionGradingCard } from './grading/QuestionGradingCard';
import { GradingControls } from './grading/GradingControls';

const TeacherGradingView: React.FC = () => {
    const { gradingActivity, exitGrading } = useNavigation();
    const { user } = useAuth();
    const { addToast } = useToast();

    // Hook Data
    const { activity, submissions, isLoading, gradeMutation } = useTeacherGrading(gradingActivity?.id, user);

    // UI State
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'graded'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Grade Form State
    const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
    const [currentGrade, setCurrentGrade] = useState<string>('');
    const [currentFeedback, setCurrentFeedback] = useState<string>('');
    const [manualOverrides, setManualOverrides] = useState<Set<string>>(new Set());

    // AI Loading State
    const [gradingItemIds, setGradingItemIds] = useState<Set<string>>(new Set());
    const [isGradingAll, setIsGradingAll] = useState(false);

    const isSaving = gradeMutation.isPending;

    // Derived Data
    const filteredSubmissions = useMemo(() => {
        return submissions.filter(s => {
            const matchesStatus = filterStatus === 'all' 
                ? true 
                : filterStatus === 'pending' 
                    ? s.status === 'Aguardando correção'
                    : s.status === 'Corrigido';
            
            const matchesSearch = s.studentName.toLowerCase().includes(searchTerm.toLowerCase());
            
            return matchesStatus && matchesSearch;
        });
    }, [submissions, filterStatus, searchTerm]);

    const selectedSubmission = useMemo(() => 
        submissions.find(s => s.studentId === selectedStudentId), 
    [submissions, selectedStudentId]);

    const currentIndex = useMemo(() => 
        filteredSubmissions.findIndex(s => s.studentId === selectedStudentId),
    [filteredSubmissions, selectedStudentId]);

    const isLast = currentIndex === -1 || currentIndex === filteredSubmissions.length - 1;

    const items = useMemo((): ActivityItem[] => {
        if (!activity) return [];
        if (activity.items && activity.items.length > 0) return activity.items;
        if (activity.questions && activity.questions.length > 0) {
            return activity.questions.map((q: any) => ({
                id: q.id.toString(),
                type: 'multiple_choice',
                question: q.question,
                options: q.choices,
                correctOptionId: q.correctAnswerId,
                points: 1
            } as ActivityItem));
        }
        return [];
    }, [activity]);

    // Parse Answers
    const studentAnswers = useMemo(() => {
        if (!selectedSubmission?.content) return {};
        try {
            return JSON.parse(selectedSubmission.content);
        } catch {
            return {}; 
        }
    }, [selectedSubmission]);

    const isLegacySubmission = selectedSubmission && !selectedSubmission.content.startsWith('{');

    // Sync form with selected student & Auto-Grade MC
    useEffect(() => {
        if (selectedSubmission && activity) {
            setManualOverrides(new Set()); // Reset overrides

            const initialScores: Record<string, number> = {};
            const savedScores = selectedSubmission.scores || {};
            
            items.forEach(item => {
                if (savedScores[item.id] !== undefined) {
                    initialScores[item.id] = savedScores[item.id];
                } else {
                    if (item.type === 'multiple_choice' && item.correctOptionId) {
                        const answer = studentAnswers[item.id];
                        if (answer === item.correctOptionId) {
                            initialScores[item.id] = item.points;
                        } else {
                            initialScores[item.id] = 0;
                        }
                    } else {
                        initialScores[item.id] = 0;
                    }
                }
            });
            
            setQuestionScores(initialScores);
            setCurrentFeedback(selectedSubmission.feedback || '');
            const total = (Object.values(initialScores) as number[]).reduce((acc, curr) => acc + (curr || 0), 0);
            setCurrentGrade(total.toString());
        }
    }, [selectedSubmission, activity, items, studentAnswers]);

    // Auto-Summation
    useEffect(() => {
        if (selectedSubmission) {
            const total = (Object.values(questionScores) as number[]).reduce((acc, curr) => acc + (curr || 0), 0);
            setCurrentGrade(Math.round(total * 10) / 10 + "");
        }
    }, [questionScores, selectedSubmission]);

    const handleScoreChange = (itemId: string, val: string) => {
        const num = parseFloat(val);
        setQuestionScores(prev => ({
            ...prev,
            [itemId]: isNaN(num) ? 0 : num
        }));
    };

    const toggleManualOverride = (itemId: string) => {
        setManualOverrides(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
                const item = items.find(i => i.id === itemId);
                if (item && item.type === 'multiple_choice' && item.correctOptionId) {
                    const answer = studentAnswers[item.id];
                    const autoScore = (answer === item.correctOptionId) ? item.points : 0;
                    setQuestionScores(s => ({ ...s, [itemId]: autoScore }));
                }
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const handleGradeWithAI = async (itemId: string) => {
        const item = items.find(i => i.id === itemId);
        const answer = studentAnswers[itemId];
        if (!item || !answer) return;

        setGradingItemIds(prev => new Set(prev).add(itemId));
        try {
            const result = await generateFeedbackAndGrade(item.question, answer, item.points);
            setQuestionScores(prev => ({ ...prev, [itemId]: result.grade }));
            const feedbackToAdd = `\n[IA - Questão ${items.indexOf(item) + 1}]: ${result.feedback}`;
            setCurrentFeedback(prev => prev ? prev + feedbackToAdd : feedbackToAdd.trim());
            addToast("Questão corrigida pela IA!", "success");
        } catch (error) {
            addToast("Erro ao corrigir com IA.", "error");
        } finally {
            setGradingItemIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(itemId);
                return newSet;
            });
        }
    };

    const handleGradeAllWithAI = async () => {
        setIsGradingAll(true);
        try {
            const textItems = items.filter(i => i.type === 'text');
            let accumulatedFeedback = currentFeedback;
            const newScores = { ...questionScores };

            for (const item of textItems) {
                const answer = studentAnswers[item.id];
                if (answer) {
                    setGradingItemIds(prev => new Set(prev).add(item.id));
                    try {
                        const result = await generateFeedbackAndGrade(item.question, answer, item.points);
                        newScores[item.id] = result.grade;
                        accumulatedFeedback += `\n\n[IA - Questão ${items.indexOf(item) + 1}]: ${result.feedback}`;
                    } catch (e) { console.error(e); }
                    setGradingItemIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(item.id);
                        return newSet;
                    });
                }
            }
            setQuestionScores(newScores);
            setCurrentFeedback(accumulatedFeedback.trim());
            addToast("Correção automática concluída!", "success");
        } catch (error) {
            addToast("Erro ao executar correção em massa.", "error");
        } finally {
            setIsGradingAll(false);
        }
    };

    const handleSave = async (action: 'stay' | 'next' | 'exit') => {
        if (!activity || !selectedSubmission) return;
        
        const gradeNum = parseFloat(currentGrade.replace(',', '.'));
        if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > activity.points) {
            addToast(`Nota final inválida. Máximo: ${activity.points}`, "error");
            return;
        }

        try {
            await gradeMutation.mutateAsync({
                studentId: selectedSubmission.studentId,
                grade: gradeNum,
                feedback: currentFeedback,
                scores: questionScores
            });

            addToast("Correção salva!", "success");

            if (action === 'next') {
                if (currentIndex < filteredSubmissions.length - 1) {
                    setSelectedStudentId(filteredSubmissions[currentIndex + 1].studentId);
                } else {
                    exitGrading();
                }
            } else if (action === 'exit') {
                exitGrading();
            }
        } catch (error) {
            addToast("Erro ao salvar nota.", "error");
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-full"><SpinnerIcon className="text-indigo-500 h-10 w-10" /></div>;
    if (!activity) return <div className="p-8 text-center">Atividade não encontrada.</div>;

    const hasTextQuestions = items.some(i => i.type === 'text');

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-6">
            <StudentListSidebar 
                submissions={filteredSubmissions}
                selectedStudentId={selectedStudentId}
                onSelectStudent={setSelectedStudentId}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onExit={exitGrading}
            />

            {/* Main Content */}
            <div className={`flex-1 flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-900/30 rounded-xl border dark:border-slate-700 relative ${selectedStudentId ? 'flex' : 'hidden md:flex'}`}>
                {selectedSubmission ? (
                    <>
                        <div className="md:hidden p-2 bg-white dark:bg-slate-800 border-b dark:border-slate-700">
                            <button onClick={() => setSelectedStudentId(null)} className="flex items-center text-indigo-600 dark:text-indigo-400 text-sm font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                Voltar para Lista
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pb-32">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedSubmission.studentName}</h1>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {new Date(selectedSubmission.submissionDate).toLocaleString()}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${selectedSubmission.status === 'Corrigido' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                    {selectedSubmission.status}
                                </span>
                            </div>

                            {isLegacySubmission ? (
                                <Card>
                                    <h3 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-100">Resposta do Aluno (Texto)</h3>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded border dark:border-slate-700 font-mono whitespace-pre-wrap text-sm">
                                        {selectedSubmission.content}
                                    </div>
                                </Card>
                            ) : (
                                <div className="space-y-6">
                                    {items.map((item, idx) => (
                                        <QuestionGradingCard 
                                            key={item.id}
                                            item={item}
                                            index={idx}
                                            answer={studentAnswers[item.id]}
                                            score={questionScores[item.id] || 0}
                                            onScoreChange={(val) => handleScoreChange(item.id, val)}
                                            onGradeWithAI={() => handleGradeWithAI(item.id)}
                                            isGradingThis={gradingItemIds.has(item.id)}
                                            manualOverride={manualOverrides.has(item.id)}
                                            onToggleOverride={() => toggleManualOverride(item.id)}
                                        />
                                    ))}
                                </div>
                            )}
                            
                            <GradingControls 
                                currentFeedback={currentFeedback}
                                setCurrentFeedback={setCurrentFeedback}
                                currentGrade={currentGrade}
                                maxPoints={activity.points}
                                isSaving={isSaving}
                                isLast={isLast}
                                onSave={handleSave}
                                hasTextQuestions={hasTextQuestions}
                                isGradingAll={isGradingAll}
                                onGradeAllWithAI={handleGradeAllWithAI}
                                isLegacySubmission={isLegacySubmission}
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <p>Selecione um aluno à esquerda para começar a corrigir.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeacherGradingView;
