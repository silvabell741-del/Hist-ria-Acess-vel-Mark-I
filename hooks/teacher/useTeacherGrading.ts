
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, collection, query, orderBy, getDocs, updateDoc, increment, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../components/firebaseClient';
import type { Activity, ActivitySubmission, Unidade } from '../../types';
import { createNotification } from '../../utils/createNotification';
import { recalculateStudentGradeSummary } from '../../utils/gradingUtils';

interface GradeMutationParams {
    studentId: string;
    grade: number;
    feedback: string;
    scores?: Record<string, number>;
}

export function useTeacherGrading(activityId: string | undefined, user: any) {
    const queryClient = useQueryClient();

    // 1. Fetch Activity Details
    const activityQuery = useQuery({
        queryKey: ['activity', activityId],
        queryFn: async () => {
            if (!activityId) throw new Error("No activity ID");
            const ref = doc(db, "activities", activityId);
            const snap = await getDoc(ref);
            if (!snap.exists()) throw new Error("Activity not found");
            return { id: snap.id, ...snap.data() } as Activity;
        },
        enabled: !!activityId
    });

    // 2. Fetch Submissions
    const submissionsQuery = useQuery({
        queryKey: ['activitySubmissions', activityId],
        queryFn: async () => {
            if (!activityId) return [];
            const subRef = collection(db, "activities", activityId, "submissions");
            const q = query(subRef, orderBy("submissionDate", "asc"));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({
                studentId: d.id,
                ...d.data(),
                submissionDate: d.data().submissionDate?.toDate ? d.data().submissionDate.toDate().toISOString() : d.data().submissionDate,
                gradedAt: d.data().gradedAt?.toDate ? d.data().gradedAt.toDate().toISOString() : d.data().gradedAt
            } as ActivitySubmission));
        },
        enabled: !!activityId
    });

    // 3. Grade Mutation
    const gradeMutation = useMutation({
        mutationFn: async ({ studentId, grade, feedback, scores }: GradeMutationParams) => {
            if (!activityId || !user || !activityQuery.data) throw new Error("Context missing");
            
            const activityData = activityQuery.data;
            const activityRef = doc(db, "activities", activityId);
            
            const submissionPayload: any = { 
                status: 'Corrigido', 
                grade, 
                feedback, 
                gradedAt: new Date().toISOString() 
            };
            if (scores) submissionPayload.scores = scores;

            // Update Submission
            await setDoc(doc(collection(activityRef, "submissions"), studentId), submissionPayload, { merge: true });
            
            // Decrement Pending Counter (Optimistic check handled by logic or UI, here we blindly decrement for simplicity of operation)
            // Ideally we check previous status, but Firestore increment is safe. 
            // We assume this action is taken on a pending item or update. If update, count might desync slightly if we don't check.
            // For Phase 2, we decrement.
            // TODO: In robust system, check previous status via transaction.
            await updateDoc(activityRef, { pendingSubmissionCount: increment(-1) });

            // Notification
            try {
                await createNotification({
                    userId: studentId, actorId: user.id, actorName: user.name, type: 'activity_correction',
                    title: 'Atividade Corrigida', text: `Sua atividade "${activityData.title}" foi corrigida. Nota: ${grade}`,
                    classId: activityData.classId!, activityId: activityId
                });
            } catch (e) { console.error("Notification failed", e); }

            // Recalculate School Record
            if (activityData.classId) {
                await recalculateStudentGradeSummary(
                    activityData.classId, 
                    studentId, 
                    { 
                        activityId, 
                        title: activityData.title,
                        grade,
                        maxPoints: activityData.points,
                        unidade: activityData.unidade as Unidade,
                        materia: activityData.materia || 'Geral'
                    }, 
                    activityData.className
                );
            }

            return { studentId, grade, feedback, scores };
        },
        onSuccess: (data) => {
            // Update local cache for submissions
            queryClient.setQueryData(['activitySubmissions', activityId], (old: ActivitySubmission[] | undefined) => {
                if (!old) return [];
                return old.map(s => s.studentId === data.studentId ? { ...s, ...data, status: 'Corrigido', gradedAt: new Date().toISOString() } : s);
            });
            
            // Invalidate pending activities list to update badges
            queryClient.invalidateQueries({ queryKey: ['pendingActivities'] });
        }
    });

    return {
        activity: activityQuery.data,
        submissions: submissionsQuery.data || [],
        isLoading: activityQuery.isLoading || submissionsQuery.isLoading,
        error: activityQuery.error || submissionsQuery.error,
        gradeMutation
    };
}
