import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryObserver } from '@tanstack/query-core';
import { catalogEditorFromView } from './catalogView.js';
import {
  beginQueryEpoch,
  createSessionQueryClient,
  finishQueryEpoch,
  normalizeCatalogView,
  publishCatalogRules,
  publishCatalogView,
  rejectCachedSession,
  scheduleSchedulingRefresh,
  schedulingEventMatches,
  sessionScope,
  upsertCachedAppointment,
  patchCachedAppointment,
  workshopKey,
} from './sessionQuery.js';

const scope = sessionScope({ id: 'user-owner', tallerId: 'taller-a' }, { id: 'taller-a' });
const otherScope = sessionScope({ id: 'user-other', tallerId: 'taller-b' }, { id: 'taller-b' });

const view = {
  rules: { premiumFactor: 1.1 },
  pieceBases: [{ servicio: 'Facia', basePrice: 100, diasEntrega: 2 }],
  integralBases: [],
  montajePinturaBases: [{ servicio: 'Puerta', precio: 80, diasEntrega: 1 }],
  montajeBases: [{ servicio: 'Faro', precio: 40, diasEntrega: 1 }],
};

function catalogKey(current = scope) {
  return workshopKey(current, 'catalog-view');
}

test('la primera lectura del catálogo conserva el contrato completo', async () => {
  const client = createSessionQueryClient();
  let calls = 0;
  const queryFn = async () => {
    calls += 1;
    const epoch = beginQueryEpoch(client, 'catalog-view');
    return finishQueryEpoch(
      client,
      'catalog-view',
      epoch,
      normalizeCatalogView(view),
      client.getQueryData(catalogKey()),
    );
  };
  await client.prefetchQuery({ queryKey: catalogKey(), queryFn });
  await client.prefetchQuery({ queryKey: catalogKey(), queryFn, staleTime: Infinity });
  assert.equal(calls, 1);
  assert.equal(client.getQueryData(catalogKey()).pieceBases[0].basePrice, 100);
  assert.equal(client.getQueryData(catalogKey()).montajePinturaBases[0].servicio, 'Puerta');
  assert.equal(client.getQueryData(catalogKey()).montajeBases[0].servicio, 'Faro');
});

