/**
 * Matriz pieza × severidad para el panel. Por defecto coincide con el seed del backend;
 * al cargar la app se intenta reemplazar por `GET …/price-matrix` (catálogo en BD).
 */
import { API_BASE_URL } from './apiConfig.js';

/** Copia local del seed (alineada con `LEGACY_SEED_PIEZA_DANO_PRICE_MATRIX` en el backend). */
const LEGACY_SEED_ROWS = [
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

/** Referencia mutable a las filas activas (misma referencia que `AUTO_FIX_BASE_PRICES`). */
const ACTIVE_ROWS = LEGACY_SEED_ROWS.map((r) => ({ ...r }));

/** Expuesto al panel; se vacía y rellena al aplicar catálogo remoto. */
export const AUTO_FIX_BASE_PRICES = ACTIVE_ROWS;

export const DAMAGE_LEVEL_KEYS = [
  'DL',
  'DML',
  'DM',
  'DMF',
  'DF',
  'DMFuerte',
];

const GENERIC_FALLBACK_PRICE_MXN = 3500;

function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

let rowByPiezaNorm = new Map();
let rowsByPiezaLengthDesc = [];

function rebuildMaps() {
  rowByPiezaNorm = new Map();
  for (const row of ACTIVE_ROWS) {
    rowByPiezaNorm.set(normalizeText(row.pieza), row);
  }
  rowsByPiezaLengthDesc = [...ACTIVE_ROWS].sort((a, b) => b.pieza.length - a.pieza.length);
}

rebuildMaps();

/**
 * Convierte filas planas del API `{ pieza, severidad, precio }` en filas tipo matriz.
 */
function aggregateFlatToPiezaRows(flat) {
  const byPieza = new Map();
  for (const cell of flat) {
    const pieza = String(cell.pieza ?? '').trim();
    const sev = String(cell.severidad ?? '').trim();
    if (!pieza || !sev) continue;
    const precio = Math.round(Number(cell.precio));
    if (!Number.isFinite(precio) || precio < 0) continue;
    if (!byPieza.has(pieza)) {
      const row = { pieza };
      for (const k of DAMAGE_LEVEL_KEYS) row[k] = 0;
      byPieza.set(pieza, row);
    }
    if (DAMAGE_LEVEL_KEYS.includes(sev)) {
      byPieza.get(pieza)[sev] = precio;
    }
  }
  return [...byPieza.values()].filter((r) => DAMAGE_LEVEL_KEYS.some((k) => r[k] > 0));
}

/**
 * Carga el catálogo desde el backend. Si falla o viene vacío, se mantiene el seed local.
 */
export async function loadPriceMatrixFromBackend() {
  try {
    const r = await fetch(`${API_BASE_URL}/price-matrix`);
    if (!r.ok) return false;
    const data = await r.json();
    const flat = Array.isArray(data?.rows) ? data.rows : [];
    const rows = aggregateFlatToPiezaRows(flat);
    if (rows.length === 0) return false;
    ACTIVE_ROWS.length = 0;
    ACTIVE_ROWS.push(...rows);
    rebuildMaps();
    return true;
  } catch {
    return false;
  }
}

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
  const row = findPiezaRow(pieza);
  const level =
    resolveDamageLevelFromText(severidad, options.descripcionTecnica) ??
    coerceDamageLevelCode(severidad);

  if (row && level) {
    const amount = row[level];
    if (typeof amount === 'number' && !Number.isNaN(amount) && amount > 0) {
      return { amount, level, row };
    }
  }

  if (level) {
    return { amount: GENERIC_FALLBACK_PRICE_MXN, level, row: null };
  }
  return { amount: 0, level: null, row: null };
}

/**
 * Líneas por pieza: precio máximo por pieza distinta (criterio preventivo), alineado con el backend.
 */
export function matrixInventoryMaxLines(items, options = {}) {
  const byKey = new Map();

  for (const it of items) {
    const opt = {
      ...options,
      descripcionTecnica: it.descripcionTecnica ?? options.descripcionTecnica,
    };
    const { amount, level, row } = matrixAmountForPair(it.pieza, it.severidad, opt);
    if (amount <= 0 || !level) continue;

    const mapKey = row ? `cat:${normalizeText(row.pieza)}` : `raw:${normalizeText(it.pieza)}`;
    const display = row ? row.pieza : String(it.pieza ?? '').trim() || 'Pieza';

    const cur = byKey.get(mapKey);
    if (!cur || amount > cur.price) {
      byKey.set(mapKey, { price: amount, level, display });
    } else if (amount === cur.price) {
      if (damageLevelRank(level) > damageLevelRank(cur.level)) {
        byKey.set(mapKey, { price: amount, level, display });
      }
    }
  }

  return [...byKey.values()].map((b) => ({
    canonical: b.display,
    unitPrice: b.price,
    damageLevel: b.level,
  }));
}

/**
 * Una pieza + severidad, o array de pares (IA multi-pieza).
 */
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
