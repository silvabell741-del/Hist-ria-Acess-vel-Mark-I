
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import type { OfflineAction, OfflineActionType } from '../types';
import { executeSubmitActivity, executeGradeActivity, executePostNotice } from '../utils/offlineActions';
import { useToast } from './ToastContext';

const QUEUE_KEY = 'offline_action_queue';
const FAILED_QUEUE_KEY = 'offline_failed_queue';
const MAX_RETRIES = 3;

export interface SyncProgress {
    current: number;
    total: number;
}

interface SyncContextType {
    pendingCount: number;
    failedCount: number;
    isSyncing: boolean;
    isOnline: boolean;
    syncProgress: SyncProgress | null;
    failedQueue: OfflineAction[];
    addOfflineAction: (type: OfflineActionType, payload: any) => Promise<void>;
    syncNow: () => Promise<void>;
    retryFailedAction: (actionId: string) => Promise<void>;
    discardFailedAction: (actionId: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children?: React.ReactNode }) {
    const [queue, setQueue] = useState<OfflineAction[]>([]);
    const [failedQueue, setFailedQueue] = useState<OfflineAction[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const { addToast } = useToast();

    // 1. Load Queues on Mount
    useEffect(() => {
        const loadQueues = async () => {
            const storedQueue = await get<OfflineAction[]>(QUEUE_KEY);
            if (storedQueue) setQueue(storedQueue);
            
            const storedFailed = await get<OfflineAction[]>(FAILED_QUEUE_KEY);
            if (storedFailed) setFailedQueue(storedFailed);
        };
        loadQueues();
    }, []);

    // 2. Monitor Online Status
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            syncNow();
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []); 

    // 3. Add Action to Queue
    const addOfflineAction = useCallback(async (type: OfflineActionType, payload: any) => {
        const newAction: OfflineAction = {
            id: crypto.randomUUID(),
            type,
            payload,
            timestamp: Date.now(),
            retryCount: 0
        };

        const updatedQueue = [...queue, newAction];
        setQueue(updatedQueue);
        await set(QUEUE_KEY, updatedQueue);
    }, [queue]);

    // 4. Process Queue (Sync)
    const syncNow = async () => {
        const storedQueue = await get<OfflineAction[]>(QUEUE_KEY);
        if (!storedQueue || storedQueue.length === 0) return;

        setIsSyncing(true);
        setSyncProgress({ current: 0, total: storedQueue.length });
        
        let successCount = 0;
        const remainingQueue: OfflineAction[] = [];
        const newFailed: OfflineAction[] = [];

        for (const [index, action] of storedQueue.entries()) {
            setSyncProgress({ current: index + 1, total: storedQueue.length });
            try {
                switch (action.type) {
                    case 'SUBMIT_ACTIVITY':
                        await executeSubmitActivity(action.payload);
                        break;
                    case 'GRADE_ACTIVITY':
                        await executeGradeActivity(action.payload);
                        break;
                    case 'POST_NOTICE':
                        await executePostNotice(action.payload);
                        break;
                }
                successCount++;
            } catch (error: any) {
                console.error(`Failed to sync action ${action.type}:`, error);
                
                // Retry Logic
                const currentRetries = action.retryCount || 0;
                if (currentRetries < MAX_RETRIES) {
                    // Backoff delay before next try? For now, we just keep it in queue for next sync cycle
                    // or user manual trigger.
                    const updatedAction = { 
                        ...action, 
                        retryCount: currentRetries + 1,
                        lastError: error.message 
                    };
                    remainingQueue.push(updatedAction);
                } else {
                    // Move to DLQ
                    const failedAction = {
                        ...action,
                        lastError: error.message
                    };
                    newFailed.push(failedAction);
                }
            }
        }

        // Update Queues
        setQueue(remainingQueue);
        await set(QUEUE_KEY, remainingQueue);
        
        if (newFailed.length > 0) {
            const updatedFailedQueue = [...failedQueue, ...newFailed];
            setFailedQueue(updatedFailedQueue);
            await set(FAILED_QUEUE_KEY, updatedFailedQueue);
            addToast(`${newFailed.length} itens falharam permanentemente. Verifique a lista de erros.`, 'error');
        }

        setIsSyncing(false);
        setSyncProgress(null);

        if (successCount > 0) {
            addToast(`${successCount} itens sincronizados com sucesso!`, 'success');
        }
    };

    const retryFailedAction = async (actionId: string) => {
        const actionToRetry = failedQueue.find(a => a.id === actionId);
        if (!actionToRetry) return;

        // Move back to main queue with reset retry count
        const resetAction = { ...actionToRetry, retryCount: 0, lastError: undefined };
        const newQueue = [...queue, resetAction];
        
        const newFailedQueue = failedQueue.filter(a => a.id !== actionId);
        
        setQueue(newQueue);
        setFailedQueue(newFailedQueue);
        
        await set(QUEUE_KEY, newQueue);
        await set(FAILED_QUEUE_KEY, newFailedQueue);
        
        syncNow(); // Try immediately
    };

    const discardFailedAction = async (actionId: string) => {
        const newFailedQueue = failedQueue.filter(a => a.id !== actionId);
        setFailedQueue(newFailedQueue);
        await set(FAILED_QUEUE_KEY, newFailedQueue);
    };

    return (
        <SyncContext.Provider value={{ 
            pendingCount: queue.length, 
            failedCount: failedQueue.length,
            isSyncing, 
            isOnline,
            syncProgress,
            failedQueue,
            addOfflineAction, 
            syncNow,
            retryFailedAction,
            discardFailedAction
        }}>
            {children}
        </SyncContext.Provider>
    );
}

export const useSync = () => {
    const context = useContext(SyncContext);
    if (context === undefined) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
};
