import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrationDetailPath,
  calibrationEvidencePath,
  calibrationListPath,
} from './calibrationPaths.js';
import {
  declaredAmount,
  galleryMove,
  groupRepairLines,
  listAmount,
  sumDeclared,
} from './calibrationView.js';
import {
  CALIBRATION_SLOW_DELAY_MS,
  CALIBRATION_SYNC_DELAY_MS,
  calibrationRefreshIndicator,
  createSessionQueryClient,
  dashboardVisitState,
  isSessionObjectUrl,
  rejectCachedSession,
  retainPhotoUrl,
  revokeTrackedObjectUrls,
  sessionScope,
  workshopKey,
} from './sessionQuery.js';

const scope = sessionScope({ id: 'user-owner', tallerId: 'taller-a' }, { id: 'taller-a' });
const otherScope = sessionScope({ id: 'user-other', tallerId: 'taller-b' }, { id: 'taller-b' });

function summaryKey(current = scope) {
  return workshopKey(current, 'calibration', 'summary');
}

function casesKey(current = scope) {
  return workshopKey(current, 'calibration', 'cases', '', '');
}

function quotesKey(current = scope) {
  return workshopKey(current, 'calibration', 'opportunities', '', '');
}

function detailKey(id, current = scope) {
  return workshopKey(current, 'calibration', 'detail', 'visual', id);
}

function photoKey(caseId, photoId, current = scope) {
  return workshopKey(current, 'calibration', 'photo', caseId, photoId);
}

test('RQ separa partidas, oculta importes ausentes y la galería no sale del rango', () => {
  const lines = [
    { role: 'part', quotedMxn: 2900, quotedValidation: 'human_confirmed', contractedMxn: null, contractedValidation: 'not_provided', collectedMxn: null, collectedValidation: 'not_provided' },
    { role: 'labor', quotedMxn: 3400, quotedValidation: 'human_confirmed', contractedMxn: null, contractedValidation: 'not_provided', collectedMxn: null, collectedValidation: 'not_provided' },
  ];
  const groups = groupRepairLines(lines);
  assert.equal(groups.parts.length, 1);
  assert.equal(groups.labor.length, 1);
  assert.equal(sumDeclared(lines, 'quotedMxn', 'quotedValidation'), 6300);
  assert.equal(sumDeclared(lines, 'contractedMxn', 'contractedValidation'), null);
  assert.equal(declaredAmount(null, 'not_provided'), null);
  assert.equal(listAmount({ quotedTotalMxn: 1900 }, 'visual'), 1900);
  assert.equal(listAmount({ quotedMxn: 6300 }, 'repair'), 6300);
  assert.equal(listAmount({}, 'repair'), null);
  const photos = ['IMG-000001', 'IMG-000002', 'IMG-000003'];
  assert.equal(galleryMove(photos, 'IMG-000001', -1), 'IMG-000001');
  assert.equal(galleryMove(photos, 'IMG-000001', 1), 'IMG-000002');
  assert.equal(galleryMove(photos, 'IMG-000003', 1), 'IMG-000003');
  assert.equal(galleryMove([], 'IMG-000001', 1), null);
});

test('las rutas de calibración no apuntan a un almacenamiento externo', () => {
  assert.equal(calibrationListPath('cases', { q: ' AF-000002 ', archive: 'archived_private' }), '/api/calibration/cases?q=AF-000002&archive=archived_private');
  assert.equal(calibrationListPath('opportunities', { q: '', service: 'bath_with_bodywork' }), '/api/calibration/opportunities?service=bath_with_bodywork');
  assert.equal(calibrationListPath('repairs', { q: ' fascia ' }), '/api/calibration/repairs?q=fascia');
  assert.equal(
    calibrationListPath('repair-work', { q: ' Aveo ', evidence: 'text', cursor: 'RQ-000001' }),
    '/api/calibration/repair-work?q=Aveo&cursor=RQ-000001&evidence=text',
  );
  assert.equal(
    calibrationEvidencePath('repair', 'RQ-000001', 'EV-000001'),
    '/api/calibration/repairs/RQ-000001/evidence/EV-000001',
  );
  assert.equal(
    calibrationEvidencePath('commercial', 'CQ-000006'),
    '/api/calibration/quotes/CQ-000006/evidence',
  );
  const repairWorkKey = workshopKey(scope, 'calibration', 'repair-work', 'aveo', 'text');
  const evidencePhotoKey = workshopKey(scope, 'calibration', 'evidence-photo', 'RQ-000001', 'EV-000001');
  assert.notDeepEqual(evidencePhotoKey, workshopKey(scope, 'calibration', 'photo', 'RQ-000001', 'EV-000001'));
  assert.notDeepEqual(repairWorkKey, photoKey('AF-000002', 'IMG-000001'));
  assert.notDeepEqual(repairWorkKey, quotesKey());
  assert.equal(calibrationDetailPath('visual', 'AF-000002'), '/api/calibration/cases/AF-000002');
  assert.equal(calibrationDetailPath('commercial', 'CQ-000001'), '/api/calibration/quotes/CQ-000001');
  assert.equal(calibrationDetailPath('repair', 'RQ-000001'), '/api/calibration/repairs/RQ-000001');
  assert.equal(isSessionObjectUrl('https://res.cloudinary.com/demo/image/upload/a.jpg'), false);
  assert.equal(isSessionObjectUrl('blob:http://local/photo'), true);
});

