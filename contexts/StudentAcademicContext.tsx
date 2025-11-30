
import React, { createContext, useContext } from 'react';
import type { Module, Quiz, Activity, TeacherClass, GradeReport, ActivitySubmission } from '../types';
import { useAuth } from './AuthContext';
import { useStudentContent } from '../hooks/useStudentContent';
import { useStudentReport } from '../hooks/useStudentReport';
import { QueryDocumentSnapshot } from 'firebase/firestore';

interface ModuleFilters {
    queryText: string;
    serie: string;
    materia: string;
    status: string;
    scope: 'my_modules' | 'public';
}

interface StudentAcademicContextType {
    inProgressModules: Module[];
    searchedModules: Module[];
    searchedQuizzes: Quiz[];
    studentClasses: TeacherClass[];
    gradeReport: GradeReport;
    userSubmissions: Record<string, ActivitySubmission>;
    moduleFilters: ModuleFilters;
    isLoading: boolean;
    isSearchingModules: boolean;
    isSearchingQuizzes: boolean;
    refreshContent: (forceRefresh?: boolean) => Promise<void>;
    searchModules: (filters: any) => Promise<void>;
    searchQuizzes: (filters: any) => Promise<void>;
    searchActivities: (filters: any, lastDoc?: QueryDocumentSnapshot | null) => Promise<{ activities: Activity[], lastDoc: QueryDocumentSnapshot | null }>;
    handleActivitySubmit: (activityId: string, content: string) => Promise<void>;
    handleJoinClass: (code: string) => Promise<boolean>;
    handleLeaveClass: (classId: string) => void;
    handleModuleProgressUpdate: (moduleId: string, progress: number) => Promise<void>;
    handleModuleComplete: (moduleId: string) => Promise<void>;
    setSearchedQuizzes: React.Dispatch<React.SetStateAction<Quiz[]>>;
    setSearchedModules: React.Dispatch<React.SetStateAction<Module[]>>;
}

export const StudentAcademicContext = createContext<StudentAcademicContextType | undefined>(undefined);

export function StudentAcademicProvider({ children }: { children?: React.ReactNode }) {
    const { user } = useAuth();
    
    // React Query Powered Hook
    const content = useStudentContent(user);
    
    // Reporting Hook (Independent)
    const { gradeReport, isLoadingReport } = useStudentReport(user, content.studentClasses);

    const value = {
        ...content,
        gradeReport,
        isLoading: content.isLoading || isLoadingReport
    };

    return (
        <StudentAcademicContext.Provider value={value}>
            {children}
        </StudentAcademicContext.Provider>
    );
}

export const useStudentAcademic = () => {
    const context = useContext(StudentAcademicContext);
    if (context === undefined) {
        throw new Error('useStudentAcademic must be used within a StudentAcademicProvider');
    }
    return context;
};