test('la pieza del simulador no vuelve a descargar el catálogo', () => {
  const page = readFileSync(new URL('./CatalogAdminPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /workshopKey\(scope, 'catalog-view'\)/);
  assert.doesNotMatch(page, /\[simPiece\]/);
  assert.match(page, /setSimPiece\(svc\)/);
  const editor = catalogEditorFromView(view);
  editor.pieceBases[0].basePrice = 180;
  const again = catalogEditorFromView(view);
  assert.equal(again.pieceBases[0].basePrice, 100);
  assert.equal(editor.pieceBases[0].basePrice, 180);
});

test('editar un precio actualiza la misma vista que usa la bandeja', () => {
  const client = createSessionQueryClient();
  publishCatalogView(client, scope, view);
  publishCatalogView(client, scope, {
    ...view,
    pieceBases: [{ servicio: 'Facia', basePrice: 180, diasEntrega: 2 }],
  });
  assert.equal(client.getQueryData(catalogKey()).pieceBases[0].basePrice, 180);
  assert.equal(client.getQueryData(catalogKey(otherScope)), undefined);
  assert.notDeepEqual(catalogKey(), catalogKey(otherScope));
});

test('cambiar reglas no borra las piezas ni deja el precio anterior', () => {
  const client = createSessionQueryClient();
  publishCatalogView(client, scope, view);
  publishCatalogRules(client, scope, { premiumFactor: 1.4 });
  const stored = client.getQueryData(catalogKey());
  assert.equal(stored.rules.premiumFactor, 1.4);
  assert.equal(stored.pieceBases[0].basePrice, 100);
  assert.equal(stored.montajeBases[0].precio, 40);
});

test('una respuesta tardía no pisa el catálogo nuevo', () => {
  const client = createSessionQueryClient();
  const epoch = beginQueryEpoch(client, 'catalog-view');
  publishCatalogView(client, scope, {
    ...view,
    pieceBases: [{ servicio: 'Facia', basePrice: 180, diasEntrega: 2 }],
  });
  const settled = finishQueryEpoch(
    client,
    'catalog-view',
    epoch,
    normalizeCatalogView(view),
    client.getQueryData(catalogKey()),
  );
  assert.equal(settled.pieceBases[0].basePrice, 180);
});

test('regresar al calendario y al CRM conserva la lista', async () => {
  const client = createSessionQueryClient();
  const calendarKey = workshopKey(scope, 'appointments');
  const crmKey = workshopKey(scope, 'crm-appointments');
  await client.prefetchQuery({
    queryKey: calendarKey,
    queryFn: async () => [{ id: 'a1', source: 'autopilot', clientName: 'Ana' }],
  });
  await client.prefetchQuery({
    queryKey: crmKey,
    queryFn: async () => [{ id: 'm1', source: 'manual', clientName: 'Luis' }],
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const refreshing = client.fetchQuery({ queryKey: calendarKey, queryFn: () => gate });
  assert.equal(client.getQueryData(calendarKey)[0].clientName, 'Ana');
  assert.equal(client.getQueryData(crmKey)[0].clientName, 'Luis');
  assert.notDeepEqual(calendarKey, crmKey);
  release([{ id: 'a1', source: 'autopilot', clientName: 'Ana', fresh: true }]);
  await refreshing;
  assert.equal(client.getQueryData(calendarKey)[0].fresh, true);
});

test('crear y reprogramar una cita manual se ve en CRM y calendario', () => {
  const client = createSessionQueryClient();
  client.setQueryData(workshopKey(scope, 'appointments'), []);
  client.setQueryData(workshopKey(scope, 'crm-appointments'), []);
  upsertCachedAppointment(client, scope, {
    id: 'm1',
    source: 'manual',
    clientName: 'Luis',
    scheduledAt: '2026-11-14T16:00:00.000Z',
  });
  upsertCachedAppointment(client, scope, {
    id: 'a1',
    source: 'autopilot',
    clientName: 'Ana',
  });
  assert.equal(client.getQueryData(workshopKey(scope, 'crm-appointments')).length, 1);
  assert.equal(client.getQueryData(workshopKey(scope, 'appointments')).length, 2);
  patchCachedAppointment(client, scope, 'm1', { scheduledAt: '2026-11-15T16:00:00.000Z', visitStatus: 'agendada' });
  const manual = client.getQueryData(workshopKey(scope, 'crm-appointments'))[0];
  assert.equal(manual.scheduledAt, '2026-11-15T16:00:00.000Z');
  assert.equal(manual.clientName, 'Luis');
  upsertCachedAppointment(client, scope, {
    id: 'lab1',
    source: 'autopilot',
    conversationPlatform: 'lab',
    phone: '5512345678',
  });
  patchCachedAppointment(client, scope, 'lab1', { visitStatus: 'realizada' });
  const lab = client.getQueryData(workshopKey(scope, 'appointments')).find((row) => row.id === 'lab1');
  assert.equal(lab.conversationPlatform, 'lab');
  assert.equal(lab.visitStatus, 'realizada');
});

test('el socket y la mutación comparten una sola actualización', async () => {
  const client = createSessionQueryClient();
  const key = workshopKey(scope, 'appointments');
  let calls = 0;
  await client.prefetchQuery({
    queryKey: key,
    queryFn: async () => {
      calls += 1;
      return [{ id: 'a1' }];
    },
  });
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      calls += 1;
      return [{ id: 'a1', fresh: true }];
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  calls = 0;
  assert.equal(schedulingEventMatches({ tallerId: 'taller-a', source: 'manual' }, 'taller-a'), true);
  assert.equal(schedulingEventMatches({ tallerId: 'taller-b' }, 'taller-a'), false);
  scheduleSchedulingRefresh(client, scope);
  scheduleSchedulingRefresh(client, scope);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(calls, 1);
  assert.equal(client.getQueryData(key)[0].fresh, true);
  unsubscribe();
});

test('otra sesión y un 403 sueltan calendario, CRM y catálogo', async () => {
  const client = createSessionQueryClient();
  publishCatalogView(client, scope, view);
  client.setQueryData(workshopKey(scope, 'appointments'), [{ id: 'a1' }]);
  client.setQueryData(workshopKey(scope, 'crm-appointments'), [{ id: 'm1', source: 'manual' }]);
  const other = createSessionQueryClient();
  assert.equal(other.getQueryData(catalogKey(otherScope)), undefined);
  await assert.rejects(
    () => client.fetchQuery({
      queryKey: workshopKey(scope, 'appointments'),
      queryFn: async () => {
        const error = new Error('No autorizado');
        error.status = 403;
        throw error;
      },
    }),
    (error) => error.status === 403,
  );
  assert.equal(client.getQueryData(catalogKey()), undefined);
  assert.equal(client.getQueryData(workshopKey(scope, 'crm-appointments')), undefined);
  rejectCachedSession(other);
  assert.equal(other.getQueryData(workshopKey(otherScope, 'appointments')), undefined);
});
