function normalizePiezaText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Código interno (no confundir con PDI = puerta delantera izquierda). */
export const PANEL_PIEZA_INTERNAL_DAMAGES_CODE = 'PDI_INT';

/** Refacción con nombre y precio manual (sin matriz). */
export const PANEL_PIEZA_REFACCION_CODE = 'REFACCION';

/** Baño de pintura completo (visión / catálogo por tamaño, no por código de golpe). */
export const PANEL_PIEZA_BPC_CODE = 'BPC';

/**
 * Opciones del panel: `code` (valor guardado / select), `label` (visible corto),
 * `fullName` (cliente / narrativa), `catalogPieza` (matriz de precios).
 */
export const PANEL_PIEZA_OPTIONS = [
  {
    code: PANEL_PIEZA_INTERNAL_DAMAGES_CODE,
    label: '⚠️ PDI',
    menuLabel: '⚠️ PDI (Posibles Daños Internos)',
    fullName: 'Posibles daños internos',
    catalogPieza: '',
    group: 'Especiales',
    internalDamageRange: true,
  },
  {
    code: PANEL_PIEZA_REFACCION_CODE,
    label: '⚙️ Refacción',
    menuLabel: '⚙️ Refacción',
    fullName: 'Refacción',
    catalogPieza: '',
    group: 'Especiales',
    refaccionManual: true,
  },
  { code: 'SI', label: 'SI', fullName: 'Salpicadera izquierda', catalogPieza: 'Salpicadera', group: 'Salpicaderas' },
  { code: 'SD', label: 'SD', fullName: 'Salpicadera derecha', catalogPieza: 'Salpicadera', group: 'Salpicaderas' },
  {
    code: 'STI',
    label: 'STI',
    fullName: 'Salpicadera trasera izquierda',
    catalogPieza: 'Salpicadera',
    group: 'Salpicaderas',
  },
  {
    code: 'STD',
    label: 'STD',
    fullName: 'Salpicadera trasera derecha',
    catalogPieza: 'Salpicadera',
    group: 'Salpicaderas',
  },
  {
    code: 'PDI',
    label: 'PDI',
    fullName: 'Puerta delantera izquierda',
    catalogPieza: 'Puerta',
    group: 'Puertas',
  },
  {
    code: 'PDD',
    label: 'PDD',
    fullName: 'Puerta delantera derecha',
    catalogPieza: 'Puerta',
    group: 'Puertas',
  },
  {
    code: 'PTI',
    label: 'PTI',
    fullName: 'Puerta trasera izquierda',
    catalogPieza: 'Puerta',
    group: 'Puertas',
  },
  {
    code: 'PTD',
    label: 'PTD',
    fullName: 'Puerta trasera derecha',
    catalogPieza: 'Puerta',
    group: 'Puertas',
  },
  { code: 'EI', label: 'EI', fullName: 'Estribos izquierdos', catalogPieza: 'Estribo', group: 'Estribos' },
  { code: 'ED', label: 'ED', fullName: 'Estribos derechos', catalogPieza: 'Estribo', group: 'Estribos' },
  { code: 'FD', label: 'FD', fullName: 'Fascia delantera', catalogPieza: 'Fascia', group: 'Fascias' },
  { code: 'FT', label: 'FT', fullName: 'Fascia trasera', catalogPieza: 'Fascia', group: 'Fascias' },
  { code: 'POI', label: 'POI', fullName: 'Poste izquierdo', catalogPieza: 'Poste', group: 'Postes' },
  { code: 'POD', label: 'POD', fullName: 'Poste derecho', catalogPieza: 'Poste', group: 'Postes' },
  { code: 'Cofre', label: 'Cofre', fullName: 'Cofre', catalogPieza: 'Cofre', group: 'Otros' },
  {
    code: 'BiCO',
    label: 'BiCO',
    fullName: 'Bigote Cofre',
    catalogPieza: 'BiCO',
    group: 'Otros',
  },
  {
    code: 'Parilla',
    label: 'Parilla',
    fullName: 'Parilla',
    catalogPieza: 'Parilla',
    group: 'Otros',
  },
  { code: 'Tapa Cajuela', label: 'Tapa Cajuela', fullName: 'Tapa de cajuela', catalogPieza: 'Tapa Cajuela', group: 'Otros' },
  { code: 'Toldo', label: 'Toldo', fullName: 'Toldo', catalogPieza: 'Toldo', group: 'Otros' },
  { code: 'Espejo', label: 'Espejo', fullName: 'Espejo', catalogPieza: 'Espejo', group: 'Otros' },
  {
    code: 'Moldura',
    label: 'Moldura',
    fullName: 'Moldura',
    catalogPieza: 'Estetica Exterior',
    group: 'Otros',
  },
  {
    code: 'Estetica Exterior',
    label: 'Estética Ext.',
    fullName: 'Estética exterior',
    catalogPieza: 'Estetica Exterior',
    group: 'Otros',
  },
  {
    code: PANEL_PIEZA_BPC_CODE,
    label: 'BPC',
    menuLabel: 'BPC — Baño de pintura completo',
    fullName: 'Baño de Pintura Completo',
    catalogPieza: 'Baño de Pintura Exterior',
    group: 'Especiales',
    banioCompleto: true,
  },
];

