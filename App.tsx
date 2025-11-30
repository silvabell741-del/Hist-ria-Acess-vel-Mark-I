import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { RoleSelectionPage } from './components/RoleSelectionPage';
import { YearSelectionPage } from './components/YearSelectionPage';
import type { Page, Role } from './types';
import './styles/themes.css';

// Providers
import { AppProviders } from './components/AppProviders';
import { StudentContextWrapper, TeacherContextWrapper, AdminContextWrapper } from './components/RoleContextWrappers';

// Lazy-loaded page components
const Modules = lazy(() => import('./components/Modules'));
const Quizzes = lazy(() => import('./components/Quizzes'));
const Activities = lazy(() => import('./components/Activities'));
const StudentActivityResponse = lazy(() => import('./components/StudentActivityResponse'));
const Achievements = lazy(() => import('./components/Achievements'));
const JoinClass = lazy(() => import('./components/JoinClass'));
const Profile = lazy(() => import('./components/Profile'));
const NotificationsPage = lazy(() => import('./components/NotificationsPage'));
const ModuleViewPage = lazy(() => import('./components/ModuleViewPage'));
const Boletim = lazy(() => import('./components/Boletim'));

// Teacher Components
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const ModuleCreator = lazy(() => import('./components/ModuleCreator'));
const CreateActivity = lazy(() => import('./components/CreateActivity'));
const TeacherStatistics = lazy(() => import('./components/TeacherStatistics'));
const PendingActivities = lazy(() => import('./components/PendingActivities'));
const TeacherGradingView = lazy(() => import('./components/TeacherGradingView'));
const SchoolRecords = lazy(() => import('./components/SchoolRecords'));
const ClassView = lazy(() => import('./components/ClassView'));
const TeacherRepository = lazy(() => import('./components/TeacherRepository'));
const TeacherModuleRepository = lazy(() => import('./components/TeacherModuleRepository'));

// Admin Components
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const AdminManageUsers = lazy(() => import('./components/AdminManageUsers'));
const AdminManageModules = lazy(() => import('./components/AdminManageModules'));
const AdminManageQuizzes = lazy(() => import('./components/AdminManageQuizzes'));
const AdminManageAchievements = lazy(() => import('./components/AdminManageAchievements'));
const AdminStats = lazy(() => import('./components/AdminStats'));
const AdminTests = lazy(() => import('./components/AdminTests'));
const CreateAchievement = lazy(() => import('./components/CreateAchievement'));
const AdminCreateModule = lazy(() => import('./components/AdminCreateModule'));
const AdminCreateQuiz = lazy(() => import('./components/AdminCreateQuiz'));

const PAGE_TITLES: Record<string, string> = {
    modules: 'Módulos',
    quizzes: 'Quizzes',
    activities: 'Atividades',
    achievements: 'Conquistas',
    join_class: 'Turmas',
    profile: 'Meu Perfil',
    notifications: 'Notificações',
    boletim: 'Boletim',
    teacher_dashboard: 'Minhas Turmas',
    teacher_statistics: 'Estatísticas do Professor',
    teacher_school_records: 'Histórico Escolar',
    teacher_repository: 'Banco de Questões',
    teacher_module_repository: 'Banco de Módulos',
    admin_dashboard: 'Painel do Administrador',
    admin_users: 'Gerenciar Usuários',
    admin_modules: 'Gerenciar Módulos',
    admin_quizzes: 'Gerenciar Quizzes',
    admin_achievements: 'Gerenciar Conquistas',
    admin_stats: 'Estatísticas da Plataforma',
    admin_tests: 'Painel de Testes',
};

const LoadingSpinner: React.FC = () => (
    <div role="status" className="flex justify-center items-center h-full pt-16">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
        <span className="sr-only">Carregando conteúdo...</span>
    </div>
);

