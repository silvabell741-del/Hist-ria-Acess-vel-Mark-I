
import { useState, useCallback, useEffect } from 'react';
import { 
    collection, query, where, getDocs, doc, getDoc, 
    orderBy, limit, startAfter, QueryDocumentSnapshot,
    updateDoc, arrayUnion, arrayRemove, increment, addDoc, serverTimestamp, setDoc, writeBatch, documentId, collectionGroup
} from 'firebase/firestore';
import { db } from '../components/firebaseClient';
import { useToast } from '../contexts/ToastContext';
import type { Module, Quiz, Activity, TeacherClass, User, ActivitySubmission } from '../types';
import { createNotification } from '../utils/createNotification';
import { processGamificationEvent } from '../utils/gamificationEngine';
import { useSync } from '../contexts/SyncContext'; // Import SyncContext

const ACTIVITIES_PER_PAGE = 10;

export function useStudentContent(user: User | null) {
    const { addToast } = useToast();
    const { addOfflineAction } = useSync(); // Use Sync Hook
    
    // Estados separados para diferentes tipos de dados
    const [inProgressModules, setInProgressModules] = useState<Module[]>([]);
    const [searchedModules, setSearchedModules] = useState<Module[]>([]);
    const [searchedQuizzes, setSearchedQuizzes] = useState<Quiz[]>([]);
    
    // Mapa de submissões do usuário: ActivityID -> Submission Data
    // Usado para verificar status "Feito" ou "Nota" na lista de atividades sem ler arrays gigantes
    const [userSubmissions, setUserSubmissions] = useState<Record<string, ActivitySubmission>>({});

    // Filtros persistidos
    const [moduleFilters, setModuleFilters] = useState({
        queryText: '',
        serie: 'all',
        materia: 'all',
        status: 'Em andamento',
        scope: 'my_modules' as 'my_modules' | 'public'
    });
    
    const [studentClasses, setStudentClasses] = useState<TeacherClass[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSearchingModules, setIsSearchingModules] = useState(false);
    const [isSearchingQuizzes, setIsSearchingQuizzes] = useState(false);
    
    // --- CORE REFRESH LOGIC (Graceful Degradation) ---
    // Optimization: Only load Classes and Progress. Modules/Activities are handled by Infinite Query components.
    const refreshContent = useCallback(async (forceRefresh = false) => {
        if (!user || user.role !== 'aluno') {
            setIsLoading(false);
            return;
        }
        
        setIsLoading(true);

        // 1. Função independente para buscar turmas
        const fetchClasses = async () => {
            try {
                const classesQuery = query(
                    collection(db, "classes"), 
                    where("studentIds", "array-contains", user.id)
                );
                const classesSnap = await getDocs(classesQuery);

                const myClasses: TeacherClass[] = [];
                
                classesSnap.docs.forEach(d => {
                    const data = d.data();
                    const studentRecord = (data.students || []).find((s: any) => s.id === user.id);
                    if (!studentRecord || studentRecord.status !== 'inactive') {
                        const notices = (Array.isArray(data.notices) ? data.notices : []).map((n: any) => ({
                            ...n,
                            timestamp: n.timestamp?.toDate ? n.timestamp.toDate().toISOString() : n.timestamp
                        }));
                        myClasses.push({ id: d.id, ...data, notices } as TeacherClass);
                    }
                });
                
                setStudentClasses(myClasses);
            } catch (error: any) {
                console.warn("Falha parcial ao carregar turmas:", error);
                if (error.code !== 'permission-denied') {
                    if (navigator.onLine) {
                        addToast("Não foi possível carregar suas turmas.", "error");
                    }
                }
                setStudentClasses([]);
            }
        };

        // 2. Função independente para buscar progresso de módulos
        const fetchProgress = async () => {
            try {
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

                if (modulesToFetch.length > 0) {
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
                    setInProgressModules(fetchedModules);
                } else {
                    setInProgressModules([]);
                }
            } catch (error: any) {
                console.warn("Falha parcial ao carregar progresso:", error);
                setInProgressModules([]);
            }
        };

        // 3. Buscar todas as submissões do aluno (Collection Group)
        // Isso permite saber quais atividades o aluno já fez sem ler os documentos das atividades
        const fetchSubmissions = async () => {
            try {
                // Query em todas as coleções chamadas 'submissions' onde studentId é o usuário atual.
                // Isso exige que o documento de submissão tenha o campo 'studentId'.
                const q = query(collectionGroup(db, 'submissions'), where('studentId', '==', user.id));
                const snap = await getDocs(q);
                
                const subsMap: Record<string, ActivitySubmission> = {};
                snap.forEach(d => {
                    // O pai do documento de submissão é a atividade
                    const activityId = d.ref.parent.parent?.id; 
                    if (activityId) {
                        subsMap[activityId] = d.data() as ActivitySubmission;
                    }
                });
                setUserSubmissions(subsMap);
            } catch (error: any) {
                // Tratamento silencioso para permissões ou falta de índice
                if (error.code === 'permission-denied' || error.code === 'failed-precondition') {
                    // console.debug("Fetch submissions collectionGroup skipped:", error.message);
                    // Não limpamos userSubmissions aqui para manter estado otimista se houver
                } else {
                    console.warn("Falha ao carregar submissões:", error);
                }
            }
        };

        // Executa em paralelo
        await Promise.allSettled([fetchClasses(), fetchProgress(), fetchSubmissions()]);
        
        setIsLoading(false);
    }, [user, addToast]);

    useEffect(() => {
        if (user) {
            refreshContent();
        }
    }, [user, refreshContent]);


    // --- SEARCH MODULES (Legacy Wrapper) ---
    const searchModules = useCallback(async (filters: any) => {
        // Implementation replaced by React Query in components
    }, []);


    // --- SEARCH QUIZZES (On Demand) ---
    const searchQuizzes = useCallback(async (filters: { 
        serie?: string; 
        materia?: string;
        status?: 'feito' | 'nao_iniciado' | 'all';
    }) => {
        if (!user) return;
        setIsSearchingQuizzes(true);
        setSearchedQuizzes([]);

        try {
            let q = query(
                collection(db, "quizzes"),
                where("status", "==", "Ativo"),
                limit(20)
            );

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

            const finalQuizzes = results.map(qz => ({
                ...qz,
                attempts: attemptsMap[qz.id] || 0
            }));

            let filteredByStatus = finalQuizzes;
            if (filters.status && filters.status !== 'all') {
                filteredByStatus = finalQuizzes.filter(qz => {
                    if (filters.status === 'feito') return qz.attempts > 0;
                    if (filters.status === 'nao_iniciado') return qz.attempts === 0;
                    return true;
                });
            }

            setSearchedQuizzes(filteredByStatus);

            if (filteredByStatus.length === 0) {
                if (navigator.onLine) addToast("Nenhum quiz encontrado.", "info");
            }

        } catch (error) {
            console.error("Quiz search error:", error);
            if (navigator.onLine) addToast("Erro ao buscar quizzes.", "error");
        } finally {
            setIsSearchingQuizzes(false);
        }
    }, [user, addToast]);


    // --- SEARCH ACTIVITIES (Legacy Wrapper) ---
    const searchActivities = useCallback(async (
        filters: any,
        lastDoc?: QueryDocumentSnapshot | null
    ): Promise<any> => {
        // Implementation replaced by React Query in components
        return { activities: [], lastDoc: null };
    }, []);


    // --- ACTIONS ---
    const handleJoinClass = async (code: string): Promise<boolean> => {
        if (!user) return false;
        try {
            const q = query(collection(db, "classes"), where("code", "==", code));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                addToast("Turma não encontrada com este código.", "error");
                return false;
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
                    addToast(`Bem-vindo de volta à turma ${classData.name}!`, "success");
                    await refreshContent(true);
                    return true;
                }

                addToast("Você já está nesta turma.", "info");
                return false;
            }

            const classRef = doc(db, "classes", classDoc.id);
            await updateDoc(classRef, {
                studentIds: arrayUnion(user.id),
                students: arrayUnion({ id: user.id, name: user.name, avatarUrl: user.avatarUrl || "", status: 'active' }),
                studentCount: increment(1)
            });

            addToast(`Você entrou na turma ${classData.name}!`, "success");
            await refreshContent(true); 
            return true;
        } catch (error) {
            console.error("Error joining class:", error);
            addToast("Erro ao entrar na turma.", "error");
            return false;
        }
    };

    const handleLeaveClass = async (classId: string) => {
        if (!user) return;
        try {
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

                setStudentClasses(prev => prev.filter(c => c.id !== classId));
                addToast("Você saiu da turma.", "success");
            }
        } catch (error) {
            console.error("Error leaving class:", error);
            addToast("Erro ao sair da turma. Verifique sua conexão.", "error");
            throw error;
        }
    };

    const handleActivitySubmit = async (activityId: string, content: string) => {
        if (!user) return;

        // OFFLINE QUEUE CHECK
        if (!navigator.onLine) {
            try {
                let activityData: any = {};
                const activityRef = doc(db, "activities", activityId);
                const activitySnap = await getDoc(activityRef); 
                if (activitySnap.exists()) {
                    activityData = activitySnap.data();
                }

                await addOfflineAction('SUBMIT_ACTIVITY', {
                    activityId,
                    content,
                    user: { id: user.id, name: user.name },
                    activityData 
                });

                addToast("Sem conexão. Salvo para envio automático.", "info");
                return;

            } catch (e) {
                console.error("Failed to queue offline action", e);
                addToast("Erro ao salvar offline.", "error");
                return;
            }
        }

        // ONLINE FLOW
        try {
            const activityRef = doc(db, "activities", activityId);
            const activitySnap = await getDoc(activityRef);
            
            if (!activitySnap.exists()) throw new Error("Atividade não existe");
            const activityData = activitySnap.data() as Activity;

            let answersMap: Record<string, string> = {};
            try { answersMap = JSON.parse(content); } catch { /* legacy text */ }

            let calculatedGrade = 0;
            let hasTextQuestions = false;
            const items = activityData.items || [];

            if (items.length > 0) {
                items.forEach(item => {
                    if (item.type === 'text') {
                        hasTextQuestions = true;
                    } else if (item.type === 'multiple_choice' && item.correctOptionId) {
                        if (answersMap[item.id] === item.correctOptionId) {
                            calculatedGrade += (item.points || 0);
                        }
                    }
                });
            }

            const gradingMode = activityData.gradingConfig?.objectiveQuestions || 'automatic';
            let status: 'Aguardando correção' | 'Corrigido' = 'Aguardando correção';
            
            if (gradingMode === 'automatic' && !hasTextQuestions && items.length > 0) {
                status = 'Corrigido';
            }

            // DENORMALIZATION: Student info stored in subcollection document
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

            const submissionRef = doc(db, "activities", activityId, "submissions", user.id);
            
            // PHASE 3 OPTIMIZATION: Check if it's an update or new submission
            // We do a read here to properly maintain counters.
            const submissionSnap = await getDoc(submissionRef);
            const isUpdate = submissionSnap.exists();

            await setDoc(submissionRef, { ...submissionData, timestamp: serverTimestamp() });

            // SCALABILITY FIX: Do NOT update parent 'submissions' array.
            // Only update counters atomically.
            if (!isUpdate) {
                try {
                    await updateDoc(activityRef, {
                        submissionCount: increment(1),
                        pendingSubmissionCount: increment(status === 'Aguardando correção' ? 1 : 0)
                    });
                } catch (updateError: any) {
                    // Logamos o erro mas não interrompemos, pois o documento principal (submissão) foi salvo.
                    console.error("Falha ao atualizar contadores da atividade (permissão ou concorrência):", updateError);
                }
            }

            // Update local state map immediately
            setUserSubmissions(prev => ({
                ...prev,
                [activityId]: submissionData
            }));

            if (status === 'Corrigido') {
                 await createNotification({
                    userId: user.id, actorId: 'system', actorName: 'Sistema', type: 'activity_correction',
                    title: 'Atividade Corrigida Automaticamente', text: `Sua atividade "${activityData.title}" foi corrigida. Nota: ${calculatedGrade}`,
                    classId: activityData.classId!, activityId: activityId
                });
            }

            // PROCESSA GAMIFICAÇÃO
            const unlockedAchievements = await processGamificationEvent(user.id, 'activity_sent', 0);
            
            addToast("Atividade enviada com sucesso!", "success");
            
            if (unlockedAchievements.length > 0) {
                unlockedAchievements.forEach(ach => {
                    addToast(`🏆 Conquista Desbloqueada: ${ach.title}`, 'success');
                });
            }

        } catch (error: any) {
            console.error("Error submitting activity:", error);
            // Mensagem amigável se for permissão
            if (error.code === 'permission-denied') {
                addToast("Erro de permissão ao salvar. Tente recarregar a página.", "error");
            } else {
                addToast("Erro ao enviar atividade.", "error");
            }
        }
    };

    const handleModuleProgressUpdate = async (moduleId: string, progress: number) => {
        if (!user) return;
        try {
            const userProgRef = doc(db, "users", user.id, "modulesProgress", moduleId);
            await setDoc(userProgRef, {
                progress: Math.round(progress),
                lastUpdated: serverTimestamp()
            }, { merge: true });
            
            setInProgressModules(prev => prev.map(m => m.id === moduleId ? { ...m, progress } : m));
            setSearchedModules(prev => prev.map(m => m.id === moduleId ? { ...m, progress } : m));
        } catch (error) {
            console.error("Background progress save failed", error);
        }
    };

    const handleModuleComplete = async (moduleId: string) => {
        if (!user) return;
        try {
            const userProgRef = doc(db, "users", user.id, "modulesProgress", moduleId);
            await setDoc(userProgRef, {
                progress: 100,
                completedAt: serverTimestamp(),
                status: 'Concluído'
            }, { merge: true });

            const unlockedAchievements = await processGamificationEvent(user.id, 'module_complete', 50);

            setInProgressModules(prev => prev.map(m => m.id === moduleId ? { ...m, progress: 100 } : m));
            setSearchedModules(prev => prev.map(m => m.id === moduleId ? { ...m, progress: 100 } : m));
            
            addToast("Módulo concluído! +50 XP", "success");
            
            if (unlockedAchievements.length > 0) {
                unlockedAchievements.forEach(ach => {
                    addToast(`🏆 Conquista Desbloqueada: ${ach.title}`, 'success');
                });
            }

        } catch (error) {
            console.error("Error completing module:", error);
            addToast("Erro ao concluir módulo.", "error");
        }
    };

    return {
        inProgressModules,
        searchedModules,
        searchedQuizzes,
        studentClasses,
        moduleFilters,
        userSubmissions, // EXPOSED MAP
        isLoading,
        isSearchingModules,
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
