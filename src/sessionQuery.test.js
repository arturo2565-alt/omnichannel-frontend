import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyConversationPatch,
  applyIncomingMessage,
  createSessionQueryClient,
  dashboardVisitState,
  hasSessionScope,
  isAuthRejection,
  nextSocketConnect,
  readWorkshopResponse,
  rejectCachedSession,
  sessionScope,
  sessionScopeKey,
  syncAfterOutboundMessage,
  syncAfterSocketReconnect,
  workshopKey,
} from './sessionQuery.js';

const owner = { id: 'user-owner', tallerId: 'taller-a' };
const other = { id: 'user-agent', tallerId: 'taller-b' };
const scope = sessionScope(owner, { id: 'taller-a' });
const otherScope = sessionScope(other, { id: 'taller-b' });

function listKey(current = scope) {
  return workshopKey(current, 'conversations');
}

function messageKey(conversationId, current = scope) {
  return workshopKey(current, 'messages', conversationId);
}

function dashboardKey(current = scope) {
  return workshopKey(current, 'dashboard', 'kpis');
}

test('la primera visita no tiene datos y la segunda los conserva', async () => {
  const client = createSessionQueryClient();
  const key = listKey();
  assert.equal(client.getQueryData(key), undefined);
  let calls = 0;
  await client.prefetchQuery({
    queryKey: key,
    queryFn: async () => {
      calls += 1;
      return [{ id: 'c1', status: 'nuevo' }];
    },
  });
  assert.equal(calls, 1);
  assert.equal(client.getQueryData(key)[0].id, 'c1');

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const refreshing = client.fetchQuery({
    queryKey: key,
    queryFn: () => gate,
  });
  assert.equal(client.getQueryData(key)[0].id, 'c1');
  release([{ id: 'c1', status: 'nuevo', fresh: true }]);
  await refreshing;
  assert.equal(client.getQueryData(key)[0].fresh, true);
  assert.equal(calls, 1);
});

test('abrir un chat no vuelve a solicitar la lista', async () => {
  const client = createSessionQueryClient();
  let listCalls = 0;
  await client.prefetchQuery({
    queryKey: listKey(),
    queryFn: async () => {
      listCalls += 1;
      return [{ id: 'c1' }];
    },
  });
  await client.prefetchQuery({
    queryKey: messageKey('c1'),
    queryFn: async () => [{ id: 'm1' }],
  });
  assert.equal(listCalls, 1);
  assert.deepEqual(client.getQueryData(messageKey('c1')), [{ id: 'm1' }]);
});

test('dashboard y bandeja conservan claves distintas al navegar', async () => {
  const client = createSessionQueryClient();
  await client.prefetchQuery({
    queryKey: dashboardKey(),
    queryFn: async () => ({ ventasGeneradas: 10 }),
  });
  await client.prefetchQuery({
    queryKey: listKey(),
    queryFn: async () => [{ id: 'c1' }],
  });
  assert.equal(client.getQueryData(dashboardKey()).ventasGeneradas, 10);
  assert.equal(client.getQueryData(listKey())[0].id, 'c1');
});

test('un mensaje de socket no se duplica e invalida lista y métricas', async () => {
  const client = createSessionQueryClient();
  client.setQueryData(messageKey('c1'), [{ id: 'm1' }]);
  client.setQueryData(listKey(), [{ id: 'c1' }]);
  client.setQueryData(dashboardKey(), { ventasGeneradas: 1 });
  const message = { id: 'm2', conversationId: 'c1', direction: 'inbound' };
  const first = applyIncomingMessage(client, scope, message);
  const second = applyIncomingMessage(client, scope, message);
  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.deepEqual(client.getQueryData(messageKey('c1')).map((item) => item.id), ['m1', 'm2']);
  assert.equal(client.getQueryState(listKey()).isInvalidated, true);
  assert.equal(client.getQueryState(dashboardKey()).isInvalidated, true);
});

test('un cambio de estado invalida la bandeja y el dashboard', () => {
  const client = createSessionQueryClient();
  client.setQueryData(listKey(), [{ id: 'c1', status: 'nuevo' }]);
  client.setQueryData(dashboardKey(), { citas: 0 });
  applyConversationPatch(client, scope, 'c1', { status: 'agendado' });
  assert.equal(client.getQueryData(listKey())[0].status, 'agendado');
  assert.equal(client.getQueryState(listKey()).isInvalidated, true);
  assert.equal(client.getQueryState(dashboardKey()).isInvalidated, true);
});

