import { QueryClient } from '@tanstack/react-query';
import { createIDBPersister } from './queryPersister';

// Setup React Query Client with Persistence
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 60 * 24, // 24 hours fresh
            gcTime: 1000 * 60 * 60 * 24, // 24 hours garbage collection
            retry: 1,
            refetchOnWindowFocus: false,
            networkMode: 'offlineFirst',
        },
    },
});

export const persister = createIDBPersister();