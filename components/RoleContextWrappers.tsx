import React from 'react';
import { StudentAcademicProvider } from '../contexts/StudentAcademicContext';
import { StudentNotificationProvider } from '../contexts/StudentNotificationContext';
import { StudentGamificationProvider } from '../contexts/StudentGamificationContext';
import { TeacherClassProvider } from '../contexts/TeacherClassContext';
import { TeacherAcademicProvider } from '../contexts/TeacherAcademicContext';
import { TeacherCommunicationProvider } from '../contexts/TeacherCommunicationContext';
import { AdminDataProvider } from '../contexts/AdminDataContext';

interface WrapperProps {
    children: React.ReactNode;
}

export const StudentContextWrapper: React.FC<WrapperProps> = ({ children }) => (
    <StudentAcademicProvider>
        <StudentNotificationProvider>
            <StudentGamificationProvider>
                {children}
            </StudentGamificationProvider>
        </StudentNotificationProvider>
    </StudentAcademicProvider>
);

export const TeacherContextWrapper: React.FC<WrapperProps> = ({ children }) => (
    <TeacherClassProvider>
        <TeacherAcademicProvider>
            <TeacherCommunicationProvider>
                {children}
            </TeacherCommunicationProvider>
        </TeacherAcademicProvider>
    </TeacherClassProvider>
);

export const AdminContextWrapper: React.FC<WrapperProps> = ({ children }) => (
    <AdminDataProvider>
        {children}
    </AdminDataProvider>
);