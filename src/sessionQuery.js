import { QueryClient, QueryCache } from '@tanstack/react-query';

/**
 * Caché de sesión en memoria. Las claves incluyen usuario y taller.
 * No hay persistor: al cambiar la sesión se crea otro QueryClient.
 */

export function sessionScope(user, taller) {
  const userId = String(user?.id ?? '').trim();
  const tallerId = String(taller?.id ?? user?.tallerId ?? '').trim();
  return { userId, tallerId };
}

export function sessionScopeKey(scope) {
  return `${scope.userId}\u0000${scope.tallerId}`;
}

export function hasSessionScope(scope) {
  return Boolean(scope?.userId && scope?.tallerId);
}

export function workshopKey(scope, ...parts) {
  return ['workshop', scope.userId, scope.tallerId, ...parts];
}

export function isAuthRejection(error) {
  return error?.status === 401 || error?.status === 403;
}

export function createSessionQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isAuthRejection(error)) rejectCachedSession(client);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}

export function rejectCachedSession(client) {
  client.__pegazuzAuthRejected = true;
  client.cancelQueries();
  client.clear();
}

export function sessionWasRejected(client) {
  return client?.__pegazuzAuthRejected === true;
}

export function chronologicalMessages(payload) {
  const list = Array.isArray(payload) ? payload : [];
  return [...list].reverse();
}

export function appendMessage(messages, incoming) {
  const list = Array.isArray(messages) ? messages : [];
  if (incoming?.id && list.some((item) => item.id === incoming.id)) return list;
  return [...list, incoming];
}

export function applyIncomingMessage(client, scope, message) {
  const conversationId = String(message?.conversationId || message?.conversation?.id || '');
  if (!conversationId || !hasSessionScope(scope)) {
    return { conversationId, appended: false };
  }
  const key = workshopKey(scope, 'messages', conversationId);
  let appended = false;
  client.setQueryData(key, (current) => {
    if (!Array.isArray(current)) return current;
    const next = appendMessage(current, message);
    appended = next.length !== current.length;
    return next;
  });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'conversations') });
  if (!appended) void client.invalidateQueries({ queryKey: key });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'dashboard') });
  return { conversationId, appended };
}

export function applyConversationPatch(client, scope, conversationId, patch) {
  if (!hasSessionScope(scope) || !conversationId) return;
  const key = workshopKey(scope, 'conversations');
  client.setQueryData(key, (current) => {
    if (!Array.isArray(current)) return current;
    return current.map((item) => (
      item.id === conversationId ? { ...item, ...patch } : item
    ));
  });
  void client.invalidateQueries({ queryKey: key });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'dashboard') });
}

export function syncAfterOutboundMessage(client, scope, conversationId, options = {}) {
  if (!hasSessionScope(scope) || !conversationId) return;
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'messages', conversationId) });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'conversations') });
  if (options.affectsDashboard) {
    void client.invalidateQueries({ queryKey: workshopKey(scope, 'dashboard') });
  }
}

export function syncAfterSocketReconnect(client, scope) {
  if (!hasSessionScope(scope)) return;
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'conversations') });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'messages') });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'dashboard') });
}

/** La primera conexión no dispara otra carga; la reconexión sí. */
export function nextSocketConnect(state) {
  const shouldSync = state?.connectedBefore === true;
  return { connectedBefore: true, shouldSync };
}

export function dashboardVisitState({ hasData, isFetching, isError, authRejected }) {
  if (authRejected) return 'rejected';
  if (!hasData && isFetching) return 'loading';
  if (!hasData && isError) return 'error';
  if (hasData && isFetching) return 'unconfirmed';
  if (hasData && isError) return 'stale-failed';
  if (hasData) return 'confirmed';
  return 'loading';
}

export async function readWorkshopResponse(response) {
  if (response?.status === 401 || response?.status === 403) {
    const error = new Error(response.status === 401 ? 'Sesión expirada.' : 'No autorizado');
    error.status = response.status;
    throw error;
  }
  if (!response?.ok) {
    const error = new Error(`HTTP ${response?.status ?? 0}`);
    error.status = response?.status ?? 0;
    throw error;
  }
  return response.json();
}
