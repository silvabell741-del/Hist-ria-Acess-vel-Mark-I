
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../components/firebaseClient';
import { StudentGradeSummaryDoc, Unidade } from '../types';

/**
 * Updates the consolidated student grade report (Big Doc) in Firestore.
 * This is crucial for the "Boletim" and "School Records" features.
 */
export const recalculateStudentGradeSummary = async (
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

        if (summarySnap.exists()) {
            summaryData = summarySnap.data() as StudentGradeSummaryDoc;
            // Update class name if missing or generic
            if (className !== 'Turma' && (!summaryData.className || summaryData.className === 'Turma')) {
                summaryData.className = className;
            }
        } else {
            // Try to fetch class name if creating new doc and name is generic
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

        // Update specific activity in the structure
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
        
        // Check if activity already exists
        const existingActivityIndex = subjectEntry.activities.findIndex(a => a.id === activityId);

        if (existingActivityIndex > -1) {
            // Update existing
            const oldGrade = subjectEntry.activities[existingActivityIndex].grade;
            subjectEntry.activities[existingActivityIndex].grade = grade;
            // Recalculate total points
            subjectEntry.totalPoints = (subjectEntry.totalPoints - oldGrade) + grade;
        } else {
            // Add new
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

        // Save back to Firestore
        await setDoc(summaryRef, summaryData, { merge: true });

    } catch (error) {
        console.error("Failed to update student grade summary:", error);
        throw error;
    }
};
