/** Réplica front del motor de precios (catalog-pricing-rules.ts). */

export const DAMAGE_MAGNITUDES = ['LEVE', 'MEDIO', 'FUERTE', 'MUY_FUERTE'];

export const DAMAGE_MAGNITUDE_LABELS = {
  LEVE: 'Leve',
  MEDIO: 'Medio',
  FUERTE: 'Fuerte',
  MUY_FUERTE: 'Muy fuerte',
};

export const SIZE_TIER_LABELS = {
  Compacto: 'Compacto (Chico)',
  Mediano: 'Mediano',
  Grande: 'Grande',
  XL: 'XL',
};

export const DEFAULT_RULES = {
  sizeTierFactors: {
    Compacto: 1,
    Mediano: 1.0344827586,
    Grande: 1.1724137931,
    XL: 1.275862069,
  },
  premiumFactor: 1.1,
  severityFactors: {
    LEVE: 1,
    MEDIO: 1.12,
    FUERTE: 1.3,
    MUY_FUERTE: 1.55,
  },
  roundToMx: 50,
};

export function mergeRules(partial) {
  const d = DEFAULT_RULES;
  const p = partial ?? {};
  return {
    sizeTierFactors: {
      Compacto: Number(p.sizeTierFactors?.Compacto ?? d.sizeTierFactors.Compacto),
      Mediano: Number(p.sizeTierFactors?.Mediano ?? d.sizeTierFactors.Mediano),
      Grande: Number(p.sizeTierFactors?.Grande ?? d.sizeTierFactors.Grande),
      XL: Number(p.sizeTierFactors?.XL ?? d.sizeTierFactors.XL),
    },
    premiumFactor: Number(p.premiumFactor ?? d.premiumFactor),
    severityFactors: {
      LEVE: Number(p.severityFactors?.LEVE ?? d.severityFactors.LEVE),
      MEDIO: Number(p.severityFactors?.MEDIO ?? d.severityFactors.MEDIO),
      FUERTE: Number(p.severityFactors?.FUERTE ?? d.severityFactors.FUERTE),
      MUY_FUERTE: Number(p.severityFactors?.MUY_FUERTE ?? d.severityFactors.MUY_FUERTE),
    },
    roundToMx: Number(p.roundToMx ?? d.roundToMx),
  };
}

export function roundCatalogPrice(amount, roundToMx) {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (n < 100 || roundToMx <= 0) return n;
  return Math.round(n / roundToMx) * roundToMx;
}

export function computePiecePrice({
  basePrice,
  sizeTier = 'Compacto',
  isPremium = false,
  damageMagnitude = 'LEVE',
  rules,
}) {
  const r = mergeRules(rules);
  const base = Math.max(0, Math.round(Number(basePrice) || 0));
  if (base <= 0) return 0;
  let price = base;
  price *= r.sizeTierFactors[sizeTier] ?? 1;
  if (isPremium) price *= r.premiumFactor;
  price *= r.severityFactors[damageMagnitude] ?? 1;
  return roundCatalogPrice(price, r.roundToMx);
}

export function formatMx(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-MX')}`;
}

/** Escenarios de vista previa en tabla de piezas. */
export const PREVIEW_SCENARIOS = [
  { key: 'compacto', label: 'Compacto std · Leve', sizeTier: 'Compacto', isPremium: false, magnitude: 'LEVE' },
  { key: 'medianoPrem', label: 'Mediano prem · Leve', sizeTier: 'Mediano', isPremium: true, magnitude: 'LEVE' },
  { key: 'xlFuerte', label: 'XL prem · Fuerte', sizeTier: 'XL', isPremium: true, magnitude: 'FUERTE' },
];
