
import React from 'react';
import { useTeacherAcademicContext } from '../contexts/TeacherAcademicContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { ModuleForm, SCHOOL_YEARS } from './common/ModuleForm';

const ModuleCreator: React.FC = () => {
    const { user } = useAuth();
    const { handleSaveModule, handleUpdateModule, isSubmittingContent } = useTeacherAcademicContext();
    const { setCurrentPage, editingModule, exitEditingModule } = useNavigation();

    const handleSave = async (data: any, isDraft: boolean) => {
        const moduleData: any = {
            ...data,
            visibility: isDraft ? 'private' : 'public', 
            classIds: [], 
            status: isDraft ? 'Rascunho' : 'Ativo',
        };

        if (editingModule) {
            await handleUpdateModule({ ...moduleData, id: editingModule.id, creatorId: editingModule.creatorId }, isDraft);
            exitEditingModule();
        } else {
            const success = await handleSaveModule({ ...moduleData, creatorId: user?.id }, isDraft);
            if (success) setCurrentPage('teacher_dashboard');
        }
    };

    const handleCancel = () => {
        if (editingModule) exitEditingModule();
        else setCurrentPage('teacher_dashboard');
    };

    return (
        <ModuleForm 
            initialData={editingModule}
            userId={user?.id}
            onSave={handleSave}
            onCancel={handleCancel}
            isSubmitting={isSubmittingContent}
            title={editingModule ? 'Editar Módulo' : 'Criar Módulo'}
            subtitle="Crie conteúdo didático para suas turmas."
            defaultSeries={user?.series ? [user.series] : [SCHOOL_YEARS[0]]}
            defaultSubjects={['História']}
        />
    );
};

export default ModuleCreator;
