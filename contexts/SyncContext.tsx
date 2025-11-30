
import React, { createContext, useContext } from 'react';

// STUB: This context is deprecated in favor of Firebase Native Offline Persistence.
// Kept temporarily to prevent build errors during migration if any imports remain.

const SyncContext = createContext<any>(undefined);

export function SyncProvider({ children }: { children?: React.ReactNode }) {
    return (
        <SyncContext.Provider value={{}}>
            {children}
        </SyncContext.Provider>
    );
}

export const useSync = () => {
    // Return a dummy object so legacy calls don't crash immediately, 
    // though they should be removed.
    return {
        addOfflineAction: async () => console.warn("SyncContext is deprecated. Use native Firebase offline support."),
        isOnline: navigator.onLine
    };
};
