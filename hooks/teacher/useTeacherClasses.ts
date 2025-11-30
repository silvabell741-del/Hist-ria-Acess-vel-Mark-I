
import { useCallback } from 'react';
import { 
    collection, query, where, getDocs, doc, addDoc, serverTimestamp, getDoc, 
    updateDoc, arrayUnion, orderBy
} from 'firebase/firestore';
import { db } from '../../components/firebaseClient';
import type { TeacherClass, AttendanceSession, Turno, User, Activity, ClassSummary, AttendanceStatus } from '../../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useTeacherClasses(user: User | null, addToast: (msg: string, type: any) => void) {
    const queryClient = useQueryClient();

    // --- 1. QUERY: Classes List ---
    const { data: allClasses = [], isLoading: isLoadingClasses, refetch } = useQuery({
        queryKey: ['teacherClasses', user?.id],
        queryFn: async () => {
            if (!user) return [];
            
            // Optimization: If profile has summary, use it for initial render (Fast Path)? 
            // In React Query, we can use placeholderData or initialData if we passed the user prop deeper.
            // For now, we stick to the robust fetch to ensure consistency.
            
            const qClasses = query(collection(db, "classes"), where("teachers", "array-contains", user.id));
            const snapClasses = await getDocs(qClasses);
            
            const classes: TeacherClass[] = [];
            const summaryToSave: ClassSummary[] = [];

            snapClasses.docs.forEach(d => {
                const data = d.data();
                
                // Soft-delete filter
                if (data.inactiveTeachers && data.inactiveTeachers.includes(user.id)) return;

                const rawNotices = Array.isArray(data.notices) ? data.notices : [];
                const myNotices = rawNotices.filter((n: any) => n.authorId === user.id).map((n: any) => ({
                    ...n,
                    timestamp: n.timestamp?.toDate ? n.timestamp.toDate().toISOString() : n.timestamp
                }));

                const cls = {
                    id: d.id,
                    ...data,
                    students: Array.isArray(data.students) ? data.students : [],
                    notices: myNotices,
                    noticeCount: myNotices.length,
                    modules: [],
                    activities: [], 
                    isFullyLoaded: false, // We will use a separate query for details if needed or just fetch on demand
                    isSummaryOnly: false,
                    isArchived: data.isArchived || false
                } as TeacherClass;

                classes.push(cls);
                summaryToSave.push({ id: d.id, name: data.name, code: data.code, studentCount: cls.studentCount || 0, isArchived: cls.isArchived });
            });

            // Update user profile summary silently
            if (summaryToSave.length > 0) {
               updateDoc(doc(db, "users", user.id), { myClassesSummary: summaryToSave }).catch(console.error);
            }

            return classes;
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 10, // 10 mins
    });

    const teacherClasses = allClasses.filter(c => !c.isArchived);
    const archivedClasses = allClasses.filter(c => c.isArchived);

    // --- 2. MUTATIONS ---

    const createClassMutation = useMutation({
        mutationFn: async (name: string) => {
            if (!user) throw new Error("User not authenticated");
            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const newClassPayload = { 
                 name, 
                 teacherId: user.id, 
                 teachers: [user.id], 
                 subjects: { [user.id]: 'Regente' }, 
                 teacherNames: { [user.id]: user.name }, 
                 code, 
                 students: [], 
                 studentCount: 0, 
                 notices: [], 
                 noticeCount: 0, 
                 createdAt: serverTimestamp(),
                 isArchived: false
            };
            await addDoc(collection(db, "classes"), newClassPayload);
            return { success: true };
        },
        onSuccess: () => {
            addToast("Turma criada!", "success");
            queryClient.invalidateQueries({ queryKey: ['teacherClasses'] });
        },
        onError: () => addToast("Erro ao criar turma.", "error")
    });

    const archiveClassMutation = useMutation({
        mutationFn: async (classId: string) => {
            await updateDoc(doc(db, 'classes', classId), { isArchived: true });
        },
        onSuccess: () => {
            addToast("Turma arquivada!", "success");
            queryClient.invalidateQueries({ queryKey: ['teacherClasses'] });
        },
        onError: () => addToast("Erro ao arquivar.", "error")
    });

    const leaveClassMutation = useMutation({
        mutationFn: async (classId: string) => {
            if (!user) return;
            await updateDoc(doc(db, 'classes', classId), {
                inactiveTeachers: arrayUnion(user.id)
            });
        },
        onSuccess: () => {
            addToast("Você saiu da turma.", "success");
            queryClient.invalidateQueries({ queryKey: ['teacherClasses'] });
        },
        onError: () => addToast("Erro ao sair da turma.", "error")
    });

    // --- 3. CLASS DETAILS (On-Demand) ---
    // Instead of complex state merging, we can rely on a specific query for details 
    // or just update the cache manually. For now, sticking to the existing pattern 
    // of "fetching details into state" via a manual function but using queryClient to store it would be better.
    // However, to keep compatibility with the Context interface:
    const fetchClassDetails = useCallback(async (classId: string) => {
        // This is a "Imperative Fetch" pattern to enrich the cache
        if (!user) return;
        try {
            const [snapActivities, snapSessions] = await Promise.all([
                getDocs(query(collection(db, "activities"), where("classId", "==", classId), where("creatorId", "==", user.id))),
                getDocs(query(collection(db, "attendance_sessions"), where("classId", "==", classId), where("teacherId", "==", user.id)))
            ]);

            const activities = snapActivities.docs.map(d => ({ 
                id: d.id, ...d.data(), className: teacherClasses.find(c=>c.id === classId)?.name || 'Turma' 
            } as Activity));

            const sessions = snapSessions.docs.map(d => ({
                id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString()
            } as AttendanceSession)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Manually update the cache for 'teacherClasses'
            queryClient.setQueryData(['teacherClasses', user.id], (old: TeacherClass[] | undefined) => {
                if (!old) return old;
                return old.map(c => {
                    if (c.id === classId) {
                        return { ...c, activities, isFullyLoaded: true };
                    }
                    return c;
                });
            });
            
            // We can store sessions in a separate cache if we wanted, 
            // but the Context interface expects 'attendanceSessionsByClass' map.
            // We will build that derived state in the Context or return it here.
            // For now, let's attach sessions to the class object in cache or use a separate query.
            // Let's use queryClient to store sessions separately.
            queryClient.setQueryData(['classSessions', classId], sessions);

        } catch (error) {
            console.error(error);
        }
    }, [user, queryClient, teacherClasses]);

    // Helper to get sessions from cache
    const getSessionsForClass = (classId: string) => {
        return queryClient.getQueryData<AttendanceSession[]>(['classSessions', classId]) || [];
    };

    // Construct the sessions map for the context interface
    const attendanceSessionsByClass = allClasses.reduce((acc, cls) => {
        acc[cls.id] = getSessionsForClass(cls.id);
        return acc;
    }, {} as Record<string, AttendanceSession[]>);


    // --- Attendance Logic ---
    const createSessionMutation = useMutation({
        mutationFn: async ({ classId, date, turno, horario }: any) => {
            if (!user) throw new Error("Auth");
            const sessionData = { classId, date, turno, horario, teacherId: user.id, createdAt: serverTimestamp() };
            const docRef = await addDoc(collection(db, "attendance_sessions"), sessionData);
            
            const cls = allClasses.find(c => c.id === classId);
            if (cls?.students?.length) {
                const batch = (await import('firebase/firestore')).writeBatch(db); // dynamic import just to be safe/clean
                const recordsRef = collection(db, "attendance_sessions", docRef.id, "records");
                cls.students.forEach(student => {
                    batch.set(doc(recordsRef), { sessionId: docRef.id, studentId: student.id, studentName: student.name, status: 'pendente', updatedAt: serverTimestamp() });
                });
                await batch.commit();
            }
            return { ...sessionData, id: docRef.id };
        },
        onSuccess: (newSession, variables) => {
            addToast("Chamada criada!", "success");
            // Update cache manually
            queryClient.setQueryData(['classSessions', variables.classId], (old: any[] = []) => [newSession, ...old]);
        }
    });

    const updateAttendanceStatus = async (sessionId: string, recordId: string, status: AttendanceStatus) => {
        await updateDoc(doc(db, "attendance_sessions", sessionId, "records", recordId), { 
            status, updatedAt: serverTimestamp() 
        });
    };

    return {
        teacherClasses,
        archivedClasses,
        attendanceSessionsByClass,
        isLoadingClasses,
        isSubmittingClass: createClassMutation.isPending || archiveClassMutation.isPending || leaveClassMutation.isPending,
        fetchTeacherClasses: async (force?: boolean) => { if (force) refetch(); },
        fetchClassDetails,
        handleCreateClass: createClassMutation.mutateAsync,
        handleArchiveClass: archiveClassMutation.mutateAsync,
        handleLeaveClass: leaveClassMutation.mutateAsync,
        handleCreateAttendanceSession: (id: string, d: string, t: Turno, h: number) => createSessionMutation.mutateAsync({ classId: id, date: d, turno: t, horario: h }),
        handleUpdateAttendanceStatus: updateAttendanceStatus,
        getAttendanceSession: async () => null, // Legacy, unused
        setTeacherClasses: () => {} // No-op, managed by Query
    };
}
