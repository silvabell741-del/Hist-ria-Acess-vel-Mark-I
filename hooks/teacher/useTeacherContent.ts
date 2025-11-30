
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
    collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, 
    serverTimestamp, increment, setDoc, writeBatch, Timestamp, getDoc 
} from 'firebase/firestore';
import { db } from '../../components/firebaseClient';
import type { Module, Activity, TeacherClass, PendingActivity, StudentGradeSummaryDoc, GradeReportUnidade, Unidade } from '../../types';
import { createNotification } from '../../utils/createNotification';

export function useTeacherContent(
    user: any, 
    addToast: (msg: string, type: any) => void,
    setTeacherClasses: React.Dispatch<React.SetStateAction<TeacherClass[]>>,
    teacherClasses: TeacherClass[]
) {
    const [modules, setModules] = useState<Module[]>([]);
    const [draftActivities, setDraftActivities] = useState<Activity[]>([]);
    const [draftModules, setDraftModules] = useState<Module[]>([]);
    const [pendingActivitiesList, setPendingActivitiesList] = useState<PendingActivity[]>([]); 
    const [isLoadingContent, setIsLoadingContent] = useState(true);
    const [isSubmittingContent, setIsSubmittingContent] = useState(false);
    const [modulesLibraryLoaded, setModulesLibraryLoaded] = useState(false);

    const teacherClassesRef = useRef(teacherClasses);

    useEffect(() => {
        teacherClassesRef.current = teacherClasses;
    }, [teacherClasses]);

    const fetchTeacherContent = useCallback(async (forceRefresh = false) => {
        if (!user) return;
        setIsLoadingContent(true);

        const fetchPending = async () => {
            try {
                const qPending = query(
                    collection(db, "activities"), 
                    where("creatorId", "==", user.id),
                    where("status", "==", "Pendente")
                );
                let snapPending;
                if (!forceRefresh) try { snapPending = await getDocs(qPending); } catch {}
                if (!snapPending || snapPending.empty) snapPending = await getDocs(qPending);
                
                const loadedPendingList: PendingActivity[] = [];
                const fullActivities: Activity[] = [];
                
                snapPending.docs.forEach(d => {
                    const data = d.data();
                    const pendingCount = data.pendingSubmissionCount || 0;
                    const className = data.className || 'Turma desconhecida';
                    
                    fullActivities.push({ id: d.id, ...data, className } as Activity);

                    if (pendingCount > 0) {
                        loadedPendingList.push({
                            id: d.id,
                            title: data.title,
                            className: className,
                            classId: data.classId,
                            pendingCount
                        });
                    }
                });

                setPendingActivitiesList(loadedPendingList);

                setTeacherClasses(prev => prev.map(c => ({
                    ...c,
                    activities: fullActivities.filter(a => a.classId === c.id)
                })));
            } catch (error: any) {
                console.warn("Falha parcial ao carregar pendências:", error);
            }
        };

        const fetchDraftActivities = async () => {
            try {
                const qDrafts = query(
                    collection(db, "activities"),
                    where("creatorId", "==", user.id),
                    where("status", "==", "Rascunho")
                );
                let snapDrafts;
                if (!forceRefresh) try { snapDrafts = await getDocs(qDrafts); } catch {}
                if (!snapDrafts || snapDrafts.empty) snapDrafts = await getDocs(qDrafts);

                const drafts = snapDrafts.docs.map(d => ({ 
                    id: d.id, ...d.data(), 
                    createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : d.data().createdAt
                } as Activity));
                setDraftActivities(drafts);
            } catch (error: any) {
                console.warn("Falha parcial ao carregar rascunhos de atividades:", error);
            }
        };

        const fetchDraftModules = async () => {
            try {
                const qDraftModules = query(
                    collection(db, "modules"),
                    where("creatorId", "==", user.id),
                    where("status", "==", "Rascunho")
                );
                let snapDraftModules;
                if (!forceRefresh) try { snapDraftModules = await getDocs(qDraftModules); } catch {}
                if (!snapDraftModules || snapDraftModules.empty) snapDraftModules = await getDocs(qDraftModules);

                const draftsMod = snapDraftModules.docs.map(d => ({
                    id: d.id, ...d.data(),
                    date: d.data().date?.toDate ? d.data().date.toDate().toISOString() : d.data().date
                } as Module));
                setDraftModules(draftsMod);
            } catch (error: any) {
                console.warn("Falha parcial ao carregar rascunhos de módulos:", error);
            }
        };

        await Promise.allSettled([fetchPending(), fetchDraftActivities(), fetchDraftModules()]);
        setIsLoadingContent(false);

    }, [user, addToast, setTeacherClasses]);

    useEffect(() => {
        if (user) {
            fetchTeacherContent();
        }
    }, [user, fetchTeacherContent]);

    const fetchModulesLibrary = useCallback(async () => {
        if (modulesLibraryLoaded || !user) return;
        try {
            const snapModules = await getDocs(query(collection(db, "modules"), where("status", "==", "Ativo")));
            const fetchedModules = snapModules.docs.map(d => ({ id: d.id, ...d.data() } as Module));
            
            const visibleModules = fetchedModules.filter(m => 
                m.visibility === 'public' || m.creatorId === user.id
            );
            setModules(visibleModules);
            setModulesLibraryLoaded(true);
        } catch (error) {
            console.error("Error loading modules library:", error);
            setModules([]);
        }
    }, [modulesLibraryLoaded, user]);

    /**
     * Atualiza o documento consolidado de notas (Boletim) do aluno.
     * Refatorado para garantir atualização cirúrgica e robustez.
     */
    const recalculateStudentGradeSummary = useCallback(async (
        classId: string, 
        studentId: string, 
        updatedActivityInfo: { activityId: string, title: string, grade: number, maxPoints: number, unidade: Unidade, materia: string },
        fallbackClassName?: string
    ) => {
        try {
            const summaryId = `${classId}_${studentId}`;
            const summaryRef = doc(db, "student_grades", summaryId);
            const summarySnap = await getDoc(summaryRef);
            
            let summaryData: StudentGradeSummaryDoc;
            let className = fallbackClassName || 'Turma';

            // Tenta resolver o nome da turma da memória se não fornecido
            if (className === 'Turma') {
                 const cls = teacherClassesRef.current.find(c => c.id === classId);
                 if (cls) className = cls.name;
            }

            if (summarySnap.exists()) {
                summaryData = summarySnap.data() as StudentGradeSummaryDoc;
                // Atualiza o nome da turma se estiver genérico ou faltando
                if (className !== 'Turma' && (!summaryData.className || summaryData.className === 'Turma')) {
                    summaryData.className = className;
                }
            } else {
                // Se ainda não temos nome e o doc não existe, tenta buscar o documento da turma
                if (className === 'Turma') {
                    try {
                        const classSnap = await getDoc(doc(db, "classes", classId));
                        if (classSnap.exists()) className = classSnap.data().name;
                    } catch (e) { console.warn("Could not fetch class name for summary creation"); }
                }

                summaryData = {
                    classId,
                    studentId,
                    className,
                    unidades: {},
                    updatedAt: serverTimestamp()
                };
            }

            // 2. Localizar e atualizar a atividade específica na estrutura
            const { unidade, materia, activityId, title, grade, maxPoints } = updatedActivityInfo;
            const unidadeKey = unidade || '1ª Unidade';
            const materiaKey = materia || 'Geral';

            if (!summaryData.unidades[unidadeKey]) {
                summaryData.unidades[unidadeKey] = { subjects: {} };
            }
            if (!summaryData.unidades[unidadeKey]!.subjects[materiaKey]) {
                summaryData.unidades[unidadeKey]!.subjects[materiaKey] = { activities: [], totalPoints: 0 };
            }

            const subjectEntry = summaryData.unidades[unidadeKey]!.subjects[materiaKey];
            
            // Verifica se a atividade já existe no relatório
            const existingActivityIndex = subjectEntry.activities.findIndex(a => a.id === activityId);

            if (existingActivityIndex > -1) {
                // Atualizar atividade existente
                const oldGrade = subjectEntry.activities[existingActivityIndex].grade;
                subjectEntry.activities[existingActivityIndex].grade = grade;
                // Atualizar total de pontos (subtrair antigo, somar novo)
                subjectEntry.totalPoints = (subjectEntry.totalPoints - oldGrade) + grade;
            } else {
                // Adicionar nova atividade
                subjectEntry.activities.push({
                    id: activityId,
                    title: title,
                    grade: grade,
                    maxPoints: maxPoints,
                    materia: materiaKey
                });
                subjectEntry.totalPoints += grade;
            }

            summaryData.updatedAt = serverTimestamp();

            // 3. Salvar de volta no Firestore com merge
            await setDoc(summaryRef, summaryData, { merge: true });

        } catch (error) {
            console.error("Failed to update student grade summary:", error);
        }
    }, []);

    // --- Actions ---

    const handleSaveActivity = useCallback(async (activity: Omit<Activity, 'id'>, isDraft: boolean = false) => {
        if (!user) return false;
        try {
            const status = isDraft ? "Rascunho" : "Pendente";
            // Phase 3: No longer initializing 'submissions' array
            const docRef = await addDoc(collection(db, "activities"), { 
                ...activity, status, pendingSubmissionCount: 0, submissionCount: 0, createdAt: serverTimestamp() 
            });
            
            if (isDraft) {
                const newDraft = { id: docRef.id, ...activity, status, pendingSubmissionCount: 0, submissionCount: 0, submissions: [], createdAt: new Date().toISOString() } as Activity;
                setDraftActivities(prev => [newDraft, ...prev]);
                addToast("Atividade salva como rascunho!", "success");
                return true;
            }

            if (activity.classId) {
                const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30);
                await addDoc(collection(db, "broadcasts"), {
                    classId: activity.classId, type: 'activity_post', title: 'Nova Atividade',
                    summary: `O professor ${user.name} postou uma nova atividade: "${activity.title}"`,
                    authorName: user.name, timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt),
                    deepLink: { page: 'activities' }
                });
            }
            addToast("Atividade publicada com sucesso!", "success");
            fetchTeacherContent(true);
            return true;
        } catch (error) { console.error(error); addToast("Erro ao criar atividade.", "error"); return false; }
    }, [user, addToast, fetchTeacherContent]);

    const handleUpdateActivity = useCallback(async (activityId: string, activityData: Partial<Activity>, isDraft: boolean = false) => {
        if (!user) return false;
        try {
            const activityRef = doc(db, "activities", activityId);
            const status = isDraft ? "Rascunho" : "Pendente";
            await updateDoc(activityRef, { ...activityData, status, ...(isDraft ? {} : { createdAt: serverTimestamp() }) });

            if (isDraft) {
                setDraftActivities(prev => prev.map(a => a.id === activityId ? { ...a, ...activityData, status } : a));
                addToast("Rascunho atualizado!", "success");
                return true;
            }

            if (activityData.classId) {
                const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30);
                await addDoc(collection(db, "broadcasts"), {
                    classId: activityData.classId, type: 'activity_post', title: 'Nova Atividade',
                    summary: `O professor ${user.name} postou uma nova atividade: "${activityData.title}"`,
                    authorName: user.name, timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt),
                    deepLink: { page: 'activities' }
                });
                setDraftActivities(prev => prev.filter(a => a.id !== activityId));
            }
            addToast("Atividade publicada com sucesso!", "success");
            fetchTeacherContent(true);
            return true;
        } catch (error) { console.error(error); addToast("Erro ao atualizar atividade.", "error"); return false; }
    }, [user, addToast, fetchTeacherContent]);

    const handlePublishDraft = useCallback(async (activityId: string, updateData: { classId: string, className: string, dueDate: string, points: number }) => {
        if (!user) return false;
        try {
            const draftRef = doc(db, "activities", activityId);
            const draftSnap = await getDoc(draftRef);
            
            if (!draftSnap.exists()) {
                addToast("Rascunho não encontrado.", "error");
                return false;
            }

            const draftData = draftSnap.data();
            const { id, ...rest } = draftData as any;

            const newActivityPayload = {
                ...rest,
                classId: updateData.classId,
                className: updateData.className,
                dueDate: updateData.dueDate,
                points: updateData.points,
                status: 'Pendente',
                submissionCount: 0,
                pendingSubmissionCount: 0,
                // submissions: [], // Phase 3: removed
                createdAt: serverTimestamp(),
                originalDraftId: activityId 
            };

            await addDoc(collection(db, "activities"), newActivityPayload);

            const expiresAt = new Date(); 
            expiresAt.setDate(expiresAt.getDate() + 30);
            
            await addDoc(collection(db, "broadcasts"), {
                classId: updateData.classId, 
                type: 'activity_post', 
                title: 'Nova Atividade',
                summary: `O professor ${user.name} postou uma nova atividade: "${newActivityPayload.title}"`,
                authorName: user.name, 
                timestamp: serverTimestamp(), 
                expiresAt: Timestamp.fromDate(expiresAt),
                deepLink: { page: 'activities' }
            });

            addToast("Atividade publicada com sucesso! (Rascunho mantido)", "success");
            fetchTeacherContent(true);
            return true;

        } catch (error: any) {
            console.error("Error publishing draft:", error);
            addToast(`Erro ao publicar: ${error.message}`, "error");
            return false;
        }
    }, [user, addToast, fetchTeacherContent]);

    const handleGradeActivity = useCallback(async (activityId: string, studentId: string, grade: number, feedback: string, scores?: Record<string, number>) => {
        try {
             const activityRef = doc(db, "activities", activityId);
             const activitySnap = await getDoc(activityRef);
             
             if (activitySnap.exists()) {
                 const activityData = activitySnap.data() as Activity;
                 let classId = activityData.classId;

                 const submissionPayload: any = { 
                     status: 'Corrigido', 
                     grade, 
                     feedback, 
                     gradedAt: new Date().toISOString() 
                 };
                 if (scores) submissionPayload.scores = scores;

                 // PHASE 3 SCALABILITY: Write to Subcollection
                 await setDoc(doc(collection(activityRef, "submissions"), studentId), submissionPayload, { merge: true });
                 
                 // PHASE 3 SCALABILITY: Update Counters only
                 // Decrement pending count if it was pending
                 await updateDoc(activityRef, { pendingSubmissionCount: increment(-1) });

                 // ROBUST NOTIFICATION: Wrap in try/catch to not block success if notification service fails
                 try {
                     if (user) {
                        await createNotification({
                            userId: studentId, actorId: user.id, actorName: user.name, type: 'activity_correction',
                            title: 'Atividade Corrigida', text: `Sua atividade "${activityData.title}" foi corrigida. Nota: ${grade}`,
                            classId: activityData.classId!, activityId: activityId
                        });
                     }
                 } catch (notifError) {
                     console.error("Failed to send notification:", notifError);
                     // Non-blocking error
                 }

                 // Update Local State (Optimistic UI)
                 setTeacherClasses(prevClasses => prevClasses.map(cls => {
                     if (cls.id !== classId) return cls;
                     return {
                         ...cls,
                         activities: cls.activities.map(act => {
                             if (act.id !== activityId) return act;
                             // Atualizamos o array local para refletir na UI, embora o DB não use mais array
                             const updatedSubmissions = (act.submissions || []).map(sub => {
                                 if (sub.studentId !== studentId) return sub;
                                 const updatedSub = { ...sub, status: 'Corrigido', grade, feedback, gradedAt: new Date().toISOString() } as any;
                                 if (scores) updatedSub.scores = scores;
                                 return updatedSub;
                             });
                             return { ...act, submissions: updatedSubmissions, pendingSubmissionCount: Math.max((act.pendingSubmissionCount || 1) - 1, 0) };
                         })
                     };
                 }));
                 
                 // Remove from pending list
                 setPendingActivitiesList(prev => prev.map(item => {
                     if (item.id === activityId) {
                         return { ...item, pendingCount: Math.max(item.pendingCount - 1, 0) };
                     }
                     return item;
                 }).filter(item => item.pendingCount > 0));

                 // RECALCULAR BOLETIM / HISTÓRICO
                 if (classId) {
                     await recalculateStudentGradeSummary(classId, studentId, { 
                         activityId, 
                         title: activityData.title,
                         grade,
                         maxPoints: activityData.points,
                         unidade: activityData.unidade as Unidade,
                         materia: activityData.materia || 'Geral'
                     }, activityData.className);
                 }

                 return true;
             }
             return false;
        } catch (error: any) { 
            console.error(error); 
            addToast(`Erro ao salvar nota: ${error.message}`, "error"); 
            return false; 
        }
    }, [user, addToast, setTeacherClasses, recalculateStudentGradeSummary]);

    const handleDeleteActivity = useCallback(async (activityId: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, "activities", activityId));
            setDraftActivities(prev => prev.filter(a => a.id !== activityId));
            setPendingActivitiesList(prev => prev.filter(a => a.id !== activityId));
            
            setTeacherClasses(prev => prev.map(c => ({
                ...c,
                activities: c.activities.filter(a => a.id !== activityId)
            })));
            addToast("Atividade excluída.", "success");
        } catch (error: any) { console.error(error); addToast("Erro ao excluir atividade.", "error"); }
    }, [user, addToast, setTeacherClasses]);

    const handleDeleteModule = useCallback(async (classId: string, moduleId: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, "modules", moduleId));
            await deleteDoc(doc(db, "module_contents", moduleId));

            setModules(prev => prev.filter(m => m.id !== moduleId));
            setDraftModules(prev => prev.filter(m => m.id !== moduleId));
            
            setTeacherClasses(prev => prev.map(cls => ({
                ...cls,
                modules: cls.modules.filter(m => m.id !== moduleId),
                moduleCount: cls.modules.some(m => m.id === moduleId) ? Math.max((cls.moduleCount || 1) - 1, 0) : cls.moduleCount
            })));
            addToast("Módulo excluído!", "success");
        } catch (error: any) { console.error(error); addToast("Erro ao excluir.", "error"); }
    }, [user, addToast, setTeacherClasses]);

    const handleSaveModule = useCallback(async (module: Omit<Module, 'id'>, isDraft: boolean = false) => {
        if (!user) return false;
        try {
            const { pages, ...metadata } = module;
            const status = isDraft ? "Rascunho" : "Ativo";
            
            // Phase 3: No parent pages array
            const docRef = await addDoc(collection(db, "modules"), { 
                ...metadata, status, createdAt: serverTimestamp()
            });
            await setDoc(doc(db, "module_contents", docRef.id), { pages: pages });

            if (isDraft) {
                const newDraft = { id: docRef.id, ...module, status } as Module;
                setDraftModules(prev => [newDraft, ...prev]);
                addToast("Módulo salvo como rascunho!", "success");
                setModulesLibraryLoaded(false);
                return true;
            }

            if (metadata.visibility === 'specific_class' && metadata.classIds && metadata.classIds.length > 0) {
                const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30);
                const batch = writeBatch(db);
                metadata.classIds.forEach(classId => {
                    const broadcastRef = doc(collection(db, "broadcasts"));
                    batch.set(broadcastRef, {
                        classId, type: 'module_post', title: 'Novo Módulo',
                        summary: `O professor ${user.name} publicou um novo módulo: "${metadata.title}"`,
                        authorName: user.name, timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt),
                        deepLink: { page: 'modules', id: docRef.id }
                    });
                });
                await batch.commit();
            }
            addToast("Módulo criado!", "success");
            setModulesLibraryLoaded(false);
            return true;
        } catch (error) { console.error(error); addToast("Erro ao salvar.", "error"); return false; }
    }, [user, addToast]);

    const handleUpdateModule = useCallback(async (module: Module, isDraft: boolean = false) => {
        try {
            const { id, pages, ...data } = module;
            const status = isDraft ? "Rascunho" : "Ativo";
            // Phase 3: No parent pages array
            await updateDoc(doc(db, "modules", id), { ...data, status, ...(isDraft ? {} : { createdAt: serverTimestamp() }) });
            if (pages) await setDoc(doc(db, "module_contents", id), { pages }, { merge: true });

            if (isDraft) {
                setDraftModules(prev => prev.map(m => m.id === id ? { ...m, ...data, status } : m));
                addToast("Rascunho atualizado!", "success");
            } else {
                addToast("Módulo atualizado e publicado!", "success");
                setDraftModules(prev => prev.filter(m => m.id !== id));
                setModules(prev => prev.map(m => m.id === id ? module : m));
            }
        } catch (error) { console.error(error); addToast("Erro ao atualizar.", "error"); }
    }, [addToast]);

    const handlePublishModuleDraft = useCallback(async (moduleId: string, classIds: string[]) => {
        if (!user) return false;
        try {
            const module = draftModules.find(m => m.id === moduleId);
            if (!module) return false;

            await updateDoc(doc(db, "modules", moduleId), { status: "Ativo", classIds, visibility: 'specific_class', createdAt: serverTimestamp() });

            const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 30);
            const batch = writeBatch(db);
            
            classIds.forEach(classId => {
                const broadcastRef = doc(collection(db, "broadcasts"));
                batch.set(broadcastRef, {
                    classId, type: 'module_post', title: 'Novo Módulo',
                    summary: `O professor ${user.name} publicou um novo módulo: "${module.title}"`,
                    authorName: user.name, timestamp: serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt),
                    deepLink: { page: 'modules', id: moduleId }
                });
            });
            await batch.commit();

            setDraftModules(prev => prev.filter(m => m.id !== moduleId));
            addToast("Módulo publicado com sucesso!", "success");
            setModulesLibraryLoaded(false); 
            return true;
        } catch (error) { console.error("Error publishing module:", error); addToast("Erro ao publicar módulo.", "error"); return false; }
    }, [user, draftModules, addToast]);

    return {
        modules, draftActivities, draftModules, pendingActivitiesList,
        isLoadingContent, isSubmittingContent,
        fetchTeacherContent, fetchModulesLibrary,
        handleSaveActivity, handleUpdateActivity, handleGradeActivity, handleDeleteActivity,
        handleDeleteModule, handleSaveModule, handleUpdateModule, handlePublishModuleDraft,
        handlePublishDraft
    };
}