export const PANEL_PIEZA_CODES = new Set(PANEL_PIEZA_OPTIONS.map((o) => o.code));

const byCode = new Map(PANEL_PIEZA_OPTIONS.map((o) => [o.code, o]));

/** Aliases explícitos cuando varias siglas comparten catalogPieza (p. ej. FD/FT → Fascia). */
const EXPLICIT_PIEZA_ALIASES = {
  'fascia delantera': 'FD',
  'fascia delantero': 'FD',
  'fascia trasera': 'FT',
  'fascia trasero': 'FT',
  'salpicadera izquierda': 'SI',
  'salpicadera derecha': 'SD',
  'salpicadera delantera izquierda': 'SI',
  'salpicadera delantera derecha': 'SD',
  'salpicadera del izquierda': 'SI',
  'salpicadera trasera izquierda': 'STI',
  'salpicadera trasera derecha': 'STD',
  'puerta delantera izquierda': 'PDI',
  'puerta delantera derecha': 'PDD',
  'puerta trasera izquierda': 'PTI',
  'puerta trasera derecha': 'PTD',
  'estribo izquierdo': 'EI',
  'estribos izquierdos': 'EI',
  'estribo derecho': 'ED',
  'estribos derechos': 'ED',
  'poste izquierdo': 'POI',
  'poste derecho': 'POD',
};

const catalogPiezaCodeCounts = new Map();
for (const opt of PANEL_PIEZA_OPTIONS) {
  if (!opt.catalogPieza) continue;
  catalogPiezaCodeCounts.set(
    opt.catalogPieza,
    (catalogPiezaCodeCounts.get(opt.catalogPieza) ?? 0) + 1,
  );
}

