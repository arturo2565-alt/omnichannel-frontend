import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrationDetailPath,
  calibrationEvidencePath,
  calibrationListPath,
} from './calibrationPaths.js';
import {
  amountLabel,
  confirmTargets,
  confirmZoneLines,
  correspondencePending,
  declaredAmount,
  declaredSeverityReview,
  economicSummary,
  financialPresentation,
  galleryMove,
  groupObservations,
  groupRepairLines,
  groupWorkZones,
  listAmount,
  presentedAmountLabel,
  retryDeclarations,
  severityChangeRequested,
  severityHistoryRows,
  severityPresentation,
  colorPresentation,
  vehicleColorSuffix,
  sumDeclared,
  workLabel,
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
  assert.deepEqual(zones[0].lines.map(workLabel), ['Sustituir', 'Pintar']);
  assert.deepEqual(zones[0].lines.map(amountLabel), ['Costo de refacción estimado', 'Pintar']);
  assert.equal(zones[0].lines.map(amountLabel).join(' ').includes('ontaje'), false);
  assert.equal(severityPresentation(zones[0].lines[0].severityAnnotation).level, 'Desconocido');
  assert.equal(severityPresentation(zones[0].lines[0].severityAnnotation).state, null);
  assert.deepEqual(severityPresentation(zones[1].lines[0].severityAnnotation), { level: 'Fuerte', state: 'Propuesta IA' });
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
  assert.deepEqual(zones[0].lines.map(workLabel), ['Refacción', 'Montaje y pintura']);
  assert.deepEqual(zones[0].lines.map(amountLabel), ['Refacción · procedencia no registrada', 'Montaje y pintura']);
  assert.equal(workLabel({ role: 'labor', labor: 'paint', part: 'fascia delantera' }), 'Pintura');
  assert.equal(amountLabel({ treatment: 'replace', partProvenance: 'supplier_confirmed' }), 'Costo de refacción');
  assert.equal(amountLabel({ treatment: 'replace_paint' }), 'Sustituir y pintar');
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

test('la severidad validada se distingue de la propuesta y el historial no inventa fechas', () => {
  const proposal = severityPresentation({ status: 'proposed', provenance: 'visual_inference', inferenceMethod: 'visual_assessment', level: 'fuerte' });
  const validated = severityPresentation({ status: 'validated', provenance: 'authenticated_owner', level: 'medio' });
  assert.deepEqual(proposal, { level: 'Fuerte', state: 'Propuesta IA' });
  assert.deepEqual(validated, { level: 'Medio', state: 'Validado' });
  assert.equal(severityChangeRequested({ status: 'validated', provenance: 'authenticated_owner', level: 'medio' }, 'medio'), false);
  assert.equal(severityChangeRequested({ status: 'validated', provenance: 'authenticated_owner', level: 'medio' }, 'fuerte'), true);
  assert.equal(severityChangeRequested({ status: 'proposed', provenance: 'visual_inference', inferenceMethod: 'visual_assessment', level: 'fuerte' }, ''), false);
  assert.deepEqual(confirmTargets(['L03', 'L04'], ['L04']), ['L04']);
  assert.deepEqual(confirmTargets(['L01', 'L02'], ['L04']), ['L01', 'L02']);
  const rows = severityHistoryRows([
    { annotationId: 'SV-000001', lineId: 'L03', level: null, status: 'unknown', provenance: 'insufficient_evidence' },
    { annotationId: 'SV-000001', lineId: 'L03', level: null, status: 'unknown', provenance: 'insufficient_evidence' },
    { annotationId: 'SV-000002', lineId: 'L04', level: 'fuerte', status: 'proposed', provenance: 'visual_inference', inferenceMethod: 'visual_assessment' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].when, null);
  assert.equal(rows[0].lineId, 'L03');
  assert.equal(rows[0].level, 'Desconocido');
  assert.equal(rows[0].state, null);
  assert.equal(rows[1].lineId, 'L04');
  assert.equal(rows[1].state, 'Propuesta IA');
});

test('el color declarado no se presenta como validado y el cambio conserva los dos extremos', () => {
  const declared = colorPresentation({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'rojo',
    exteriorProvenance: 'human_declaration',
    requestedColor: null,
    requestedProvenance: null,
  });
  assert.equal(declared.mode, 'single');
  assert.equal(declared.label, 'Rojo');
  assert.equal(declared.provenance, 'human_declaration');
  assert.equal(vehicleColorSuffix({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'rojo',
    exteriorProvenance: 'human_declaration',
  }), ' · Rojo');
  const inferred = colorPresentation({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'blanco',
    exteriorProvenance: 'visual_inference',
    requestedColor: null,
  });
  assert.equal(inferred.provenance, 'visual_inference');
  assert.notEqual(inferred.provenance, 'authenticated_owner');
  const unknown = colorPresentation({
    contractVersion: 'color-v1',
    status: 'unknown',
    exteriorColor: null,
    exteriorProvenance: 'unknown',
    requestedColor: null,
  });
  assert.equal(unknown.mode, 'unknown');
  assert.equal(unknown.label, 'Color no determinado');
  const change = colorPresentation({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'blanco',
    exteriorProvenance: 'human_declaration',
    requestedColor: 'negro',
    requestedProvenance: 'human_declaration',
  });
  assert.equal(change.mode, 'change');
  assert.equal(change.current, 'Blanco');
  assert.equal(change.requested, 'Negro');
  const bath = colorPresentation({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: null,
    exteriorProvenance: 'unknown',
    requestedColor: 'plata',
    requestedProvenance: 'human_declaration',
    originalColor: null,
  });
  assert.equal(bath.mode, 'change');
  assert.equal(bath.current, null);
  assert.equal(bath.requested, 'Plata');
  assert.equal(bath.provenance, 'human_declaration');
  const original = colorPresentation({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'rojo',
    exteriorProvenance: 'human_declaration',
    requestedColor: null,
    originalColor: 'blanco',
    originalProvenance: 'human_declaration',
  });
  assert.equal(original.mode, 'single');
  assert.equal(original.label, 'Rojo');
  assert.equal(original.original, 'Blanco');
  assert.notEqual(original.original, original.label);
  assert.equal(vehicleColorSuffix({
    contractVersion: 'color-v1',
    status: 'proposed',
    exteriorColor: 'blanco',
    exteriorProvenance: 'human_declaration',
    requestedColor: 'negro',
    requestedProvenance: 'human_declaration',
  }), '');
});

test('una confirmación parcial deja la zona sin cerrar', async () => {
  const calls = [];
  const partial = await confirmZoneLines(['L03', 'L04'], async (lineId) => {
    calls.push(lineId);
    if (lineId === 'L04') throw new Error('failed');
  });
  assert.deepEqual(calls, ['L03', 'L04']);
  assert.deepEqual(partial.recorded, ['L03']);
  assert.deepEqual(partial.pending, ['L04']);
  assert.equal(partial.complete, false);

  const rejected = await confirmZoneLines(['L03', 'L04'], async () => {
    throw new Error('failed');
  });
  assert.deepEqual(rejected.recorded, []);
  assert.deepEqual(rejected.pending, ['L03', 'L04']);

  const lines = [
    afLine('L03', 'fascia delantera', 'replace', 2700, note('validated', 'authenticated_owner', 'medio')),
    afLine('L04', 'fascia delantera', 'paint', 3600, note('proposed', 'visual_inference', 'fuerte', 'visual_assessment')),
  ];
  const zones = groupWorkZones(lines);
  assert.equal(zones.length, 2);
  assert.equal(zones.every((zone) => zone.grouped === false), true);
  assert.equal(economicSummary(lines, 6300).zoneSum, 6300);
  assert.deepEqual(lines.map((line) => line.priceMxn), [2700, 3600]);
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

test('la procedencia de una observación sale de una atribución explícita', () => {
  const declared = 'salpicadera trasera izquierda';
  const lines = [afLine('L01', declared, 'repair_paint', 8500)];
  const human = 'La cotizacion describe el dano de la salpicadera trasera izquierda como fuerte.';
  const visual = 'El vehiculo se observa de color blanco.';
  const review = 'Las fotografias muestran la esquina trasera derecha. La salpicadera trasera izquierda no aparece en las imagenes.';
  const unknown = 'Tiempo estimado de entrega de 3 a 4 dias habiles.';
  const warranty = 'Garantia de un ano por escrito.';
  const groups = groupObservations([human, visual, review, unknown, warranty, human], lines);
  assert.deepEqual(groups.human.map((item) => item.text), [human]);
  assert.equal(groups.human[0].note, 'Atribuida a la cotización');
  assert.deepEqual(groups.visual.map((item) => item.text), [visual]);
  assert.equal(groups.visual[0].note, 'No es un hecho confirmado');
  assert.deepEqual(groups.review.map((item) => item.text), [review]);
  assert.equal(groups.review[0].correspondence, true);
  assert.match(groups.review[0].note, /No es un hecho confirmado/);
  assert.deepEqual(groups.unknown.map((item) => item.text), [unknown, warranty]);
  assert.equal(groups.unknown.every((item) => item.note === 'Procedencia no determinada'), true);
  assert.equal(groups.human.some((item) => item.text === visual), false);
  assert.equal(correspondencePending([review], lines), true);
  assert.equal(correspondencePending([visual], lines), false);
  assert.equal(lines[0].part, declared);
  assert.equal(lines[0].priceMxn, 8500);
  assert.deepEqual(groupObservations([], lines), { human: [], visual: [], review: [], unknown: [] });
  assert.equal(groupObservations(undefined, lines).human.length, 0);
});

test('una discrepancia sellada no se vuelve declaración y no se duplica', () => {
  const stamped = 'Posible discrepancia visual: la fotografía parece mostrar el lado contrario de la pieza declarada. Procedencia: visual_inference. No es un hecho confirmado.';
  const warning = 'Advertencia visual no aplicada: la inferencia no sustituye la severidad declarada. Procedencia: visual_inference.';
  const groups = groupObservations([stamped, warning, stamped], []);
  assert.equal(groups.human.length, 0);
  assert.equal(groups.review.length, 1);
  assert.equal(groups.review[0].correspondence, true);
  assert.equal(groups.visual.length, 1);
  assert.equal(groups.visual[0].text, warning);
  assert.equal(groups.unknown.length, 0);
  const mixed = groupObservations(['AutoFix indica la pieza. El vehiculo se observa golpeado.'], []);
  assert.equal(mixed.human.length, 0);
  assert.equal(mixed.visual.length, 0);
  assert.equal(mixed.review[0].note.includes('Procedencia no determinada'), true);
  const incomplete = groupObservations(['AutoFix indica que es la puerta trasera. El lado no fue declarado.'], []);
  assert.equal(incomplete.review.length, 1);
  assert.equal(incomplete.human.length, 0);
  assert.equal(incomplete.review[0].correspondence, false);
});

test('el precio conjunto oculta subtotales vacíos y conserva el desglose real', () => {
  const fender = [afLine('L01', 'salpicadera trasera izquierda', 'repair_paint', 8500)];
  const combined = financialPresentation(fender, 8500);
  assert.equal(combined.mode, 'combined');
  assert.equal(combined.documentTotal, 8500);
  assert.equal(combined.showParts, false);
  assert.equal(combined.showLabor, false);
  assert.equal(combined.showUnclassified, false);
  assert.equal(combined.reconciles, true);
  assert.equal(presentedAmountLabel(fender[0], combined.mode), 'Reparación y pintura');
  assert.equal(fender[0].priceMxn, 8500);
  assert.equal(fender[0].treatment, 'repair_paint');

  const door = [afLine('L01', 'puerta trasera', 'repair_paint', 3600)];
  const jolion = financialPresentation(door, 3600);
  assert.equal(jolion.mode, 'combined');
  assert.equal(jolion.documentTotal, 3600);
  assert.equal(presentedAmountLabel(door[0], jolion.mode), 'Reparación y pintura');

  const mazda = [
    afLine('L01', 'salpicadera izquierda', 'replace', 1900),
    afLine('L02', 'salpicadera izquierda', 'paint', 3600),
    afLine('L03', 'fascia delantera', 'replace', 2700),
    afLine('L04', 'fascia delantera', 'paint', 3600),
  ];
  const split = financialPresentation(mazda, 11800);
  assert.equal(split.mode, 'classified');
  assert.equal(split.parts, 4600);
  assert.equal(split.labor, 7200);
  assert.equal(split.documentTotal, 11800);
  assert.equal(split.showParts, true);
  assert.equal(split.showLabor, true);
  assert.equal(split.reconciles, true);
  assert.deepEqual(mazda.map((line) => line.priceMxn), [1900, 3600, 2700, 3600]);

  const partialLines = [
    afLine('L01', 'salpicadera izquierda', 'replace', 1900),
    afLine('L02', 'puerta trasera', 'repair_paint', 3600),
  ];
  const partial = financialPresentation(partialLines, 5500);
  assert.equal(partial.mode, 'partial');
  assert.equal(partial.parts, 1900);
  assert.equal(partial.labor, 0);
  assert.equal(partial.showParts, true);
  assert.equal(partial.showLabor, false);
  assert.equal(partial.showUnclassified, true);
  assert.equal(partial.unclassifiedAmount, 3600);
  assert.equal(partial.reconciles, true);
  assert.equal(presentedAmountLabel(partialLines[1], partial.mode), 'Reparar y pintar');

  const ambiguous = financialPresentation([afLine('L01', 'cofre', 'replace_paint', 1900)], 1900);
  assert.equal(ambiguous.mode, 'partial');
  assert.equal(ambiguous.showParts, false);
  assert.equal(ambiguous.showLabor, false);
  assert.equal(ambiguous.unclassifiedAmount, 1900);
  assert.equal(presentedAmountLabel({ treatment: 'replace_paint' }, ambiguous.mode), 'Sustituir y pintar');

  const mismatch = financialPresentation(fender, 9000);
  assert.equal(mismatch.mode, 'combined');
  assert.equal(mismatch.documentTotal, 9000);
  assert.equal(mismatch.reconciles, false);
  assert.equal(fender[0].priceMxn, 8500);

  const repair = [
    { lineId: 'L01', part: 'Fascia delantera', role: 'part', labor: null, quotedMxn: 2700, quotedValidation: 'human_confirmed' },
    { lineId: 'L02', part: 'fascia delantera', role: 'labor', labor: 'mount_and_paint', quotedMxn: 3600, quotedValidation: 'human_confirmed' },
  ];
  const rq = financialPresentation(repair, 6300);
  assert.equal(rq.mode, 'classified');
  assert.equal(rq.parts, 2700);
  assert.equal(rq.labor, 3600);
  assert.equal(rq.showParts, true);
  assert.equal(rq.showLabor, true);
});

test('la revisión agrupada toma solo declaraciones humanas pendientes', () => {
  const human = (lineId, part, level) => afLine(lineId, part, 'repair_paint', 1000, {
    annotationId: `SV-${lineId}`,
    lineId,
    level,
    status: 'proposed',
    provenance: 'human_declaration',
    inferenceMethod: null,
    history: [],
  });
  const lines = [
    human('L1', 'salpicadera trasera izquierda', 'medio_leve'),
    human('L2', 'fascia trasera', 'fuerte'),
    afLine('L3', 'puerta', 'repair_paint', 1000, { annotationId: 'SV-L3', lineId: 'L3', level: 'leve', status: 'proposed', provenance: 'visual_inference', inferenceMethod: 'visual_assessment', history: [] }),
    afLine('L4', 'cofre', 'repair_paint', 1000, { annotationId: 'SV-L4', lineId: 'L4', level: null, status: 'unknown', provenance: 'insufficient_evidence', history: [] }),
    afLine('L5', 'costado', 'repair_paint', 1000, { annotationId: 'SV-L5', lineId: 'L5', level: 'medio', status: 'validated', provenance: 'authenticated_owner', history: [] }),
  ];
  const review = declaredSeverityReview(lines);
  assert.deepEqual(review.map((item) => item.lineId), ['L1', 'L2']);
  assert.deepEqual(review.map((item) => item.level), ['medio_leve', 'fuerte']);
  assert.equal(review.every((item) => item.provenance === 'human_declaration'), true);
  assert.equal(review.some((item) => item.lineId === 'L3' || item.lineId === 'L4' || item.lineId === 'L5'), false);
  assert.equal(lines[0].priceMxn, 1000);
  const retry = retryDeclarations(review, [{ lineId: 'L2' }]);
  assert.deepEqual(retry.map((item) => item.lineId), ['L2']);
  assert.deepEqual(declaredSeverityReview([]), []);
});