const useKeyboardShortcuts = () => {
    const { userRole } = useAuth();
    const { setCurrentPage } = useNavigation();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

            if (event.altKey) {
                const key = event.key.toLowerCase();
                let targetPage: Page | null = null;
                
                if (userRole === 'aluno') {
                    if (key === 'm') targetPage = 'modules';
                    else if (key === 'q') targetPage = 'quizzes';
                    else if (key === 'a') targetPage = 'activities';
                    else if (key === 'c') targetPage = 'achievements';
                    else if (key === 't') targetPage = 'join_class';
                    else if (key === 'p') targetPage = 'profile';
                    else if (key === 'n') targetPage = 'notifications';
                    else if (key === 'b') targetPage = 'boletim';
                } else if (userRole === 'professor') {
                    if (key === 'm') targetPage = 'teacher_dashboard';
                    else if (key === 'i') targetPage = 'teacher_pending_activities';
                    else if (key === 'b') targetPage = 'modules';
                    else if (key === 'c') targetPage = 'teacher_create_module';
                    else if (key === 'a') targetPage = 'teacher_create_activity';
                    else if (key === 'e') targetPage = 'teacher_statistics';
                    else if (key === 'h') targetPage = 'teacher_school_records';
                    else if (key === 'p') targetPage = 'profile';
                    else if (key === 'n') targetPage = 'notifications';
                    else if (key === 'r') targetPage = 'teacher_repository';
                }

                if (targetPage) {
                    event.preventDefault();
                    setCurrentPage(targetPage);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [userRole, setCurrentPage]);
};

const MainLayout: React.FC = () => {
    useKeyboardShortcuts();
    const { userRole } = useAuth();
    const { currentPage, activeModule, activeClass, activeActivity, gradingActivity, toggleMobileMenu } = useNavigation();
    
    const [isScrolled, setIsScrolled] = useState(false);
    const mainContentRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const mainEl = mainContentRef.current;
        if (!mainEl) return;
        const handleScroll = () => setIsScrolled(mainEl.scrollTop > 20);
        mainEl.addEventListener('scroll', handleScroll, { passive: true });
        return () => mainEl.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (mainContentRef.current) mainContentRef.current.scrollTop = 0;
        document.getElementById('page-main-heading')?.focus({ preventScroll: true });
    }, [currentPage]);

    const renderPage = () => {
        if (userRole === 'admin') {
            switch (currentPage) {
                case 'admin_dashboard': return <AdminDashboard />;
                case 'admin_users': return <AdminManageUsers />;
                case 'admin_modules': return <AdminManageModules />;
                case 'admin_quizzes': return <AdminManageQuizzes />;
                case 'admin_achievements': return <AdminManageAchievements />;
                case 'admin_stats': return <AdminStats />;
                case 'admin_tests': return <AdminTests />;
                case 'admin_create_module': return <AdminCreateModule />;
                case 'admin_create_quiz': return <AdminCreateQuiz />;
                case 'admin_create_achievement': return <CreateAchievement />;
                case 'profile': return <Profile />;
                default: return <AdminDashboard />;
            }
        }

        if (userRole === 'professor') {
            switch (currentPage) {
                case 'teacher_dashboard': return <TeacherDashboard />;
                case 'teacher_pending_activities': return <PendingActivities />;
                case 'modules': return <Modules />;
                case 'teacher_create_module': return <ModuleCreator />;
                case 'teacher_create_activity': return <CreateActivity />;
                case 'teacher_repository': return <TeacherRepository />;
                case 'teacher_module_repository': return <TeacherModuleRepository />;
                case 'teacher_statistics': return <TeacherStatistics />;
                case 'teacher_school_records': return <SchoolRecords />;
                case 'class_view': return <ClassView />;
                case 'teacher_grading_view': return gradingActivity ? <TeacherGradingView /> : <PendingActivities />;
                case 'profile': return <Profile />;
                case 'notifications': return <TeacherDashboard />;
                case 'module_view': return activeModule ? <ModuleViewPage /> : <Modules />;
                default: return <TeacherDashboard />;
            }
        }
        
        switch (currentPage) {
            case 'modules': return <Modules />;
            case 'quizzes': return <Quizzes />;
            case 'activities': return <Activities />;
            case 'achievements': return <Achievements />;
            case 'join_class': return <JoinClass />;
            case 'profile': return <Profile />;
            case 'notifications': return <NotificationsPage />;
            case 'boletim': return <Boletim />;
            case 'module_view': return activeModule ? <ModuleViewPage /> : <Modules />;
            case 'student_activity_view': return activeActivity ? <StudentActivityResponse /> : <Activities />;
            case 'dashboard': return <Modules />;
            default: return <Modules />;
        }
    };
    
    let pageTitle = PAGE_TITLES[currentPage] || 'História Acessível';
    if (currentPage === 'module_view' && activeModule) pageTitle = activeModule.title;
    if (currentPage === 'class_view' && activeClass) pageTitle = activeClass.name;

    useEffect(() => { document.title = `${pageTitle} - História Acessível`; }, [pageTitle]);

    return (
        <div className="flex h-screen bg-slate-100 dark:bg-slate-900 hc-bg-override">
            <OfflineIndicator />
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-indigo-600 focus:rounded-md focus:shadow-lg transition-all">Pular para conteúdo</a>

            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <button onClick={toggleMobileMenu} className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm text-slate-600 dark:text-slate-300 shadow-md hc-button-override" aria-label="Abrir menu">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <Header title={pageTitle} isScrolled={isScrolled} />
                <main id="main-content" ref={mainContentRef} className="flex-1 overflow-y-auto py-6 sm:py-8 lg:py-10 px-3 sm:px-4 lg:px-6 relative" tabIndex={-1} aria-label="Conteúdo principal">
                    <ErrorBoundary>
                        <Suspense fallback={<LoadingSpinner />}>
                            <div className="h-full w-full">{renderPage()}</div>
                        </Suspense>
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
};