const aliasNormToCode = new Map();
for (const opt of PANEL_PIEZA_OPTIONS) {
  aliasNormToCode.set(normalizePiezaText(opt.code), opt.code);
  aliasNormToCode.set(normalizePiezaText(opt.label), opt.code);
  aliasNormToCode.set(normalizePiezaText(opt.fullName), opt.code);
  if (
    opt.catalogPieza &&
    catalogPiezaCodeCounts.get(opt.catalogPieza) === 1
  ) {
    aliasNormToCode.set(normalizePiezaText(opt.catalogPieza), opt.code);
  }
}
for (const [alias, code] of Object.entries(EXPLICIT_PIEZA_ALIASES)) {
  aliasNormToCode.set(normalizePiezaText(alias), code);
}
aliasNormToCode.set(normalizePiezaText('salpicadera delantera izquierda'), 'SI');
aliasNormToCode.set(normalizePiezaText('salpicadera del izquierda'), 'SI');
aliasNormToCode.set(normalizePiezaText('salpicadera delantera derecha'), 'SD');
aliasNormToCode.set(normalizePiezaText('estribo izquierdo'), 'EI');
aliasNormToCode.set(normalizePiezaText('estribo derecho'), 'ED');
aliasNormToCode.set(normalizePiezaText('fascia delantero'), 'FD');
aliasNormToCode.set(normalizePiezaText('fascia trasero'), 'FT');
aliasNormToCode.set(
  normalizePiezaText('posibles danos internos'),
  PANEL_PIEZA_INTERNAL_DAMAGES_CODE,
);
aliasNormToCode.set(
  normalizePiezaText('posibles daños internos'),
  PANEL_PIEZA_INTERNAL_DAMAGES_CODE,
);
aliasNormToCode.set(normalizePiezaText('refaccion'), PANEL_PIEZA_REFACCION_CODE);
aliasNormToCode.set(normalizePiezaText('refacción'), PANEL_PIEZA_REFACCION_CODE);
aliasNormToCode.set(normalizePiezaText('bpc'), PANEL_PIEZA_BPC_CODE);
aliasNormToCode.set(normalizePiezaText('bigote cofre'), 'BiCO');
aliasNormToCode.set(normalizePiezaText('bico'), 'BiCO');
aliasNormToCode.set(normalizePiezaText('parilla'), 'Parilla');
aliasNormToCode.set(
  normalizePiezaText('bano de pintura completo'),
  PANEL_PIEZA_BPC_CODE,
);
aliasNormToCode.set(
  normalizePiezaText('baño de pintura completo'),
  PANEL_PIEZA_BPC_CODE,
);
aliasNormToCode.set(
  normalizePiezaText('bano de pintura exterior'),
  PANEL_PIEZA_BPC_CODE,
);
aliasNormToCode.set(
  normalizePiezaText('baño de pintura exterior'),
  PANEL_PIEZA_BPC_CODE,
);

const catalogNamesByLengthDesc = [
  ...new Set(PANEL_PIEZA_OPTIONS.map((o) => o.catalogPieza)),
].sort((a, b) => b.length - a.length);

function matchCatalogPiezaFromFreeText(parteLibre) {
  const n = normalizePiezaText(parteLibre);
  if (!n) return null;
  for (const name of catalogNamesByLengthDesc) {
    const key = normalizePiezaText(name);
    if (!key) continue;
    if (n === key || n.includes(key) || (key.length >= 4 && key.includes(n))) {
      return name;
    }
  }
  return null;
}

/** Grupos ordenados para `<optgroup>`. */
export const PANEL_PIEZA_OPTION_GROUPS = [
  'Especiales',
  'Salpicaderas',
  'Puertas',
  'Estribos',
  'Fascias',
  'Postes',
  'Otros',
].map((group) => ({
  group,
  options: PANEL_PIEZA_OPTIONS.filter((o) => o.group === group),
}));

function disambiguatePanelOptionsFromText(text, candidates) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];
  const n = normalizePiezaText(text);
  const wantsDelantera = /\bdelantera?\b|\bdel\b/.test(n);
  const wantsTrasera = /\btrasera?\b|\btras\b/.test(n);
  const wantsIzquierd = /\bizquierd/.test(n);
  const wantsDerech = /\bderech/.test(n);

  let pool = [...candidates];
  if (wantsDelantera) {
    pool = pool.filter((o) => /delantera|del\b/i.test(o.fullName));
  } else if (wantsTrasera) {
    pool = pool.filter((o) => /trasera|tras\b/i.test(o.fullName));
  }
  if (wantsIzquierd) {
    pool = pool.filter((o) => /izquierd/i.test(o.fullName));
  } else if (wantsDerech) {
    pool = pool.filter((o) => /derech/i.test(o.fullName));
  }
  if (pool.length === 1) return pool[0];
  return null;
}

