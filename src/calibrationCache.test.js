import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrationDetailPath,
  calibrationEvidencePath,
  calibrationListPath,
} from './calibrationPaths.js';
import {
  declaredAmount,
  economicSummary,
  galleryMove,
  groupRepairLines,
  groupWorkZones,
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

function afLine(lineId, part, treatment, priceMxn, annotation = null) {
  return {
    lineId,
    part,
    treatment,
    priceMxn,
    severityZone: `af:${lineId}`,
    severityAnnotation: annotation,
  };
}

function note(status, provenance, level, inferenceMethod = null) {
  return { level, status, provenance, inferenceMethod, history: [] };
}

test('AF-000007 agrupa dos zonas y conserva cuatro partidas', () => {
  const lines = [
    afLine('L01', 'salpicadera izquierda', 'replace', 1900, note('unknown', 'insufficient_evidence', null)),
    afLine('L02', 'salpicadera izquierda', 'paint', 3600, note('unknown', 'insufficient_evidence', null)),
    afLine('L03', 'fascia delantera', 'replace', 2700, note('proposed', 'visual_inference', 'fuerte', 'visual_assessment')),
    afLine('L04', 'fascia delantera', 'paint', 3600, note('proposed', 'visual_inference', 'fuerte', 'visual_assessment')),
  ];
  const zones = groupWorkZones(lines);
  assert.equal(zones.length, 2);
  assert.deepEqual(zones.map((zone) => zone.lines.map((line) => line.lineId)), [['L01', 'L02'], ['L03', 'L04']]);
  assert.equal(zones[0].subtotal, 5500);
  assert.equal(zones[1].subtotal, 6300);
  assert.equal(zones[0].name, 'salpicadera izquierda');
  assert.equal(zones[1].name, 'fascia delantera');
  const summary = economicSummary(lines, 11800);
  assert.equal(summary.parts, 4600);
  assert.equal(summary.labor, 7200);
  assert.equal(summary.documentTotal, 11800);
  assert.equal(summary.zoneSum, 11800);
  assert.equal(summary.unclassified, 0);
  assert.equal(summary.reconciles, true);
  assert.deepEqual(lines.map((line) => line.priceMxn), [1900, 3600, 2700, 3600]);
});

test('la agrupación exige la misma pieza y rechaza nombres parecidos o ambiguos', () => {
  const similar = groupWorkZones([
    afLine('L01', 'salpicadera izquierda', 'replace', 1900),
    afLine('L02', 'Montaje y pintura de salpicadera izquierda', 'paint', 3600),
    afLine('L03', 'salpicadera derecha', 'replace', 1800),
    afLine('L04', 'salpicadera', 'paint', 900),
  ]);
  assert.equal(similar.length, 4);
  assert.equal(similar.every((zone) => zone.grouped === false), true);

  const duplicate = groupWorkZones([
    afLine('L01', 'puerta delantera izquierda', 'replace', 1000),
    afLine('L02', 'puerta delantera izquierda', 'replace', 1100),
  ]);
  assert.equal(duplicate.length, 2);

  const generic = groupWorkZones([
    { lineId: 'L01', part: 'Pintura', role: 'labor', labor: 'paint', quotedMxn: 1000, quotedValidation: 'human_confirmed' },
    { lineId: 'L02', part: 'pintura', role: 'labor', labor: 'repair', quotedMxn: 800, quotedValidation: 'human_confirmed' },
  ]);
  assert.equal(generic.length, 2);
  assert.equal(generic.every((zone) => zone.identity == null), true);

  const conflict = groupWorkZones([
    afLine('L01', 'fascia delantera', 'replace', 2700, note('validated', 'authenticated_owner', 'fuerte')),
    afLine('L02', 'fascia delantera', 'paint', 3600, note('proposed', 'visual_inference', 'fuerte', 'visual_assessment')),
  ]);
  assert.equal(conflict.length, 2);

  const combined = groupWorkZones([
    afLine('L01', 'cofre', 'replace_paint', 1900),
  ]);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].grouped, false);
  const combinedSummary = economicSummary(combined[0].lines, 1900);
  assert.equal(combinedSummary.unclassified, 1);
  assert.equal(combinedSummary.reconciles, true);
  assert.equal(combinedSummary.documentTotal, 1900);
});

test('RQ agrupa refacción y montaje, y deja sola la mano de obra', () => {
  const paired = [
    { lineId: 'L01', part: 'Fascia delantera', role: 'part', labor: null, quotedMxn: 2700, quotedValidation: 'human_confirmed', severityZone: 'rq:fascia delantera' },
    { lineId: 'L02', part: 'fascia delantera', role: 'labor', labor: 'mount_and_paint', quotedMxn: 3600, quotedValidation: 'human_confirmed', severityZone: 'rq:fascia delantera' },
  ];
  const zones = groupWorkZones(paired);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].grouped, true);
  assert.equal(zones[0].subtotal, 6300);
  assert.equal(zones[0].lines.length, 2);
  const summary = economicSummary(paired, 6300);
  assert.equal(summary.parts, 2700);
  assert.equal(summary.labor, 3600);
  assert.equal(summary.reconciles, true);

  const laborOnly = [
    { lineId: 'L01', part: 'puerta trasera derecha', role: 'labor', labor: 'repair', quotedMxn: 2400, quotedValidation: 'human_confirmed', severityZone: 'rq:puerta trasera derecha' },
  ];
  const single = groupWorkZones(laborOnly);
  assert.equal(single.length, 1);
  assert.equal(single[0].lines.length, 1);
  const laborSummary = economicSummary(laborOnly, 2400);
  assert.equal(laborSummary.parts, 0);
  assert.equal(laborSummary.labor, 2400);
  assert.equal(laborSummary.reconciles, true);

  const missing = economicSummary(paired, null);
  assert.equal(missing.documentTotal, null);
  assert.equal(missing.reconciles, false);
  assert.equal(missing.zoneSum, 6300);
  assert.equal(economicSummary(paired, 10000).reconciles, false);

  const repairPaint = groupWorkZones([
    afLine('L01', 'puerta trasera', 'repair', 800),
    afLine('L02', 'puerta trasera', 'paint', 2200),
  ]);
  assert.equal(repairPaint.length, 1);
  assert.equal(repairPaint[0].subtotal, 3000);
  assert.equal(economicSummary(repairPaint[0].lines, 3000).labor, 3000);

  const onePiece = groupWorkZones([afLine('L01', 'cofre', 'replace', 1900)]);
  assert.equal(onePiece.length, 1);
  assert.equal(onePiece[0].lines.length, 1);
  assert.equal(onePiece[0].subtotal, 1900);
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
