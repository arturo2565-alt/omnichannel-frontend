import { mergeRules } from './catalog-pricing.js';

function pieceRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({ ...row, basePrice: row.basePrice ?? 0 }));
}

function pieceMap(rows, priceKey) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.servicio, {
      [priceKey]: row[priceKey],
      diasEntrega: row.diasEntrega,
    });
  }
  return map;
}

function moneyRows(rows, priceKey) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => ({ ...row, [priceKey]: row[priceKey] ?? 0 }));
}

/** Estado editable del catálogo a partir de la última vista confirmada. */
export function catalogEditorFromView(view) {
  const rules = mergeRules(view?.rules);
  const pieceBases = pieceRows(view?.pieceBases);
  const integralBases = pieceRows(view?.integralBases);
  const montajeBases = moneyRows(view?.montajePinturaBases, 'precio');
  const montajeInstallBases = moneyRows(view?.montajeBases, 'precio');
  return {
    rules,
    rulesBaseline: rules,
    pieceBases,
    pieceBaseline: pieceMap(pieceBases, 'basePrice'),
    integralBases,
    integralBaseline: pieceMap(integralBases, 'basePrice'),
    montajeBases,
    montajeBaseline: pieceMap(montajeBases, 'precio'),
    montajeInstallBases,
    montajeInstallBaseline: pieceMap(montajeInstallBases, 'precio'),
  };
}