test('enviar un mensaje invalida el hilo y, si cambia el lead, el dashboard', () => {
  const client = createSessionQueryClient();
  client.setQueryData(messageKey('c1'), []);
  client.setQueryData(listKey(), []);
  client.setQueryData(dashboardKey(), { cotizaciones: 0 });
  syncAfterOutboundMessage(client, scope, 'c1', { affectsDashboard: false });
  assert.equal(client.getQueryState(messageKey('c1')).isInvalidated, true);
  assert.equal(client.getQueryState(dashboardKey()).isInvalidated, false);
  syncAfterOutboundMessage(client, scope, 'c1', { affectsDashboard: true });
  assert.equal(client.getQueryState(dashboardKey()).isInvalidated, true);
});

test('la reconexión del socket sincroniza y la primera conexión no', () => {
  const client = createSessionQueryClient();
  client.setQueryData(listKey(), [{ id: 'c1' }]);
  const first = nextSocketConnect({ connectedBefore: false });
  assert.equal(first.shouldSync, false);
  const again = nextSocketConnect(first);
  assert.equal(again.shouldSync, true);
  syncAfterSocketReconnect(client, scope);
  assert.equal(client.getQueryState(listKey()).isInvalidated, true);
});

test('otro taller y otro usuario no reutilizan la caché', async () => {
  const firstClient = createSessionQueryClient();
  await firstClient.prefetchQuery({
    queryKey: listKey(scope),
    queryFn: async () => [{ id: 'del-taller-a' }],
  });
  const secondClient = createSessionQueryClient();
  assert.equal(sessionScopeKey(scope) === sessionScopeKey(otherScope), false);
  assert.equal(secondClient.getQueryData(listKey(otherScope)), undefined);
  assert.notDeepEqual(listKey(scope), listKey(otherScope));
  assert.equal(hasSessionScope(sessionScope(null, null)), false);
});

test('cerrar sesión borra la caché', () => {
  const client = createSessionQueryClient();
  client.setQueryData(listKey(), [{ id: 'c1' }]);
  client.clear();
  assert.equal(client.getQueryData(listKey()), undefined);
});

test('401 y 403 rechazan los datos guardados', async () => {
  const client = createSessionQueryClient();
  client.setQueryData(dashboardKey(), { ventasGeneradas: 99 });
  await assert.rejects(
    () => client.fetchQuery({
      queryKey: dashboardKey(),
      queryFn: async () => {
        const error = new Error('No autorizado');
        error.status = 403;
        throw error;
      },
    }),
    (error) => isAuthRejection(error),
  );
  assert.equal(client.getQueryData(dashboardKey()), undefined);

  const again = createSessionQueryClient();
  again.setQueryData(listKey(), [{ id: 'c1' }]);
  rejectCachedSession(again);
  assert.equal(again.getQueryData(listKey()), undefined);
  await assert.rejects(
    () => readWorkshopResponse({ status: 401, ok: false, json: async () => ({}) }),
    (error) => error.status === 401,
  );
});

test('un fallo de actualización conserva las cifras y las marca sin confirmar', async () => {
  const client = createSessionQueryClient();
  await client.prefetchQuery({
    queryKey: dashboardKey(),
    queryFn: async () => ({ ventasGeneradas: 20 }),
  });
  await assert.rejects(
    () => client.fetchQuery({
      queryKey: dashboardKey(),
      queryFn: async () => {
        const error = new Error('HTTP 500');
        error.status = 500;
        throw error;
      },
    }),
  );
  assert.equal(client.getQueryData(dashboardKey()).ventasGeneradas, 20);
  const state = client.getQueryState(dashboardKey());
  assert.equal(dashboardVisitState({
    hasData: true,
    isFetching: false,
    isError: state.status === 'error',
    authRejected: false,
  }), 'stale-failed');
  assert.equal(dashboardVisitState({
    hasData: true,
    isFetching: true,
    isError: false,
    authRejected: false,
  }), 'unconfirmed');
});
