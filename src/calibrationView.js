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
