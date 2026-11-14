import { useEffect, useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createSessionQueryClient, revokeTrackedObjectUrls } from './sessionQuery.js';
import { SessionCacheContext } from './sessionCacheStatus.js';

/**
 * Un QueryClient por montaje. AuthProvider le pone una key de usuario y taller,
 * así que cambiar de sesión desmonta este árbol y borra la caché anterior.
 * La caché no se escribe en localStorage ni IndexedDB.
 */
export function SessionQueryProvider({ children }) {
  const client = useMemo(() => createSessionQueryClient(), []);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event?.type !== 'updated') return;
      const error = event.query?.state?.error;
      if (error?.status === 401 || error?.status === 403) setRejected(true);
    });
    return () => {
      unsubscribe();
      revokeTrackedObjectUrls(client);
      client.clear();
    };
  }, [client]);

  const value = useMemo(() => ({ rejected }), [rejected]);

  return (
    <QueryClientProvider client={client}>
      <SessionCacheContext.Provider value={value}>
        {children}
      </SessionCacheContext.Provider>
    </QueryClientProvider>
  );
}
