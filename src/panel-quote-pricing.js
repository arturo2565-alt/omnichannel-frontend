import {
  computePiecePrice,
  computeIntegralPrice,
  mergeRules,
  DAMAGE_MAGNITUDES,
  DAMAGE_MAGNITUDE_LABELS,
} from './catalog-pricing.js';
import {
  resolveCatalogPiezaForEstimate,
  isIntegralPanelPieza,
  panelSizeTierLabelToVehicleSizeTier,
} from './panel-pieza-options.js';
import {
  calculateEstimate,
  coerceDamageLevelCode,
} from './autofix-pricing.js';

/** Severidades del panel (piezas con matriz). */
export const PANEL_DAMAGE_MAGNITUDES = [...DAMAGE_MAGNITUDES];

export const PANEL_SEVERITY_SELECT_KEYS = ['N/A', ...PANEL_DAMAGE_MAGNITUDES];

export const PANEL_SEVERITY_LABELS = {
  'N/A': 'N/A — sin grado de daño',
  ...DAMAGE_MAGNITUDE_LABELS,
};

const LEGACY_TO_MAGNITUDE = {
  DL: 'LEVE',
  DML: 'LEVE',
  DM: 'MEDIO',
  DMF: 'FUERTE',
  DF: 'FUERTE',
  DMFUERTE: 'MUY_FUERTE',
  DMFuerte: 'MUY_FUERTE',
  LEVE: 'LEVE',
  MEDIO: 'MEDIO',
  FUERTE: 'FUERTE',
  MUY_FUERTE: 'MUY_FUERTE',
};

const MAGNITUDE_TO_LEGACY = {
  LEVE: 'DL',
  MEDIO: 'DM',
  FUERTE: 'DF',
  MUY_FUERTE: 'DMFuerte',
};

/** Normaliza texto IA / backend al código de magnitud del panel. */
export function coercePanelDamageMagnitude(raw) {
  const t = String(raw ?? '').trim();
  if (!t || /\bn\s*\/\s*a\b|^n\/a$/i.test(t)) return 'N/A';
  const upper = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (LEGACY_TO_MAGNITUDE[upper]) return LEGACY_TO_MAGNITUDE[upper];
  if (LEGACY_TO_MAGNITUDE[t]) return LEGACY_TO_MAGNITUDE[t];
  if (/^MUY_?FUERTE$/i.test(upper) || /muy\s*fuerte/i.test(t)) return 'MUY_FUERTE';
  if (/^FUERTE$/i.test(upper) || /\bgrave\b/i.test(t)) return 'FUERTE';
  if (/^MEDIO$/i.test(upper) || /moderad/i.test(t)) return 'MEDIO';
  if (/^LEVE$/i.test(upper) || /superficial|rayon/i.test(t)) return 'LEVE';
  const legacy = coerceDamageLevelCode(t);
  return LEGACY_TO_MAGNITUDE[legacy] ?? 'MEDIO';
}

function pieceBaseMapFromCatalog(pieceBases) {
  const map = new Map();
  for (const row of pieceBases ?? []) {
    const key = String(row?.servicio ?? '').trim();
    if (!key) continue;
    map.set(key, Math.max(0, Math.round(Number(row.basePrice) || 0)));
  }
  return map;
}

function integralBaseMapFromCatalog(integralBases) {
  const map = new Map();
  for (const row of integralBases ?? []) {
    const key = String(row?.servicio ?? '').trim();
    if (!key) continue;
    map.set(key, Math.max(0, Math.round(Number(row.basePrice) || 0)));
  }
  return map;
}

function lookupCatalogBasePrice(catalogPieza, pieceBasesMap) {
  const key = String(catalogPieza ?? '').trim();
  if (!key) return 0;
  if (pieceBasesMap.has(key)) return pieceBasesMap.get(key);
  for (const [servicio, price] of pieceBasesMap.entries()) {
    if (
      servicio.toLowerCase() === key.toLowerCase() ||
      key.toLowerCase().includes(servicio.toLowerCase()) ||
      servicio.toLowerCase().includes(key.toLowerCase())
    ) {
      return price;
    }
  }
  return 0;
}

/**
 * Precio sugerido para servicios integrales (cerámico, estética, baño) por tamaño de carrocería.
 */
export function computePanelIntegralPrice(pieza, sizeTierLabel, pricingCtx = {}) {
  const catalogPieza = resolveCatalogPiezaForEstimate(pieza);
  if (!catalogPieza) return 0;

  const integralBasesMap = integralBaseMapFromCatalog(pricingCtx.integralBases);
  const basePrice = lookupCatalogBasePrice(catalogPieza, integralBasesMap);
  if (basePrice <= 0) return 0;

  const profile = pricingCtx.vehicleProfile ?? {};
  const sizeTier = panelSizeTierLabelToVehicleSizeTier(
    sizeTierLabel ?? profile.sizeTier ?? 'Mediano',
  );
  return computeIntegralPrice({
    basePrice,
    sizeTier,
    isPremium: Boolean(profile.isPremium),
    rules: mergeRules(pricingCtx.rules),
  });
}

/** Precio sugerido: integral por tamaño o pieza por severidad. */
export function computePanelServicePrice(pieza, severidad, pricingCtx = {}) {
  if (isIntegralPanelPieza(pieza)) {
    return computePanelIntegralPrice(pieza, severidad, pricingCtx);
  }
  return computePanelPiecePrice(pieza, severidad, pricingCtx);
}

/**
 * Precio sugerido para una fila del panel usando motor de catálogo (base × tamaño × premium × severidad).
 * Si el catálogo aún no cargó, cae en matriz legacy como respaldo.
 */
export function computePanelPiecePrice(
  pieza,
  severidad,
  pricingCtx = {},
) {
  const magnitude = coercePanelDamageMagnitude(severidad);
  if (magnitude === 'N/A') return 0;

  const catalogPieza = resolveCatalogPiezaForEstimate(pieza);
  if (!catalogPieza) return 0;

  const pieceBasesMap = pieceBaseMapFromCatalog(pricingCtx.pieceBases);
  const basePrice = lookupCatalogBasePrice(catalogPieza, pieceBasesMap);

  if (basePrice > 0) {
    const profile = pricingCtx.vehicleProfile ?? {};
    return computePiecePrice({
      basePrice,
      sizeTier: profile.sizeTier ?? 'Compacto',
      isPremium: Boolean(profile.isPremium),
      damageMagnitude: magnitude,
      rules: mergeRules(pricingCtx.rules),
    });
  }

  const legacySev = MAGNITUDE_TO_LEGACY[magnitude] ?? 'DL';
  return Math.max(0, Math.round(calculateEstimate(pieza, legacySev) || 0));
}

export function createPanelPricingContext({
  pieceBases,
  integralBases,
  rules,
  vehicleProfile,
} = {}) {
  return { pieceBases, integralBases, rules, vehicleProfile };
}