test('la primera visita consulta resumen y listado sin esperarse entre sí', async () => {
  const client = createSessionQueryClient();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = [];
  const summary = client.fetchQuery({
    queryKey: summaryKey(),
    queryFn: async () => {
      started.push('summary');
      await gate;
      return { status: 'ok', data: { visual: { caseCount: 3 } } };
    },
  });
  const cases = client.fetchQuery({
    queryKey: casesKey(),
    queryFn: async () => {
      started.push('cases');
      await gate;
      return { status: 'ok', data: { items: [{ id: 'AF-000001' }] } };
    },
  });
  assert.deepEqual(started, ['summary', 'cases']);
  release();
  await Promise.all([summary, cases]);
  assert.equal(client.getQueryData(summaryKey()).data.visual.caseCount, 3);
  assert.equal(client.getQueryData(casesKey()).data.items[0].id, 'AF-000001');
});

test('la segunda visita conserva el centro mientras llega la actualización', async () => {
  const client = createSessionQueryClient();
  await client.prefetchQuery({
    queryKey: summaryKey(),
    queryFn: async () => ({ status: 'ok', data: { visual: { caseCount: 3 } } }),
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const refreshing = client.fetchQuery({
    queryKey: summaryKey(),
    queryFn: () => gate,
  });
  assert.equal(client.getQueryData(summaryKey()).data.visual.caseCount, 3);
  assert.equal(dashboardVisitState({
    hasData: true,
    isFetching: true,
    isError: false,
    authRejected: false,
  }), 'unconfirmed');
  assert.equal(calibrationRefreshIndicator({
    hasData: true,
    isFetching: true,
    isError: false,
    authRejected: false,
    elapsedMs: 0,
  }), 'quiet');
  assert.equal(calibrationRefreshIndicator({
    hasData: true,
    isFetching: true,
    isError: false,
    authRejected: false,
    elapsedMs: CALIBRATION_SYNC_DELAY_MS,
  }), 'syncing');
  release({ status: 'ok', data: { visual: { caseCount: 4 } } });
  await refreshing;
  assert.equal(client.getQueryData(summaryKey()).data.visual.caseCount, 4);
});

test('AF y CQ conservan claves distintas al cambiar de expediente', async () => {
  const client = createSessionQueryClient();
  await client.prefetchQuery({
    queryKey: casesKey(),
    queryFn: async () => ({ status: 'ok', data: { items: [{ id: 'AF-000002' }] } }),
  });
  await client.prefetchQuery({
    queryKey: quotesKey(),
    queryFn: async () => ({ status: 'ok', data: { items: [{ headQuoteId: 'CQ-000001' }] } }),
  });
  await client.prefetchQuery({
    queryKey: detailKey('AF-000002'),
    queryFn: async () => ({ status: 'ok', data: { id: 'AF-000002', photos: [] } }),
  });
  await client.prefetchQuery({
    queryKey: detailKey('AF-000003'),
    queryFn: async () => ({ status: 'ok', data: { id: 'AF-000003', photos: [] } }),
  });
  assert.equal(client.getQueryData(casesKey()).data.items[0].id, 'AF-000002');
  assert.equal(client.getQueryData(quotesKey()).data.items[0].headQuoteId, 'CQ-000001');
  assert.equal(client.getQueryData(detailKey('AF-000002')).data.id, 'AF-000002');
  assert.equal(client.getQueryData(detailKey('AF-000003')).data.id, 'AF-000003');
  const repairKey = workshopKey(scope, 'calibration', 'repairs', 'fascia', '');
  await client.prefetchQuery({
    queryKey: repairKey,
    queryFn: async () => ({ status: 'ok', data: { items: [{ headQuoteId: 'RQ-000001' }] } }),
  });
  assert.equal(client.getQueryData(repairKey).data.items[0].headQuoteId, 'RQ-000001');
  assert.notDeepEqual(repairKey, quotesKey());
});

test('varias fotografías se reutilizan en la sesión y no repiten la descarga', async () => {
  const client = createSessionQueryClient();
  const calls = [];
  const load = (caseId, photoId) => client.fetchQuery({
    queryKey: photoKey(caseId, photoId),
    staleTime: Infinity,
    queryFn: async () => {
      calls.push(photoId);
      return retainPhotoUrl(client, client.getQueryData(photoKey(caseId, photoId)), `blob:http://local/${photoId}`);
    },
  });
  await Promise.all([
    load('AF-000002', 'IMG-000001'),
    load('AF-000002', 'IMG-000002'),
    load('AF-000002', 'IMG-000003'),
  ]);
  await load('AF-000002', 'IMG-000001');
  assert.deepEqual(calls, ['IMG-000001', 'IMG-000002', 'IMG-000003']);
  assert.equal(client.getQueryData(photoKey('AF-000002', 'IMG-000002')), 'blob:http://local/IMG-000002');
});

test('reemplazar una fotografía revoca la URL anterior', () => {
  const revoked = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    const client = createSessionQueryClient();
    retainPhotoUrl(client, null, 'blob:http://local/first');
    const next = retainPhotoUrl(client, 'blob:http://local/first', 'blob:http://local/second');
    assert.equal(next, 'blob:http://local/second');
    assert.deepEqual(revoked, ['blob:http://local/first']);
    assert.equal(retainPhotoUrl(client, next, 'https://res.cloudinary.com/demo/a.jpg'), null);
  } finally {
    URL.revokeObjectURL = original;
  }
});

test('401, 403, cierre de sesión y otro usuario sueltan datos y URLs', async () => {
  const revoked = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    const client = createSessionQueryClient();
    client.setQueryData(summaryKey(), { status: 'ok', data: { visual: { caseCount: 3 } } });
    client.setQueryData(casesKey(), { status: 'ok', data: { items: [{ id: 'AF-000001' }] } });
    client.setQueryData(workshopKey(scope, 'calibration', 'repair-work', '', ''), { status: 'ok', data: { items: [{ id: 'RQ-000001' }] } });
    client.setQueryData(workshopKey(scope, 'calibration', 'evidence', 'repair', 'RQ-000001'), { status: 'ok', data: { items: [] } });
    retainPhotoUrl(client, null, 'blob:http://local/IMG-000001');
    await assert.rejects(
      () => client.fetchQuery({
        queryKey: summaryKey(),
        queryFn: async () => {
          const error = new Error('No autorizado');
          error.status = 403;
          throw error;
        },
      }),
      (error) => error.status === 403,
    );
    assert.equal(client.getQueryData(summaryKey()), undefined);
    assert.equal(client.getQueryData(casesKey()), undefined);
    assert.equal(client.getQueryData(workshopKey(scope, 'calibration', 'repair-work', '', '')), undefined);
    assert.equal(client.getQueryData(workshopKey(scope, 'calibration', 'evidence', 'repair', 'RQ-000001')), undefined);
    assert.deepEqual(revoked, ['blob:http://local/IMG-000001']);

    const again = createSessionQueryClient();
    again.setQueryData(detailKey('AF-000002'), { status: 'ok', data: { id: 'AF-000002' } });
    retainPhotoUrl(again, null, 'blob:http://local/IMG-000002');
    const released = revokeTrackedObjectUrls(again);
    again.clear();
    assert.deepEqual(released, ['blob:http://local/IMG-000002']);
    assert.equal(again.getQueryData(detailKey('AF-000002')), undefined);

    const other = createSessionQueryClient();
    assert.equal(other.getQueryData(summaryKey(otherScope)), undefined);
    assert.notDeepEqual(summaryKey(scope), summaryKey(otherScope));
  } finally {
    URL.revokeObjectURL = original;
  }
});