const AuthenticatedAppContent = () => {
    const { userRole } = useAuth();

    return (
        <NavigationProvider>
            {userRole === 'aluno' && (
                <StudentContextWrapper>
                    <MainLayout />
                </StudentContextWrapper>
            )}
            {userRole === 'professor' && (
                <TeacherContextWrapper>
                    <MainLayout />
                </TeacherContextWrapper>
            )}
            {userRole === 'admin' && (
                <AdminContextWrapper>
                    <MainLayout />
                </AdminContextWrapper>
            )}
        </NavigationProvider>
    );
};

const AppContent = () => {
    const { authState, user, createUserProfile, authError } = useAuth();
    const [onboardingStep, setOnboardingStep] = useState<'role' | 'year'>('role');
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);

    if (authState === 'loading') return <LoadingSpinner />;
    
    if (authState === 'unauthenticated') {
        return (
            <>
                <OfflineIndicator />
                <LoginPage initialError={authError} />
            </>
        );
    }
    
    // Onboarding Logic
    if (user && !user.role) {
        const handleError = (e: any) => setOnboardingError(e.message);
        
        if (onboardingStep === 'role') {
            return <RoleSelectionPage error={onboardingError} onRoleSelected={async (role) => {
                setOnboardingError(null);
                if (role === 'aluno') {
                    setSelectedRole('aluno');
                    setOnboardingStep('year');
                } else {
                    try { await createUserProfile(role); } catch (e) { handleError(e); }
                }
            }} />;
        }
        return <YearSelectionPage error={onboardingError} onYearSelected={async (year) => {
            setOnboardingError(null);
            if (selectedRole) {
                try { await createUserProfile(selectedRole, year); } catch (e) { handleError(e); }
            }
        }} />;
    }

    return <AuthenticatedAppContent />;
};

const App = () => {
    return (
        <AppProviders>
            <AppContent />
        </AppProviders>
    );
};

export default App;