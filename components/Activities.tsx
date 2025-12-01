
import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { Card } from './common/Card';
import { useStudentAcademic } from '../contexts/StudentAcademicContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useAuth } from '../contexts/AuthContext';
import type { Activity, ActivitySubmission } from '../types';
import { SpinnerIcon } from '../constants/index';
import { cleanActivity } from '../utils/cleanActivity';
import { QueryDocumentSnapshot, query, collection, where, orderBy, limit, startAfter, getDocs, doc, getDoc, documentId } from 'firebase/firestore';
import { db } from './firebaseClient';
import { useSettings } from '../contexts/SettingsContext';
import { useInfiniteQuery } from '@tanstack/react-query';

const isRecent = (dateInput?: string | any) => {
    if (!dateInput) return false;
    let date: Date;
    if (dateInput?.toDate) {
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }
    
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 3;
};

const ActivityCard: React.FC<{ activity: Activity; submission?: ActivitySubmission; onClick: () => void }> = ({ activity, submission, onClick }) => {
    const { theme } = useSettings();
    const isAurora = theme === 'galactic-aurora';
    const isDragon = theme === 'dragon-year';
    const isEmerald = theme === 'emerald-sovereignty';

    const studentSubmission = submission;
    let statusText: string | null = null;
    let statusColor: string = '';

    // Prioridade Visual: Se tem submissão, mostra o status real. Se não, não mostra badge "A Fazer".
    if (studentSubmission) {
        statusText = studentSubmission.status;
        if (statusText === 'Corrigido') {
            statusColor = 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-800';
        } else if (statusText === 'Aguardando correção' || statusText === 'Entregue') {
            statusColor = 'bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-800';
        } else {
            // Fallback
            statusColor = 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
        }
    }

    // Tag Styles based on Theme
    let materiaColor = '';
    let unidadeColor = '';
    let typeColor = '';

    if (isAurora) {
        materiaColor = 'bg-black text-[#E0AAFF] border border-[#E0AAFF]/40'; 
        unidadeColor = 'bg-[#1a1b26] text-white border border-[#2E2F3E]'; 
        typeColor = 'bg-black text-[#99F6E4] border border-[#99F6E4]/40'; 
    } else if (isDragon) {
        materiaColor = 'bg-[#5D0E0E] text-[#FFD700] border border-[#B71C1C]'; 
        unidadeColor = 'bg-[#FFF8E7] text-[#3E2723] border border-[#8D6E63]'; 
        typeColor = 'bg-[#2E7D32] text-white border border-[#1B5E20]'; 
    } else if (isEmerald) {
        materiaColor = 'bg-[#064E3B] text-[#34D399] border border-[#D4AF37]';
        unidadeColor = 'bg-[#1F2937] text-[#E5E7EB] border border-[#374151]'; 
        typeColor = 'bg-black text-[#D4AF37] border border-[#D4AF37]'; 
    } else {
        const materiaColorMap: { [key: string]: string } = {
            'História': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
            'Geografia': 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
            'Ciências': 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
            'História Sergipana': 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
        };
        materiaColor = activity.materia ? materiaColorMap[activity.materia] || 'bg-gray-100 text-gray-700 border border-gray-200' : 'bg-gray-100 text-gray-700 border border-gray-200';
        unidadeColor = 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
        typeColor = 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-600 dark:text-slate-300 dark:border-slate-500';
    }

    const isNew = !studentSubmission && isRecent(activity.createdAt);
    const isRecentlyGraded = studentSubmission?.status === 'Corrigido' && isRecent(studentSubmission.gradedAt);

    let newBadgeClass = "absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-sm z-10";
    if (isAurora) {
        newBadgeClass = "absolute top-0 right-0 bg-[#00B7FF] text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-[0_0_10px_#00B7FF] border-l border-b border-[#00B7FF] z-10";
    }

    const typeInfo = activity.items ? `${activity.items.length} questões` : activity.type;
    const dateInfo = activity.dueDate ? `Prazo: ${new Date(activity.dueDate).toLocaleDateString('pt-BR')}` : 'Sem prazo definido';
    const statusInfo = statusText || 'A fazer';
    const pointsInfo = `${activity.points} pontos`;
    
    const fullDescription = `Atividade: ${activity.title}. 
    Matéria: ${activity.materia || 'Geral'}. 
    Unidade: ${activity.unidade || 'Geral'}. 
    Tipo: ${typeInfo}. 
    Status: ${statusInfo}. 
    Valor: ${pointsInfo}. 
    ${dateInfo}.
    Descrição: ${activity.description}`;

    return (
        <Card className="flex flex-col h-full group dark:hover:bg-slate-700/50 cursor-pointer relative overflow-hidden" >
            <button 
                onClick={onClick} 
                className="text-left flex flex-col h-full w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg"
                aria-label={fullDescription}
            >
                {isNew && (
                    <div className={newBadgeClass} aria-hidden="true">
                        NOVA
                    </div>
                )}
                {isRecentlyGraded && (
                    <div className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-sm z-10" aria-hidden="true">
                        NOTA DISPONÍVEL
                    </div>
                )}

                <div className="flex-grow">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors hc-text-primary pr-8 line-clamp-2" aria-hidden="true">{activity.title}</h3>
                    </div>
                    
                    {statusText && (
                        <div className="mb-3" aria-hidden="true">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide ${statusColor}`}>
                                {statusText}
                            </span>
                        </div>
                    )}

                     <div className="flex items-center flex-wrap gap-2 mt-3 text-xs font-medium" aria-hidden="true">
                        {activity.unidade && <span className={`px-2 py-1 rounded ${unidadeColor}`}>{activity.unidade}</span>}
                        {activity.materia && <span className={`px-2 py-1 rounded ${materiaColor}`}>{activity.materia}</span>}
                        <span className={`px-2 py-1 rounded ${typeColor}`}>
                            {activity.items ? `${activity.items.length} questão(ões)` : activity.type}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 flex-grow hc-text-secondary line-clamp-2" aria-hidden="true">{activity.description}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm text-slate-500 dark:text-slate-400 hc-text-secondary" aria-hidden="true">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{activity.className || 'Turma desconhecida'}</span>
                    <div className="space-x-4">
                        <span className="font-bold">{activity.points} pts</span>
                        {activity.dueDate && <span>Prazo: {new Date(activity.dueDate).toLocaleDateString('pt-BR')}</span>}
                    </div>
                </div>
            </button>
        </Card>
    );
};


const Activities: React.FC = () => {
    // Destructure isLoading from context. This loading state aggregates (classes + submissions + progress)
    const { studentClasses, userSubmissions, isLoading: isContextLoading } = useStudentAcademic();
    const { openActivity } = useNavigation(); 
    const { user } = useAuth();
    const { theme } = useSettings();
    const isAurora = theme === 'galactic-aurora';
    
    const [selectedClassId, setSelectedClassId] = useState('all');
    const [selectedUnidade, setSelectedUnidade] = useState('all');
    const [selectedMateria, setSelectedMateria] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('a_fazer'); 

    // CRITICAL: Safe fallback to empty object to prevent "Cannot read properties of undefined" crash
    // if context updates partially during mount.
    const safeSubmissions = userSubmissions || {};
    const safeStudentClasses = studentClasses || [];
    
    const unidadeOptions = ['1ª Unidade', '2ª Unidade', '3ª Unidade', '4ª Unidade'];
    const materiaOptions = ['História', 'Geografia', 'Filosofia', 'Sociologia', 'História Sergipana'];

    // Helper: Fetch by ID batch (Firestore 'in' limit is 10)
    const fetchActivitiesByIds = async (ids: string[]) => {
        if (ids.length === 0) return [];
        
        // Chunk ids into groups of 10
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) {
            chunks.push(ids.slice(i, i + 10));
        }
        
        const promises = chunks.map(chunk => {
            const q = query(collection(db, "activities"), where(documentId(), "in", chunk));
            return getDocs(q);
        });
        
        const snapshots = await Promise.all(promises);
        const allDocs = snapshots.flatMap(snap => snap.docs);
        return allDocs;
    };

    // Gera uma assinatura das submissões para invalidar a query quando carregarem
    const submissionsSignature = useMemo(() => {
        return Object.keys(safeSubmissions).sort().map(key => `${key}:${safeSubmissions[key].status}`).join('|');
    }, [safeSubmissions]);

    // --- Infinite Query Logic ---
    const fetchActivitiesPage = async ({ pageParam }: { pageParam: string | null }) => {
        if (!user) return { activities: [], lastId: null };

        // 1. STRATEGY: ID-Based Fetching for specific status (Pendente/Corrigida)
        // This ensures we find them regardless of pagination depth
        if (selectedStatus === 'pendente' || selectedStatus === 'corrigida') {
            // Se estamos na pagina 2 ou mais de um filtro especifico, e a lógica de pageParam
            // não foi feita para isso, paramos. Aqui assumimos carregamento único para essas listas filtradas.
            if (pageParam) return { activities: [], lastId: null };

            const targetStatus = selectedStatus === 'pendente' ? 'Aguardando correção' : 'Corrigido';
            
            // Get relevant activity IDs from submissions map
            const relevantIds = Object.keys(safeSubmissions).filter(id => {
                const sub = safeSubmissions[id];
                return sub && sub.status === targetStatus;
            });

            if (relevantIds.length === 0) {
                return { activities: [], lastId: null };
            }

            const docs = await fetchActivitiesByIds(relevantIds);
            
            const results = docs.map(d => {
                const data = d.data();
                let className = data.className;
                if (!className || className === 'Turma desconhecida') {
                    const cls = safeStudentClasses.find(c => c.id === data.classId);
                    if (cls) className = cls.name;
                }
                return {
                    id: d.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                    dueDate: data.dueDate,
                    className: className || 'Turma'
                } as Activity;
            });

            // Client-side Sort
            results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            return { activities: results, lastId: null };
        }

        // 2. STRATEGY: Standard Pagination for "All" or "To Do"
        let q = query(
            collection(db, "activities"),
            where("isVisible", "==", true),
            orderBy("createdAt", "desc"),
            limit(10) // Paginacao
        );

        if (selectedClassId !== 'all') {
            q = query(q, where("classId", "==", selectedClassId));
        } else {
            const myClassIds = safeStudentClasses.map(c => c.id);
            if (myClassIds.length > 0) {
                const classChunk = myClassIds.slice(0, 10);
                q = query(q, where("classId", "in", classChunk));
            } else {
                return { activities: [], lastId: null }; 
            }
        }

        if (selectedMateria !== 'all') {
            q = query(q, where("materia", "==", selectedMateria));
        }

        if (selectedUnidade !== 'all') {
            q = query(q, where("unidade", "==", selectedUnidade));
        }

        if (pageParam) {
            try {
                const cursorRef = doc(db, "activities", pageParam);
                const cursorSnap = await getDoc(cursorRef);
                if (cursorSnap.exists()) {
                    q = query(q, startAfter(cursorSnap));
                }
            } catch (e) {
                console.warn("Could not rehydrate activity cursor", e);
            }
        }

        const snap = await getDocs(q);
        const results = snap.docs.map(d => {
            const data = d.data();
            let className = data.className;
            if (!className || className === 'Turma desconhecida') {
                const cls = safeStudentClasses.find(c => c.id === data.classId);
                if (cls) className = cls.name;
            }
            return {
                id: d.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
                dueDate: data.dueDate,
                className: className || 'Turma'
            } as Activity;
        });

        return { 
            activities: results, 
            lastId: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null 
        };
    };

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status,
        refetch
    } = useInfiniteQuery({
        // Adicionamos 'submissionsSignature' à chave para forçar refetch quando as submissões forem carregadas ou atualizadas
        queryKey: ['activities', user?.id, selectedClassId, selectedMateria, selectedUnidade, selectedStatus, submissionsSignature],
        queryFn: fetchActivitiesPage,
        getNextPageParam: (lastPage) => lastPage.lastId || undefined,
        initialPageParam: null,
        enabled: !!user && safeStudentClasses.length > 0
    });

    // --- Client-Side Filtering (Refined) ---
    const displayedActivities = useMemo(() => {
        const allActivities = data?.pages.flatMap(page => page.activities) || [];
        
        // If we are in specific modes, the query already filtered IDs
        if (selectedStatus === 'pendente' || selectedStatus === 'corrigida') {
            return allActivities.filter(activity => {
                if (selectedClassId !== 'all' && activity.classId !== selectedClassId) return false;
                if (selectedMateria !== 'all' && activity.materia !== selectedMateria) return false;
                if (selectedUnidade !== 'all' && activity.unidade !== selectedUnidade) return false;
                return true;
            });
        }

        // For 'a_fazer', we perform client-side exclusion of submitted items
        if (selectedStatus === 'a_fazer') {
            return allActivities.filter(activity => {
                // SAFETY: Use safeSubmissions here to prevent crash
                const studentSubmission = safeSubmissions[activity.id];
                // Show if no submission OR if submission is pending offline sync (not yet real submission)
                return !studentSubmission || studentSubmission.status === 'Pendente Envio';
            });
        }

        // For 'all', show everything
        return allActivities;

    }, [data, safeSubmissions, selectedStatus, selectedClassId, selectedMateria, selectedUnidade]);

    const handleSearch = () => {
        refetch();
    };

    const handleActivityClick = (activity: Activity) => {
        // SAFETY: Use safeSubmissions
        const activityWithSub = { 
            ...cleanActivity(activity), 
            submissions: safeSubmissions[activity.id] ? [safeSubmissions[activity.id]] : [] 
        };
        openActivity(activityWithSub);
    };
    
    const filterSelectClasses = "flex-grow md:w-auto p-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus:outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200";

    let searchButtonClass = "w-full md:w-auto px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors dark:ring-offset-slate-800 hc-button-primary-override";
    if (isAurora) {
        searchButtonClass = "w-full md:w-auto px-6 py-2.5 bg-[#00B7FF] text-white font-semibold rounded-lg hover:bg-[#0099CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7FF] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(0,183,255,0.6)] border border-[#00B7FF] hc-button-primary-override";
    }

    // --- CRITICAL LOADING CHECK ---
    // If context is loading (submissions not ready), don't render list to avoid flicker/race/crash
    const isLoadingCombined = isContextLoading || status === 'pending';

    return (
        <div className="space-y-6">
            <p className="text-slate-500 dark:text-slate-400 hc-text-secondary">Encontre e realize suas atividades escolares.</p>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 flex flex-col md:flex-row flex-wrap items-center gap-4 hc-bg-override hc-border-override border border-slate-200 dark:border-slate-700">
                
                <div className="w-full md:w-auto flex-grow grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="flex flex-col">
                        <label htmlFor="status-filter" className="sr-only">Status</label>
                        <select id="status-filter" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className={filterSelectClasses}>
                            <option value="a_fazer">A Fazer</option>
                            <option value="pendente">Aguardando Correção</option>
                            <option value="corrigida">Corrigidas</option>
                            <option value="all">Todas</option>
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="class-filter" className="sr-only">Turma</label>
                        <select id="class-filter" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className={filterSelectClasses}>
                            <option value="all">Todas as turmas</option>
                            {safeStudentClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="materia-filter" className="sr-only">Matéria</label>
                        <select id="materia-filter" value={selectedMateria} onChange={e => setSelectedMateria(e.target.value)} className={filterSelectClasses}>
                            <option value="all">Todas as matérias</option>
                            {materiaOptions.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col">
                        <label htmlFor="unidade-filter" className="sr-only">Unidade</label>
                        <select id="unidade-filter" value={selectedUnidade} onChange={e => setSelectedUnidade(e.target.value)} className={filterSelectClasses}>
                            <option value="all">Todas as unidades</option>
                            {unidadeOptions.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleSearch}
                    disabled={isFetching}
                    className={searchButtonClass}
                >
                    {isFetching && !isLoadingCombined ? <SpinnerIcon className="h-5 w-5 text-white" /> : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Buscar
                        </>
                    )}
                </button>
            </div>

            {isLoadingCombined ? (
                 <div className="text-center py-20">
                    <SpinnerIcon className="h-10 w-10 text-indigo-500 mx-auto mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">
                        {isContextLoading ? 'Sincronizando histórico...' : 'Buscando atividades...'}
                    </p>
                </div>
            ) : displayedActivities.length > 0 ? (
                <>
                    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        {displayedActivities.map(activity => (
                            <li key={activity.id}>
                                <ActivityCard 
                                    activity={activity} 
                                    submission={safeSubmissions[activity.id]}
                                    onClick={() => handleActivityClick(activity)} 
                                />
                            </li>
                        ))}
                    </ul>
                    {hasNextPage && selectedStatus === 'all' && (
                        <div className="flex justify-center pt-6">
                            <button
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="px-6 py-2 text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-indigo-400 dark:border-indigo-400 dark:hover:bg-slate-800 transition-colors font-semibold flex items-center"
                            >
                                {isFetchingNextPage && <SpinnerIcon className="h-4 w-4 mr-2 text-current" />}
                                {isFetchingNextPage ? 'Carregando...' : 'Carregar Mais'}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <Card className="text-center py-20">
                    <div className="flex justify-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 hc-text-primary">Nenhuma atividade encontrada</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 hc-text-secondary">
                        {selectedStatus === 'a_fazer' ? 'Tudo pronto! Você não tem atividades pendentes.' : 'Tente ajustar os filtros para encontrar o que procura.'}
                    </p>
                </Card>
            )}
        </div>
    );
};

export default Activities;
