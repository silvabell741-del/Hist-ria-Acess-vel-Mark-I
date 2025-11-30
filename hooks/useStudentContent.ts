
import { useState, useCallback, useMemo } from 'react';
import { 
    collection, query, where, getDocs, doc, getDoc, 
    limit, updateDoc, arrayUnion, increment, 
    serverTimestamp, setDoc, writeBatch, documentId, collectionGroup
} from 'firebase/firestore';
import { db } from '../components/firebaseClient';
import { useToast } from '../contexts/ToastContext';
import type { Module, Quiz, Activity, TeacherClass, User, ActivitySubmission } from '../types';
import { createNotification } from '../utils/createNotification';
import { processGamificationEvent } from '../utils/gamificationEngine';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useStudentContent(user: User | null) {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    
    // UI State (Search/Filters)
    const [searchedModules, setSearchedModules] = useState<Module[]>([]);
    const [searchedQuizzes, setSearchedQuizzes] = useState<Quiz[]>([]);
    const [isSearchingQuizzes, setIsSearchingQuizzes] = useState(false);
    
    const [moduleFilters, setModuleFilters] = useState({
        queryText: '',
        serie: 'all',
        materia: 'all',
        status: 'Em andamento',
        scope: 'my_modules' as 'my_modules' | 'public'
    });

    const isStudent = user?.role === 'aluno';

    // --- 1. QUERY: Student Classes ---
    const { data: studentClasses = [], isLoading: isLoadingClasses } = useQuery({
        queryKey: ['studentClasses', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const classesQuery = query(
                collection(db, "classes"), 
                where("studentIds", "array-contains", user.id)
            );
            const classesSnap = await getDocs(classesQuery);
            return classesSnap.docs
                .map(d => {
                    const data = d.data();
                    const studentRecord = (data.students || []).find((s: any) => s.id === user.id);
                    if (studentRecord && studentRecord.status === 'inactive') return null;

                    const notices = (Array.isArray(data.notices) ? data.notices : []).map((n: any) => ({
                        ...n,
                        timestamp: n.timestamp?.toDate ? n.timestamp.toDate().toISOString() : n.timestamp
                    }));
                    return { id: d.id, ...data, notices } as TeacherClass;
                })
                .filter((c): c is TeacherClass => c !== null);
        },
        enabled: isStudent && !!user,
        // Removed staleTime override to use global 0 setting
    });

    // --- 2. QUERY: Module Progress ---
    const { data: inProgressModules = [], isLoading: isLoadingProgress } = useQuery({
        queryKey: ['studentModulesProgress', user?.id],
        queryFn: async () => {
            if (!user) return [];
            const progressColRef = collection(db, "users", user.id, "modulesProgress");
            const progressSnap = await getDocs(progressColRef);
            
            const modulesToFetch: string[] = [];
            const progressMap: Record<string, number> = {};

            progressSnap.forEach(doc => {
                const data = doc.data();
                if (data.progress > 0 && data.progress < 100) {
                    modulesToFetch.push(doc.id);
                    progressMap[doc.id] = data.progress;
                }
            });

            if (modulesToFetch.length === 0) return [];

            const chunks = [];
            for (let i = 0; i < modulesToFetch.length; i += 10) {
                chunks.push(modulesToFetch.slice(i, i + 10));
            }

            const fetchedModules: Module[] = [];
            for (const chunk of chunks) {
                const q = query(collection(db, "modules"), where(documentId(), "in", chunk));
                const snap = await getDocs(q);
                snap.forEach(d => {
                    fetchedModules.push({ 
                        id: d.id, 
                        ...d.data(), 
                        progress: progressMap[d.id] 
                    } as Module);
                });
            }
            return fetchedModules;
        },
        enabled: isStudent && !!user,
    });

    // --- 3. QUERY: User Submissions ---
    const { data: userSubmissions = {}, isLoading: isLoadingSubmissions } = useQuery({
        queryKey: ['studentSubmissions', user?.id],
        queryFn: async () => {
            if (!user) return {};
            try {
                const q = query(collectionGroup(db, 'submissions'), where('studentId', '==', user.id));
                const snap = await getDocs(q);
                
                const subsMap: Record<string, ActivitySubmission> = {};
                snap.forEach(d => {
                    const activityId = d.ref.parent.parent?.id; 
                    if (activityId) {
                        subsMap[activityId] = d.data() as ActivitySubmission;
                    }
                });
                return subsMap;
            } catch (error: any) {
                return {};
            }
        },
        enabled: isStudent && !!user,
        // Removed staleTime override to use global 0 setting
    });

    // --- MUTATIONS ---

    const joinClassMutation = useMutation({
        mutationFn: async (code: string) => {
            if (!user) throw new Error("User not authenticated");
            const q = query(collection(db, "classes"), where("code", "==", code));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("Turma não encontrada com este código.");
            }

            const classDoc = querySnapshot.docs[0];
            const classData = classDoc.data();

            if (classData.studentIds?.includes(user.id)) {
                const currentStudents = classData.students || [];
                const me = currentStudents.find((s: any) => s.id === user.id);
                if (me && me.status === 'inactive') {
                    const updatedStudents = currentStudents.map((s: any) => 
                        s.id === user.id ? { ...s, status: 'active' } : s
                    );
                    await updateDoc(doc(db, "classes", classDoc.id), {
                        students: updatedStudents,
                        studentCount: increment(1)
                    });
                    return { success: true, message: `Bem-vindo de volta à turma ${classData.name}!` };
                }
                return { success: false, message: "Você já está nesta turma." };
            }

            const classRef = doc(db, "classes", classDoc.id);
            await updateDoc(classRef, {
                studentIds: arrayUnion(user.id),
                students: arrayUnion({ id: user.id, name: user.name, avatarUrl: user.avatarUrl || "", status: 'active' }),
                studentCount: increment(1)
            });

            return { success: true, message: `Você entrou na turma ${classData.name}!` };
        },
        onSuccess: (data) => {
            if (data.success) {
                addToast(data.message, "success");
                queryClient.invalidateQueries({ queryKey: ['studentClasses'] });
            } else {
                addToast(data.message, "info");
            }
        },
        onError: (error: any) => {
            addToast(error.message || "Erro ao entrar na turma.", "error");
        }
    });

    const leaveClassMutation = useMutation({
        mutationFn: async (classId: string) => {
            if (!user) throw new Error("User not authenticated");
            const classRef = doc(db, "classes", classId);
            const classSnap = await getDoc(classRef);
            
            if (classSnap.exists()) {
                const classData = classSnap.data();
                const currentStudents = classData.students || [];
                const updatedStudents = currentStudents.map((s: any) => {
                    if (s.id === user.id) {
                        return { ...s, status: 'inactive' };
                    }
                    return s;
                });
                await updateDoc(classRef, {
                    students: updatedStudents,
                    studentCount: increment(-1)
                });
            }
        },
        onSuccess: () => {
            addToast("Você saiu da turma.", "success");
            queryClient.invalidateQueries({ queryKey: ['studentClasses'] });
        },
        onError: () => {
            addToast("Erro ao sair da turma.", "error");
        }
    });

    const submitActivityMutation = useMutation({
        mutationFn: async ({ activityId, content }: { activityId: string, content: string }) => {
            if (!user) throw new Error("User not authenticated");

            const activityRef = doc(db, "activities", activityId);
            const activitySnap = await getDoc(activityRef);
            
            if (!activitySnap.exists()) throw new Error("Atividade não existe");
            const activityData = activitySnap.data() as Activity;

            // Grade Calculation
            let answersMap: Record<string, string> = {};
            try { answersMap = JSON.parse(content); } catch { /* legacy */ }

            let calculatedGrade = 0;
            let hasTextQuestions = false;
            const items = activityData.items || [];

            if (items.length > 0) {
                items.forEach(item => {
                    if (item.type === 'text') hasTextQuestions = true;
                    else if (item.type === 'multiple_choice' && item.correctOptionId) {
                        if (answersMap[item.id] === item.correctOptionId) calculatedGrade += (item.points || 0);
                    }
                });
            }

            const gradingMode = activityData.gradingConfig?.objectiveQuestions || 'automatic';
            let status: 'Aguardando correção' | 'Corrigido' = 'Aguardando correção';
            
            if (gradingMode === 'automatic' && !hasTextQuestions && items.length > 0) {
                status = 'Corrigido';
            }

            const submissionData: ActivitySubmission = {
                studentId: user.id,
                studentName: user.name,
                studentAvatarUrl: user.avatarUrl || '', 
                studentSeries: user.series || '', 
                submissionDate: new Date().toISOString(),
                content: content,
                status: status,
            };

            if (status === 'Corrigido') {
                submissionData.grade = calculatedGrade;
                submissionData.gradedAt = new Date().toISOString();
                submissionData.feedback = "Correção automática.";
            }

            // Write to subcollection
            const submissionRef = doc(db, "activities", activityId, "submissions", user.id);
            const submissionSnap = await getDoc(submissionRef);
            const isUpdate = submissionSnap.exists();

            await setDoc(submissionRef, { ...submissionData, timestamp: serverTimestamp() }, { merge: true });

            // Counters
            if (!isUpdate) {
                await updateDoc(activityRef, {
                    submissionCount: increment(1),
                    pendingSubmissionCount: increment(status === 'Aguardando correção' ? 1 : 0)
                });
            }

            // Notifications & Gamification
            if (status === 'Corrigido') {
                 await createNotification({
                    userId: user.id, actorId: 'system', actorName: 'Sistema', type: 'activity_correction',
                    title: 'Atividade Corrigida Automaticamente', text: `Sua atividade "${activityData.title}" foi corrigida. Nota: ${calculatedGrade}`,
                    classId: activityData.classId!, activityId: activityId
                });
            }

            await processGamificationEvent(user.id, 'activity_sent', 0);
            return { success: true };
        },
        onSuccess: () => {
            addToast("Atividade enviada com sucesso!", "success");
            // Robust invalidation to force UI update immediately
            queryClient.invalidateQueries({ queryKey: ['studentSubmissions'] });
            queryClient.invalidateQueries({ queryKey: ['activities'] });
            queryClient.invalidateQueries({ queryKey: ['studentModulesProgress'] });
        },
        onError: (error: any) => {
            console.error("Submission error:", error);
            if (error.code === 'permission-denied') {
                addToast("Erro de permissão. Tente recarregar.", "error");
            } else {
                addToast("Erro ao enviar. Tente novamente.", "error");
            }
        }
    });

    const handleJoinClass = async (code: string) => {
        const result = await joinClassMutation.mutateAsync(code);
        return result?.success || false;
    };

    const handleLeaveClass = (classId: string) => {
        leaveClassMutation.mutate(classId);
    };

    const handleActivitySubmit = async (activityId: string, content: string) => {
        // Direct mutation call. Firebase SDK handles offline queuing natively now.
        // We catch errors to inform the user if something critical fails immediately (e.g. auth issues).
        // Network errors are retried by Firebase internally when connection restores.
        try {
            await submitActivityMutation.mutateAsync({ activityId, content });
        } catch (e) {
            // Error is handled in onError of mutation
        }
    };

    const searchQuizzes = useCallback(async (filters: { 
        serie?: string; 
        materia?: string;
        status?: 'feito' | 'nao_iniciado' | 'all';
    }) => {
        if (!user) return;
        setIsSearchingQuizzes(true);
        setSearchedQuizzes([]);

        try {
            let q = query(collection(db, "quizzes"), where("status", "==", "Ativo"), limit(20));

            if (filters.serie && filters.serie !== 'all') {
                q = query(q, where("series", "array-contains", filters.serie));
            }

            const filterMateriaClientSide = filters.serie && filters.serie !== 'all' && filters.materia && filters.materia !== 'all';

            if (!filterMateriaClientSide && filters.materia && filters.materia !== 'all') {
                 q = query(q, where("materia", "array-contains", filters.materia));
            }

            const snap = await getDocs(q);
            let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Quiz));

            if (filterMateriaClientSide) {
                results = results.filter(qz => {
                    const mat = Array.isArray(qz.materia) ? qz.materia : [qz.materia];
                    return mat.includes(filters.materia!);
                });
            }

            let attemptsMap: Record<string, number> = {};
            try {
                const attemptsSnap = await getDocs(collection(db, "users", user.id, "quiz_results"));
                attemptsSnap.forEach(d => attemptsMap[d.id] = d.data().attempts || 0);
            } catch(e) { /* ignore */ }

            const finalQuizzes = results.map(qz => ({ ...qz, attempts: attemptsMap[qz.id] || 0 }));

            let filteredByStatus = finalQuizzes;
            if (filters.status && filters.status !== 'all') {
                filteredByStatus = finalQuizzes.filter(qz => {
                    if (filters.status === 'feito') return qz.attempts > 0;
                    if (filters.status === 'nao_iniciado') return qz.attempts === 0;
                    return true;
                });
            }

            setSearchedQuizzes(filteredByStatus);
            if (filteredByStatus.length === 0 && navigator.onLine) {
                addToast("Nenhum quiz encontrado.", "info");
            }

        } catch (error) {
            console.error("Quiz search error:", error);
            if (navigator.onLine) addToast("Erro ao buscar quizzes.", "error");
        } finally {
            setIsSearchingQuizzes(false);
        }
    }, [user, addToast]);

    const refreshContent = async (force?: boolean) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['studentClasses'] }),
            queryClient.invalidateQueries({ queryKey: ['studentModulesProgress'] }),
            queryClient.invalidateQueries({ queryKey: ['studentSubmissions'] })
        ]);
    };
    
    // Legacy Placeholders (handled by components)
    const searchModules = async () => {};
    const searchActivities = async () => ({ activities: [], lastDoc: null });
    
    const handleModuleProgressUpdate = async (moduleId: string, progress: number) => {
        if (!user) return;
        const ref = doc(db, "users", user.id, "modulesProgress", moduleId);
        await setDoc(ref, { progress: Math.round(progress), lastUpdated: serverTimestamp() }, { merge: true });
        queryClient.invalidateQueries({ queryKey: ['studentModulesProgress'] });
    };
    
    const handleModuleComplete = async (moduleId: string) => {
        if (!user) return;
        const ref = doc(db, "users", user.id, "modulesProgress", moduleId);
        await setDoc(ref, { progress: 100, completedAt: serverTimestamp(), status: 'Concluído' }, { merge: true });
        await processGamificationEvent(user.id, 'module_complete', 50);
        addToast("Módulo concluído! +50 XP", "success");
        queryClient.invalidateQueries({ queryKey: ['studentModulesProgress'] });
    };

    return {
        studentClasses,
        inProgressModules,
        userSubmissions,
        searchedModules,
        searchedQuizzes,
        moduleFilters,
        isLoading: isLoadingClasses || isLoadingProgress || isLoadingSubmissions,
        isSearchingModules: false,
        isSearchingQuizzes,
        refreshContent,
        searchModules,
        searchQuizzes,
        searchActivities,
        handleJoinClass,
        handleLeaveClass,
        handleActivitySubmit,
        handleModuleProgressUpdate,
        handleModuleComplete,
        setSearchedQuizzes,
        setSearchedModules
    };
}
