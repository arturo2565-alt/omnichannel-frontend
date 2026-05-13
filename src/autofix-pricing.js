/**
 * Matriz pieza × severidad para el panel. Origen de verdad: GET `/price-matrix` (BD).
 * Hasta cargar el API, se usa la misma data sembrada que el script `db:seed:price-matrix`.
 */

export const DAMAGE_LEVEL_KEYS = [
  'DL',
  'DML',
  'DM',
  'DMF',
  'DF',
  'DMFuerte',
];

/** Misma matriz que `price-matrix.seed-data` en backend (respaldo offline). */
const EMBEDDED_MATRIX_ROWS = [
  { pieza: 'Fascia', DL: 2900, DML: 3300, DM: 3600, DMF: 3500, DF: 3500, DMFuerte: 4900 },
  { pieza: 'Salpicadera', DL: 2900, DML: 2900, DM: 3350, DMF: 3900, DF: 4400, DMFuerte: 6150 },
  { pieza: 'Puerta', DL: 3100, DML: 2800, DM: 3250, DMF: 4200, DF: 5150, DMFuerte: 7200 },
  {
    pieza: 'Salpicadera trasera',
    DL: 2900,
    DML: 3200,
    DM: 3700,
    DMF: 4700,
    DF: 5700,
    DMFuerte: 8000,
  },
  { pieza: 'Cofre', DL: 4000, DML: 4500, DM: 5000, DMF: 4500, DF: 5450, DMFuerte: 7650 },
  {
    pieza: 'Tapa Cajuela',
    DL: 3500,
    DML: 3900,
    DM: 4900,
    DMF: 5800,
    DF: 6900,
    DMFuerte: 7650,
  },
  { pieza: 'Toldo', DL: 4500, DML: 5400, DM: 6500, DMF: 7500, DF: 8000, DMFuerte: 9800 },
  { pieza: 'Espejo', DL: 900, DML: 1050, DM: 1225, DMF: 1450, DF: 1650, DMFuerte: 2300 },
  { pieza: 'Estribo', DL: 2500, DML: 3200, DM: 3400, DMF: 3900, DF: 4500, DMFuerte: 5500 },
  {
    pieza: 'Estetica Exterior',
    DL: 3500,
    DML: 3500,
    DM: 3500,
    DMF: 3500,
    DF: 3500,
    DMFuerte: 3500,
  },
];

/** Referencia mutable a la matriz activa (se reemplaza al cargar el catálogo). */
export const AUTO_FIX_BASE_PRICES = [...EMBEDDED_MATRIX_ROWS];

export const PIEZA_DANO_PRICE_MATRIX = AUTO_FIX_BASE_PRICES;

let rowByPiezaNorm = new Map();
let rowsByPiezaLengthDesc = [];

function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rebuildIndexes(matrix) {
  rowByPiezaNorm = new Map();
  for (const row of matrix) {
    rowByPiezaNorm.set(normalizeText(row.pieza), row);
  }
  rowsByPiezaLengthDesc = [...matrix].sort((a, b) => b.pieza.length - a.pieza.length);
}

function buildPiezaRowsFromFlat(flat) {
  const byPieza = new Map();
  for (const e of flat) {
    const pieza = String(e.pieza ?? '').trim();
    if (!pieza) continue;
    const sev = coerceDamageLevelCode(String(e.severidad ?? ''));
    const precio = Number(e.precio);
    if (!Number.isFinite(precio) || precio < 0) continue;
    if (!byPieza.has(pieza)) {
      const row = { pieza };
      for (const k of DAMAGE_LEVEL_KEYS) row[k] = 0;
      byPieza.set(pieza, row);
    }
    byPieza.get(pieza)[sev] = precio;
  }
  return [...byPieza.values()];
}

/**
 * Sincroniza la matriz en memoria desde el API (filas planas de `price_matrix`).
 * @returns {boolean} true si hubo datos válidos
 */
export function applyPriceMatrixFlatRows(flat) {
  if (!Array.isArray(flat) || flat.length === 0) return false;
  const rows = buildPiezaRowsFromFlat(flat);
  if (!rows.length) return false;
  AUTO_FIX_BASE_PRICES.length = 0;
  AUTO_FIX_BASE_PRICES.push(...rows);
  rebuildIndexes(AUTO_FIX_BASE_PRICES);
  return true;
}

/**
 * @param {string} apiBaseUrl
 * @returns {Promise<boolean>}
 */
export async function loadPriceMatrixFromApi(apiBaseUrl) {
  const base = String(apiBaseUrl ?? '').replace(/\/$/, '');
  if (!base) return false;
  try {
    const r = await fetch(`${base}/price-matrix`);
    if (!r.ok) return false;
    const flat = await r.json();
    return applyPriceMatrixFlatRows(flat);
  } catch {
    return false;
  }
}

rebuildIndexes(AUTO_FIX_BASE_PRICES);

