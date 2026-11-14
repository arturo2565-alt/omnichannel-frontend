import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createSessionQueryClient, revokeTrackedObjectUrls, sessionWasRejected } from './sessionQuery.js';
import { SessionCacheContext } from './sessionCacheStatus.js';

/**
 * Un QueryClient por montaje. AuthProvider le pone una key de usuario y taller,
 * así que cambiar de sesión desmonta este árbol y borra la caché anterior.
 * La caché no se escribe en localStorage ni IndexedDB.
 */
export function SessionQueryProvider({ children }) {
  const markRejected = useRef(() => {});
  const client = useMemo(() => {
    const created = createSessionQueryClient();
    created.__pegazuzOnReject = () => markRejected.current();
    return created;
  }, []);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    markRejected.current = () => setRejected(true);
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (sessionWasRejected(client)) {
        setRejected(true);
        return;
      }
      if (event?.type !== 'updated') return;
      const error = event.query?.state?.error;
      if (error?.status === 401 || error?.status === 403) setRejected(true);
    });
    return () => {
      markRejected.current = () => {};
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
