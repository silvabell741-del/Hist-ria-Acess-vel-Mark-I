
import React, { useState, useEffect } from 'react';
import { useSync } from '../../contexts/SyncContext';
import { Modal } from './Modal'; // Assumindo que Modal já existe

const FailedItemsList: React.FC<{ 
    items: any[], 
    onRetry: (id: string) => void, 
    onDiscard: (id: string) => void 
}> = ({ items, onRetry, onDiscard }) => (
    <div className="space-y-3 max-h-60 overflow-y-auto">
        {items.map(item => (
            <div key={item.id} className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-sm border border-red-200 dark:border-red-800">
                <div className="flex justify-between font-bold text-red-800 dark:text-red-300">
                    <span>{item.type}</span>
                    <span className="text-xs">{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-red-600 dark:text-red-400 text-xs mt-1 truncate">{item.lastError || 'Erro desconhecido'}</p>
                <div className="flex gap-2 mt-2 justify-end">
                    <button onClick={() => onDiscard(item.id)} className="text-xs text-slate-500 hover:text-slate-700 underline">Descartar</button>
                    <button onClick={() => onRetry(item.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Tentar Novamente</button>
                </div>
            </div>
        ))}
    </div>
);

export const OfflineIndicator: React.FC = () => {
    const [showBackOnline, setShowBackOnline] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);

    let syncData: any = { isOnline: navigator.onLine, pendingCount: 0, failedCount: 0, isSyncing: false, syncProgress: null, failedQueue: [] };
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        syncData = useSync();
    } catch {}
    
    const { isOnline, pendingCount, failedCount, isSyncing, syncProgress, failedQueue, retryFailedAction, discardFailedAction } = syncData;

    useEffect(() => {
        const handleOnline = () => {
            setShowBackOnline(true);
            const timer = setTimeout(() => setShowBackOnline(false), 4000);
            return () => clearTimeout(timer);
        };
        const handleOffline = () => setShowBackOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Se houver falhas, prioridade máxima de alerta
    if (failedCount > 0 && !showFailedModal) {
        return (
            <>
                <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg border border-red-700 flex items-center justify-between animate-fade-in cursor-pointer hover:bg-red-700 transition-colors"
                     onClick={() => setShowFailedModal(true)}
                     role="alert"
                >
                    <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="font-bold text-sm">Falha na Sincronização</p>
                            <p className="text-xs text-red-100">{failedCount} itens não puderam ser enviados.</p>
                        </div>
                    </div>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded">Ver</span>
                </div>
                
                <Modal isOpen={showFailedModal} onClose={() => setShowFailedModal(false)} title="Itens com Falha">
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                        Os seguintes itens falharam após várias tentativas. Verifique sua conexão ou tente novamente.
                    </p>
                    <FailedItemsList 
                        items={failedQueue} 
                        onRetry={(id) => { retryFailedAction(id); if(failedCount <= 1) setShowFailedModal(false); }} 
                        onDiscard={(id) => { discardFailedAction(id); if(failedCount <= 1) setShowFailedModal(false); }}
                    />
                    <div className="mt-4 flex justify-end">
                        <button onClick={() => setShowFailedModal(false)} className="px-4 py-2 bg-slate-100 rounded text-sm font-semibold">Fechar</button>
                    </div>
                </Modal>
            </>
        );
    }

    if (!isOnline) {
        return (
            <div 
                className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-600 flex items-center justify-between animate-fade-in"
                role="alert"
            >
                <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                    </svg>
                    <div>
                        <p className="font-bold text-sm">Você está offline</p>
                        <p className="text-xs text-slate-300">
                            {pendingCount > 0 ? `${pendingCount} ações na fila.` : "Funcionalidades limitadas."}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isSyncing) {
        const current = syncProgress?.current || 0;
        const total = syncProgress?.total || pendingCount || 1;
        const progressPercent = Math.min((current / total) * 100, 100);

        return (
            <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg border border-blue-500 flex flex-col animate-fade-in">
                <div className="flex items-center mb-2">
                    <svg className="animate-spin h-5 w-5 text-white mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div>
                        <p className="font-bold text-sm">Sincronizando...</p>
                        <p className="text-xs text-blue-100">{syncProgress ? `Enviando ${current}/${total}...` : `Preparando...`}</p>
                    </div>
                </div>
                <div className="w-full bg-blue-800 rounded-full h-1.5">
                    <div className="bg-white h-1.5 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                </div>
            </div>
        );
    }

    if (showBackOnline) {
        return (
            <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg border border-green-500 flex items-center justify-between animate-fade-in">
                <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                        <p className="font-bold text-sm">Conexão restaurada</p>
                        <p className="text-xs text-green-100">Você está online.</p>
                    </div>
                </div>
                <button onClick={() => setShowBackOnline(false)} className="ml-4 text-green-200 hover:text-white">✕</button>
            </div>
        );
    }

    return null;
};
