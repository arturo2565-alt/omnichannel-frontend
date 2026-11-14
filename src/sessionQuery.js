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

export function isSessionObjectUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:');
}

export function trackObjectUrl(client, url) {
  if (!client || !isSessionObjectUrl(url)) return null;
  if (!client.__pegazuzObjectUrls) client.__pegazuzObjectUrls = new Set();
  client.__pegazuzObjectUrls.add(url);
  return url;
}

export function retainPhotoUrl(client, previous, next) {
  if (isSessionObjectUrl(previous) && previous !== next) forgetObjectUrl(client, previous);
  return trackObjectUrl(client, next);
}

export function forgetObjectUrl(client, url) {
  if (!isSessionObjectUrl(url)) return;
  client?.__pegazuzObjectUrls?.delete(url);
  if (typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* La URL ya no estaba activa. */
  }
}

export function revokeTrackedObjectUrls(client) {
  const urls = client?.__pegazuzObjectUrls;
  if (!urls) return [];
  const revoked = [...urls];
  for (const url of revoked) forgetObjectUrl(client, url);
  return revoked;
}

export function rejectCachedSession(client) {
  client.__pegazuzAuthRejected = true;
  revokeTrackedObjectUrls(client);
  client.cancelQueries();
  client.clear();
  client.__pegazuzOnReject?.();
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

/** Una actualización breve no alcanza a mostrarse. Una larga deja de parecer instantánea. */
export const CALIBRATION_SYNC_DELAY_MS = 400;
export const CALIBRATION_SLOW_DELAY_MS = 8000;

/**
 * El centro conserva los datos en silencio.
 * El icono aparece solo si la actualización se nota, y el aviso solo si falla o se prolonga.
 */
export function calibrationRefreshIndicator({
  hasData,
  isFetching,
  isError,
  authRejected,
  elapsedMs = 0,
}) {
  if (authRejected || !hasData) return 'quiet';
  if (isFetching) {
    if (elapsedMs >= CALIBRATION_SLOW_DELAY_MS) return 'slow';
    if (elapsedMs >= CALIBRATION_SYNC_DELAY_MS) return 'syncing';
    return 'quiet';
  }
  if (isError) return 'stale';
  return 'quiet';
}

export const SCHEDULING_REFRESH_MS = 80;

export function beginQueryEpoch(client, name) {
  if (!client.__pegazuzEpoch) client.__pegazuzEpoch = {};
  client.__pegazuzEpoch[name] = (client.__pegazuzEpoch[name] ?? 0) + 1;
  return client.__pegazuzEpoch[name];
}

export function queryEpoch(client, name) {
  return client?.__pegazuzEpoch?.[name] ?? 0;
}

/** Una lectura vieja no sustituye un guardado o una lista más nueva. */
export function finishQueryEpoch(client, name, epoch, value, current) {
  if (sessionWasRejected(client)) {
    const error = new Error('Sesión expirada.');
    error.status = 401;
    throw error;
  }
  if (queryEpoch(client, name) !== epoch) {
    if (current !== undefined) return current;
    const replaced = new Error('Consulta reemplazada.');
    replaced.replaced = true;
    throw replaced;
  }
  return value;
}

export function normalizeCatalogView(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    rules: source.rules ?? null,
    pieceBases: Array.isArray(source.pieceBases) ? source.pieceBases : [],
    integralBases: Array.isArray(source.integralBases) ? source.integralBases : [],
    montajePinturaBases: Array.isArray(source.montajePinturaBases) ? source.montajePinturaBases : [],
    montajeBases: Array.isArray(source.montajeBases) ? source.montajeBases : [],
  };
}

export function publishCatalogView(client, scope, view) {
  beginQueryEpoch(client, 'catalog-view');
  const normalized = normalizeCatalogView(view);
  client.setQueryData(workshopKey(scope, 'catalog-view'), normalized);
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'crm-catalog-offer') });
  return normalized;
}

export function publishCatalogRules(client, scope, rules) {
  beginQueryEpoch(client, 'catalog-view');
  client.setQueryData(workshopKey(scope, 'catalog-view'), (current) => ({
    ...normalizeCatalogView(current),
    rules: rules ?? null,
  }));
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'crm-catalog-offer') });
}

export function invalidateCatalogView(client, scope) {
  beginQueryEpoch(client, 'catalog-view');
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'catalog-view') });
  void client.invalidateQueries({ queryKey: workshopKey(scope, 'crm-catalog-offer') });
}

function appointmentKeys(scope, item) {
  const keys = [workshopKey(scope, 'appointments')];
  if (item?.source === 'manual') keys.push(workshopKey(scope, 'crm-appointments'));
  return keys;
}

export function upsertCachedAppointment(client, scope, item) {
  if (!item?.id || !hasSessionScope(scope)) return;
  beginQueryEpoch(client, 'appointments');
  beginQueryEpoch(client, 'crm-appointments');
  for (const key of appointmentKeys(scope, item)) {
    client.setQueryData(key, (current) => {
      if (!Array.isArray(current)) return current;
      const index = current.findIndex((row) => row.id === item.id);
      if (index === -1) return [...current, item];
      const next = current.slice();
      next[index] = { ...current[index], ...item };
      return next;
    });
  }
}

export function patchCachedAppointment(client, scope, id, patch) {
  if (!id || !hasSessionScope(scope)) return;
  beginQueryEpoch(client, 'appointments');
  beginQueryEpoch(client, 'crm-appointments');
  for (const key of [workshopKey(scope, 'appointments'), workshopKey(scope, 'crm-appointments')]) {
    client.setQueryData(key, (current) => {
      if (!Array.isArray(current)) return current;
      return current.map((row) => (row.id === id ? { ...row, ...patch } : row));
    });
  }
}

/** Mutación y socket cercanos disparan una sola revalidación de agenda y CRM. */
export function scheduleSchedulingRefresh(client, scope) {
  if (!client || !hasSessionScope(scope) || sessionWasRejected(client)) return;
  if (client.__schedulingRefresh) clearTimeout(client.__schedulingRefresh);
  client.__schedulingRefresh = setTimeout(() => {
    client.__schedulingRefresh = null;
    if (sessionWasRejected(client)) return;
    void client.invalidateQueries({ queryKey: workshopKey(scope, 'appointments') });
    void client.invalidateQueries({ queryKey: workshopKey(scope, 'crm-appointments') });
    void client.invalidateQueries({ queryKey: workshopKey(scope, 'crm-suggestions') });
  }, SCHEDULING_REFRESH_MS);
}

export function schedulingEventMatches(payload, tallerId) {
  const eventTaller = String(payload?.tallerId ?? '').trim();
  const current = String(tallerId ?? '').trim();
  return Boolean(eventTaller && current && eventTaller === current);
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