export function matchPiezaFromAnalysis(parteLibre) {
  const n = normalizeText(parteLibre);
  if (!n) return null;
  if (rowByPiezaNorm.has(n)) return rowByPiezaNorm.get(n).pieza;
  for (const row of rowsByPiezaLengthDesc) {
    const key = normalizeText(row.pieza);
    if (!key) continue;
    if (n.includes(key) || (key.length >= 4 && key.includes(n))) {
      return row.pieza;
    }
  }
  return null;
}

export function findPiezaRow(pieza) {
  const n = normalizeText(pieza);
  if (rowByPiezaNorm.has(n)) return rowByPiezaNorm.get(n);
  const matched = matchPiezaFromAnalysis(pieza);
  if (!matched) return null;
  return rowByPiezaNorm.get(normalizeText(matched)) ?? null;
}

export function coerceDamageLevelCode(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return 'DM';
  const order = ['DMFuerte', 'DF', 'DMF', 'DM', 'DML', 'DL'];
  for (const level of order) {
    const escaped = level.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(t)) return level;
  }
  return 'DM';
}

export function resolveDamageLevelFromText(severidad, descripcionTecnica = '') {
  const blob = normalizeText(`${severidad} ${descripcionTecnica}`);
  if (!blob) return null;

  for (const level of DAMAGE_LEVEL_KEYS) {
    if (level === 'DMFuerte') {
      if (/\bdmfuerte\b|\bdmf\s*fuerte\b/i.test(blob)) return 'DMFuerte';
      continue;
    }
    const re = new RegExp(`\\b${level}\\b`, 'i');
    if (re.test(blob)) return level;
  }

  if (
    /\bdmfuerte\b|\bdmf\s*fuerte\b|\bmuy\s*grave\b|\bcatastrof/i.test(blob) ||
    /\bseveridad\s*extrema\b/i.test(blob)
  ) {
    return 'DMFuerte';
  }
  if (/\bgrave\b|\bdf\b(?![a-z])/i.test(blob) || /\bsevero\b/i.test(blob)) {
    return 'DF';
  }
  if (/\bdmf\b/i.test(blob)) return 'DMF';
  if (/moderad|intermedio|\bmedio\b/i.test(blob)) return 'DM';
  if (/dml|\bmenor\b|\bligero\b/i.test(blob)) return 'DML';
  if (/leve|superficial|rayon|arañazo|rozad/i.test(blob)) return 'DL';

  return null;
}

function damageLevelRank(level) {
  const i = DAMAGE_LEVEL_KEYS.indexOf(level);
  return i >= 0 ? i : 0;
}

function matrixAmountForPair(pieza, severidad, options = {}) {
  const onMissing = options.onMissing ?? 'zero';
  const row = findPiezaRow(pieza);
  const level = resolveDamageLevelFromText(
    severidad,
    options.descripcionTecnica,
  );

  if (!row || !level) {
    if (onMissing === 'throw') {
      throw new Error(
        !row
          ? `Pieza no reconocida: "${pieza}"`
          : `Severidad no reconocida: "${severidad}"`,
      );
    }
    return { amount: 0, level, row };
  }

  const amount = row[level];
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    if (onMissing === 'throw') throw new Error('Precio inválido en matriz');
    return { amount: 0, level, row };
  }
  return { amount, level, row };
}

export function matrixInventoryMaxLines(items, options = {}) {
  const byCanonical = new Map();

  for (const it of items) {
    const { amount, level, row } = matrixAmountForPair(
      it.pieza,
      it.severidad,
      options,
    );
    if (!row || !level || amount <= 0) continue;

    const canonical = row.pieza;
    const cur = byCanonical.get(canonical);
    if (!cur || amount > cur.price) {
      byCanonical.set(canonical, { price: amount, level });
    } else if (amount === cur.price) {
      if (damageLevelRank(level) > damageLevelRank(cur.level)) {
        byCanonical.set(canonical, { price: amount, level });
      }
    }
  }

  return [...byCanonical.entries()].map(([canonical, b]) => ({
    canonical,
    unitPrice: b.price,
    damageLevel: b.level,
  }));
}

export function calculateEstimate(piezaOrItems, severidadOrOptions, maybeOptions) {
  if (Array.isArray(piezaOrItems)) {
    const opts =
      typeof severidadOrOptions === 'object' &&
      severidadOrOptions !== null &&
      !Array.isArray(severidadOrOptions)
        ? severidadOrOptions
        : {};
    return matrixInventoryMaxLines(piezaOrItems, opts).reduce(
      (acc, l) => acc + l.unitPrice,
      0,
    );
  }

  let severidad = '';
  let options = {};
  if (typeof severidadOrOptions === 'string') {
    severidad = severidadOrOptions;
    options = maybeOptions ?? {};
  } else if (
    typeof severidadOrOptions === 'object' &&
    severidadOrOptions !== null &&
    !Array.isArray(severidadOrOptions)
  ) {
    options = severidadOrOptions;
  }

  return matrixAmountForPair(piezaOrItems, severidad, options).amount;
}