test('un fallo de la API conserva la última consulta y la marca sin confirmar', async () => {
  const client = createSessionQueryClient();
  await client.prefetchQuery({
    queryKey: summaryKey(),
    queryFn: async () => ({ status: 'ok', data: { visual: { caseCount: 3 } } }),
  });
  await assert.rejects(
    () => client.fetchQuery({
      queryKey: summaryKey(),
      queryFn: async () => {
        const error = new Error('HTTP 500');
        error.status = 500;
        throw error;
      },
    }),
  );
  assert.equal(client.getQueryData(summaryKey()).data.visual.caseCount, 3);
  assert.equal(dashboardVisitState({
    hasData: true,
    isFetching: false,
    isError: true,
    authRejected: false,
  }), 'stale-failed');
  assert.equal(calibrationRefreshIndicator({
    hasData: true,
    isFetching: false,
    isError: true,
    authRejected: false,
  }), 'stale');
  assert.equal(calibrationRefreshIndicator({
    hasData: true,
    isFetching: true,
    isError: false,
    authRejected: false,
    elapsedMs: CALIBRATION_SLOW_DELAY_MS,
  }), 'slow');
  assert.equal(calibrationRefreshIndicator({
    hasData: false,
    isFetching: true,
    isError: false,
    authRejected: false,
    elapsedMs: CALIBRATION_SLOW_DELAY_MS,
  }), 'quiet');
  assert.equal(calibrationRefreshIndicator({
    hasData: true,
    isFetching: false,
    isError: true,
    authRejected: true,
  }), 'quiet');
  rejectCachedSession(client);
  assert.equal(client.getQueryData(summaryKey()), undefined);
});
