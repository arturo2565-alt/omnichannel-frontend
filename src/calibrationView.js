export function declaredAmount(value, validation) {
  if (validation === 'not_provided' || value == null) return null;
  return value;
}

export function groupRepairLines(lines = []) {
  return {
    parts: lines.filter((line) => line.role === 'part'),
    labor: lines.filter((line) => line.role === 'labor'),
  };
}

export function galleryMove(ids, currentId, step) {
  const index = ids.indexOf(currentId);
  if (index < 0) return ids[0] ?? null;
  const next = index + step;
  if (next < 0 || next >= ids.length) return currentId;
  return ids[next];
}

export function sumDeclared(lines = [], amountKey, validationKey) {
  const amounts = lines
    .map((line) => declaredAmount(line?.[amountKey], line?.[validationKey]))
    .filter((amount) => amount != null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function listAmount(item, tab) {
  const value = tab === 'visual' ? item?.quotedTotalMxn : item?.quotedMxn;
  return Number.isInteger(value) ? value : null;
}

const GENERIC_ZONE = new Set([
  'pintura', 'mano de obra', 'hojalateria', 'reparacion', 'montaje', 'servicio',
  'general', 'varios', 'refaccion', 'labor', 'trabajo', 'global', 'piezas',
]);

export function normalizeZoneName(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function zoneIdentity(line) {
  const name = normalizeZoneName(line?.part);
  if (!name || name.length > 80 || GENERIC_ZONE.has(name)) return null;
  return name;
}

export function lineAmount(line) {
  if (Number.isInteger(line?.priceMxn)) return line.priceMxn;
  return declaredAmount(line?.quotedMxn, line?.quotedValidation);
}

const TREATMENT_LABELS = {
  repair_paint: 'Reparar y pintar',
  paint: 'Pintar',
  replace_paint: 'Sustituir y pintar',
  replace: 'Sustituir',
  other: 'Otro',
  uncertain: 'Incierto',
};

const LABOR_LABELS = {
  mount_and_paint: 'Montaje y pintura',
  paint: 'Pintura',
  repair: 'Reparación',
};

export function workLabel(line) {
  if (line?.role === 'labor') return LABOR_LABELS[line.labor] ?? line.labor ?? 'Mano de obra';
  if (line?.role === 'part') return 'Refacción';
  if (line?.treatment) return TREATMENT_LABELS[line.treatment] ?? line.treatment;
  return 'Partida';
}

const CONFIRMED_PART_COST = new Set(['supplier_confirmed', 'purchase_cost', 'confirmed']);

function partProvenance(line) {
  return typeof line?.partProvenance === 'string' ? line.partProvenance : null;
}

export function amountLabel(line) {
  if (line?.role === 'part') {
    return CONFIRMED_PART_COST.has(partProvenance(line))
      ? 'Costo de refacción'
      : 'Refacción · procedencia no registrada';
  }
  if (line?.role == null && line?.treatment === 'replace') {
    return CONFIRMED_PART_COST.has(partProvenance(line))
      ? 'Costo de refacción'
      : 'Costo de refacción estimado';
  }
  return workLabel(line);
}

const SEVERITY_LEVEL_NAMES = {
  leve: 'Leve',
  medio_leve: 'Medio-leve',
  medio: 'Medio',
  medio_fuerte: 'Medio-fuerte',
  fuerte: 'Fuerte',
};

export function severityPresentation(annotation) {
  if (!annotation) return { level: 'Sin clasificación', state: null };
  if (annotation.status === 'validated' && annotation.provenance === 'authenticated_owner') {
    return { level: SEVERITY_LEVEL_NAMES[annotation.level] ?? 'Desconocido', state: 'Validado' };
  }
  if (annotation.status === 'unknown' && annotation.provenance === 'insufficient_evidence') {
    return { level: 'Desconocido', state: null };
  }
  if (annotation.status === 'proposed' && annotation.provenance === 'human_declaration' && annotation.inferenceMethod == null) {
    return { level: SEVERITY_LEVEL_NAMES[annotation.level] ?? 'Desconocido', state: 'Pendiente de validación' };
  }
  if (annotation.status === 'proposed' && annotation.provenance === 'visual_inference' && annotation.inferenceMethod === 'visual_assessment') {
    return { level: SEVERITY_LEVEL_NAMES[annotation.level] ?? 'Desconocido', state: 'Propuesta IA' };
  }
  return { level: 'Sin clasificación', state: null };
}

export function severityChangeRequested(annotation, level) {
  if (!level) return false;
  if (annotation?.status === 'validated' && annotation.provenance === 'authenticated_owner' && annotation.level === level) {
    return false;
  }
  return true;
}

export function confirmTargets(lineIds, pendingIds) {
  const ids = [...new Set((lineIds ?? []).filter(Boolean))];
  const pending = [...new Set((pendingIds ?? []).filter((id) => ids.includes(id)))];
  return pending.length > 0 ? pending : ids;
}

export function severityHistoryRows(entries = []) {
  const seen = new Set();
  const rows = [];
  for (const item of entries) {
    if (!item) continue;
    const key = item.annotationId
      ? `${item.lineId ?? ''}:${item.annotationId}`
      : [item.lineId, item.level, item.status, item.provenance].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const presentation = severityPresentation(item);
    const when = typeof item.recordedAt === 'string' && item.recordedAt.trim() ? item.recordedAt.trim() : null;
    rows.push({
      key,
      lineId: item.lineId ?? null,
      level: presentation.level,
      state: presentation.state,
      when,
    });
  }
  return rows;
}

export async function confirmZoneLines(lineIds, confirm) {
  const recorded = [];
  const pending = [];
  for (const lineId of [...new Set((lineIds ?? []).filter(Boolean))]) {
    try {
      await confirm(lineId);
      recorded.push(lineId);
    } catch {
      pending.push(lineId);
    }
  }
  return {
    recorded,
    pending,
    complete: pending.length === 0 && recorded.length > 0,
  };
}

export function lineCharge(line) {
  if (line?.role === 'part') return 'part';
  if (line?.role === 'labor') {
    return line.labor === 'repair' || line.labor === 'paint' || line.labor === 'mount_and_paint' ? 'labor' : null;
  }
  if (line?.role != null) return null;
  if (line?.treatment === 'replace') return 'part';
  if (line?.treatment === 'paint' || line?.treatment === 'repair') return 'labor';
  return null;
}

function chargeSignature(line) {
  if (line?.role === 'part' || line?.role === 'labor') return `${line.role}:${line.labor ?? ''}`;
  return `treatment:${line?.treatment ?? ''}`;
}

function severitySignature(annotation) {
  if (!annotation) return null;
  return [
    annotation.level ?? '',
    annotation.status ?? '',
    annotation.provenance ?? '',
    annotation.inferenceMethod ?? '',
  ].join('\0');
}

function severityCompatible(lines) {
  const signatures = lines
    .map((line) => severitySignature(line?.severityAnnotation))
    .filter((value) => value != null);
  return new Set(signatures).size <= 1;
}

function zoneCard(identity, items, separate) {
  const ordered = [...items].sort((left, right) => left.index - right.index);
  const lines = ordered.map((item) => item.line);
  const amounts = lines.map(lineAmount);
  const complete = amounts.every((amount) => amount != null);
  const anchor = lines[0];
  return {
    id: separate ? `line:${anchor?.lineId ?? ordered[0].index}` : `zone:${identity}`,
    name: anchor?.part ?? '',
    identity: separate ? null : identity,
    grouped: !separate,
    lines,
    subtotal: complete ? amounts.reduce((sum, amount) => sum + amount, 0) : null,
    order: ordered[0].index,
  };
}

export function groupWorkZones(lines = []) {
  const buckets = new Map();
  const loose = [];
  lines.forEach((line, index) => {
    const identity = zoneIdentity(line);
    if (!identity) {
      loose.push({ line, index });
      return;
    }
    if (!buckets.has(identity)) buckets.set(identity, []);
    buckets.get(identity).push({ line, index });
  });
  const cards = [];
  for (const [identity, items] of buckets) {
    const signatures = items.map(({ line }) => chargeSignature(line));
    const charges = items.map(({ line }) => lineCharge(line));
    const unique = new Set(signatures).size === signatures.length;
    const classified = charges.every((charge) => charge != null);
    if (items.length > 1 && unique && classified && severityCompatible(items.map(({ line }) => line))) {
      cards.push(zoneCard(identity, items, false));
    } else {
      items.forEach((item) => loose.push(item));
    }
  }
  loose.forEach((item) => cards.push(zoneCard(null, [item], true)));
  cards.sort((left, right) => left.order - right.order);
  return cards.map(({ order, ...card }) => card);
}

function sumCharge(lines, charge) {
  const selected = lines.filter((line) => lineCharge(line) === charge);
  if (selected.some((line) => lineAmount(line) == null)) return { sum: null, count: selected.length };
  return {
    sum: selected.reduce((total, line) => total + lineAmount(line), 0),
    count: selected.length,
  };
}

export function economicSummary(lines = [], documentTotal) {
  const total = Number.isInteger(documentTotal) ? documentTotal : null;
  const parts = sumCharge(lines, 'part');
  const labor = sumCharge(lines, 'labor');
  const unclassified = lines.filter((line) => lineCharge(line) == null).length;
  const amounts = lines.map(lineAmount);
  const complete = amounts.every((amount) => amount != null);
  const zoneSum = complete ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
  return {
    parts: parts.sum,
    partsCount: parts.count,
    labor: labor.sum,
    laborCount: labor.count,
    unclassified,
    documentTotal: total,
    zoneSum,
    reconciles: total != null && complete && zoneSum === total,
  };
}

function unclassifiedAmount(lines) {
  const amounts = lines.filter((line) => lineCharge(line) == null).map(lineAmount);
  if (amounts.length === 0 || amounts.some((amount) => amount == null)) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function financialPresentation(lines = [], documentTotal) {
  const summary = economicSummary(lines, documentTotal);
  const single = lines.length === 1 ? lines[0] : null;
  const combined = Boolean(
    single
    && single.role == null
    && single.treatment === 'repair_paint'
    && lineCharge(single) == null
    && lineAmount(single) != null,
  );
  const mode = combined ? 'combined' : summary.unclassified > 0 ? 'partial' : 'classified';
  return {
    ...summary,
    mode,
    unclassifiedAmount: summary.unclassified > 0 ? unclassifiedAmount(lines) : null,
    showParts: mode === 'classified' || (mode === 'partial' && summary.partsCount > 0),
    showLabor: mode === 'classified' || (mode === 'partial' && summary.laborCount > 0),
    showUnclassified: mode === 'partial',
  };
}

export function presentedAmountLabel(line, mode) {
  if (mode === 'combined' && line?.role == null && line?.treatment === 'repair_paint') {
    return 'Reparación y pintura';
  }
  return amountLabel(line);
}

const SYSTEM_DISCREPANCY = 'Posible discrepancia visual: la fotografía parece mostrar el lado contrario de la pieza declarada. Procedencia: visual_inference. No es un hecho confirmado.';
const SYSTEM_VISUAL = 'Advertencia visual no aplicada: la inferencia no sustituye la severidad declarada. Procedencia: visual_inference.';
const SYSTEM_CLARIFICATION = 'La severidad escrita no es un nivel explícito de severity-v1 y queda sin clasificación.';
const HUMAN_QUOTE = /^la cotizacion (?:declara|describe)\b/;
const HUMAN_OPERATOR = /^autofix indica\b/;
const PHOTO_SOURCE = /\b(?:las fotografias muestran|la fotografia muestra)\b/;
const VISUAL_SOURCE = /\bse observa\b/;
const UNDECLARED = /\bno (?:fue declarado|fueron declarados)\b/;
const NOT_IN_IMAGE = /\bno (?:aparece|se observa) en (?:las imagenes|la imagen)\b/;

function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .trim();
}

function sideOfName(value) {
  const found = new Set(foldText(value).match(/\b(?:derecha|izquierda)\b/gu) ?? []);
  if (found.size !== 1) return null;
  return [...found][0];
}

function oppositeName(part, side) {
  const other = side === 'derecha' ? 'izquierda' : 'derecha';
  return foldText(part).replace(new RegExp(`\\b${side}\\b`, 'u'), other);
}

function questionsCorrespondence(folded, lines) {
  if (!PHOTO_SOURCE.test(folded)) return false;
  return (lines ?? []).some((line) => {
    const part = typeof line?.part === 'string' ? line.part : '';
    const side = sideOfName(part);
    const declared = foldText(part);
    if (!side || !declared) return false;
    const declaredMissing = NOT_IN_IMAGE.test(folded) && folded.includes(declared);
    const namesOpposite = folded.includes(oppositeName(part, side));
    return declaredMissing || namesOpposite;
  });
}

function classifyObservation(text, lines) {
  const folded = foldText(text);
  if (folded === foldText(SYSTEM_DISCREPANCY)) {
    return {
      kind: 'review',
      correspondence: true,
      note: 'Posible discrepancia · Pendiente de revisión · No es un hecho confirmado',
    };
  }
  if (folded === foldText(SYSTEM_VISUAL)) {
    return { kind: 'visual', correspondence: false, note: 'No es un hecho confirmado' };
  }
  if (folded === foldText(SYSTEM_CLARIFICATION)) {
    return { kind: 'review', correspondence: false, note: 'Dato incompleto · Procedencia no determinada' };
  }
  const human = HUMAN_QUOTE.test(folded) || HUMAN_OPERATOR.test(folded);
  const visual = PHOTO_SOURCE.test(folded) || VISUAL_SOURCE.test(folded);
  if (questionsCorrespondence(folded, lines)) {
    return {
      kind: 'review',
      correspondence: true,
      note: 'Posible discrepancia · Pendiente de revisión · No es un hecho confirmado',
    };
  }
  if (UNDECLARED.test(folded)) {
    return { kind: 'review', correspondence: false, note: 'Dato incompleto · Pendiente de revisión' };
  }
  if (human && visual) {
    return { kind: 'review', correspondence: false, note: 'Atribuciones mezcladas · Procedencia no determinada' };
  }
  if (human) {
    return {
      kind: 'human',
      correspondence: false,
      note: HUMAN_OPERATOR.test(folded) ? 'Atribuida a AutoFix' : 'Atribuida a la cotización',
    };
  }
  if (visual) {
    return { kind: 'visual', correspondence: false, note: 'No es un hecho confirmado' };
  }
  return { kind: 'unknown', correspondence: false, note: 'Procedencia no determinada' };
}

export function groupObservations(observations = [], lines = []) {
  const groups = { human: [], visual: [], review: [], unknown: [] };
  const seen = new Set();
  for (const item of observations ?? []) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    const key = foldText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const reading = classifyObservation(text, lines);
    groups[reading.kind].push({
      text,
      note: reading.note,
      correspondence: reading.correspondence,
    });
  }
  return groups;
}

export function correspondencePending(observations = [], lines = []) {
  return groupObservations(observations, lines).review.some((item) => item.correspondence);
}