export function findPanelPiezaOption(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (byCode.has(t)) return byCode.get(t);
  const n = normalizePiezaText(t);
  const direct = aliasNormToCode.get(n);
  if (direct) return byCode.get(direct) ?? null;
  for (const opt of PANEL_PIEZA_OPTIONS) {
    const fn = normalizePiezaText(opt.fullName);
    if (n === fn) return opt;
  }
  const partialHits = [];
  for (const opt of PANEL_PIEZA_OPTIONS) {
    const fn = normalizePiezaText(opt.fullName);
    if (n.includes(fn) || fn.includes(n)) partialHits.push(opt);
  }
  const disambiguated = disambiguatePanelOptionsFromText(t, partialHits);
  if (disambiguated) return disambiguated;
  if (partialHits.length === 1) return partialHits[0];
  const canon = matchCatalogPiezaFromFreeText(t);
  if (canon) {
    const normCanon = normalizePiezaText(canon);
    const hits = PANEL_PIEZA_OPTIONS.filter(
      (o) => normalizePiezaText(o.catalogPieza) === normCanon,
    );
    if (hits.length === 1) return hits[0];
    const fromCanon = disambiguatePanelOptionsFromText(t, hits);
    if (fromCanon) return fromCanon;
  }
  return null;
}

export function normalizePiezaCodeForPanel(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const opt = findPanelPiezaOption(t);
  if (opt) return opt.code;
  return t;
}

export function isKnownPanelPiezaCode(raw) {
  const t = String(raw ?? '').trim();
  return Boolean(t && PANEL_PIEZA_CODES.has(t));
}

export function getPiezaSelectLabel(raw) {
  const opt = findPanelPiezaOption(raw);
  return opt?.label ?? String(raw ?? '').trim();
}

export function getPiezaMenuLabel(raw) {
  const opt = findPanelPiezaOption(raw);
  return opt?.menuLabel ?? opt?.label ?? String(raw ?? '').trim();
}

export function isInternalDamageRangePieza(raw) {
  return (
    String(raw ?? '').trim() === PANEL_PIEZA_INTERNAL_DAMAGES_CODE ||
    Boolean(findPanelPiezaOption(raw)?.internalDamageRange)
  );
}

export function isRefaccionPieza(raw) {
  return (
    String(raw ?? '').trim() === PANEL_PIEZA_REFACCION_CODE ||
    Boolean(findPanelPiezaOption(raw)?.refaccionManual)
  );
}

export function isBanioPinturaCompletoPieza(raw) {
  const t = String(raw ?? '').trim();
  if (t === PANEL_PIEZA_BPC_CODE) return true;
  if (Boolean(findPanelPiezaOption(raw)?.banioCompleto)) return true;
  const n = normalizePiezaText(t);
  return (
    n === 'bpc' ||
    n.includes('bano de pintura completo') ||
    n.includes('baño de pintura completo')
  );
}

export function isSpecialPanelPieza(raw) {
  return (
    isInternalDamageRangePieza(raw) ||
    isRefaccionPieza(raw) ||
    isBanioPinturaCompletoPieza(raw)
  );
}

/** Nombre completo para cliente / narrativa / API. */
export function getPiezaClienteDisplayName(raw) {
  const opt = findPanelPiezaOption(raw);
  if (opt) return opt.fullName;
  const t = String(raw ?? '').trim();
  if (!t) return 'Servicio';
  const canon = matchCatalogPiezaFromFreeText(t);
  return canon ?? t;
}

/** Clave de fila en `PIEZA_DANO_PRICE_MATRIX`. */
export function resolveCatalogPiezaForEstimate(raw) {
  if (isSpecialPanelPieza(raw)) return '';
  const opt = findPanelPiezaOption(raw);
  if (opt?.catalogPieza) return opt.catalogPieza;
  const canon = matchCatalogPiezaFromFreeText(raw);
  return canon ?? String(raw ?? '').trim();
}
