import { createContext, useContext } from 'react';

export const SessionCacheContext = createContext({ rejected: false });

export function useSessionCacheStatus() {
  return useContext(SessionCacheContext);
}
