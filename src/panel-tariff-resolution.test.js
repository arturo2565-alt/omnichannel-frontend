import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCatalogPiezaForEstimate } from './panel-pieza-options.js';
import { computePanelPiecePrice } from './panel-quote-pricing.js';
import { computePiecePrice } from './catalog-pricing.js';

const frontAndFascia = [
  { servicio: 'Salpicadera', basePrice: 4500 },
  { servicio: 'Fascia', basePrice: 2900 },
];

const withRear = [
  ...frontAndFascia,
  { servicio: 'Salpicadera trasera', basePrice: 5200 },
];

test('salpicadera delantera y costado usan tarifas distintas', () => {
  assert.equal(resolveCatalogPiezaForEstimate('SI'), 'Salpicadera');
  assert.equal(resolveCatalogPiezaForEstimate('SD'), 'Salpicadera');
  assert.equal(resolveCatalogPiezaForEstimate('STI'), 'Salpicadera trasera');
  assert.equal(resolveCatalogPiezaForEstimate('CTI'), 'Salpicadera trasera');
  assert.equal(resolveCatalogPiezaForEstimate('STD'), 'Salpicadera trasera');
  assert.equal(resolveCatalogPiezaForEstimate('CTD'), 'Salpicadera trasera');
  assert.equal(resolveCatalogPiezaForEstimate('FT'), 'Fascia');
});

test('simulador y catálogo coinciden cuando la tarifa trasera existe', () => {
  const ctx = { pieceBases: withRear, vehicleProfile: { sizeTier: 'Compacto' } };
  assert.equal(computePanelPiecePrice('SI', 'LEVE', ctx), 4500);
  assert.equal(computePanelPiecePrice('CTI', 'LEVE', ctx), 5200);
  assert.equal(computePanelPiecePrice('STI', 'LEVE', ctx), 5200);
  assert.equal(computePanelPiecePrice('FT', 'LEVE', ctx), 2900);
});

test('sin tarifa trasera el simulador no hereda la salpicadera ni inventa un importe', () => {
  const ctx = { pieceBases: frontAndFascia, vehicleProfile: { sizeTier: 'Compacto' } };
  assert.equal(computePanelPiecePrice('CTI', 'LEVE', ctx), 0);
  assert.equal(computePanelPiecePrice('STI', 'FUERTE', ctx), 0);
  assert.equal(computePanelPiecePrice('FT', 'LEVE', ctx), 2900);
  assert.equal(computePanelPiecePrice('SI', 'LEVE', ctx), 4500);
});

test('la referencia humana del Mazda 2 no es un precio del simulador', () => {
  const ctx = { pieceBases: frontAndFascia };
  const quoted = computePanelPiecePrice('CTI', 'FUERTE', ctx);
  assert.equal(quoted, 0);
  assert.ok(quoted < 6500 || quoted > 7500);
});

test('el simulador usa la misma fórmula que el candidato de calibración', () => {
  const ctx = {
    pieceBases: [
      { servicio: 'Salpicadera trasera', basePrice: 5400 },
      { servicio: 'Fascia', basePrice: 2900 },
    ],
    vehicleProfile: { sizeTier: 'Compacto', isPremium: false },
  };
  const side = computePanelPiecePrice('CTI', 'FUERTE', ctx);
  const fromFormula = computePiecePrice({
    basePrice: 5400,
    sizeTier: 'Compacto',
    isPremium: false,
    damageMagnitude: 'FUERTE',
  });
  assert.equal(side, fromFormula);
  assert.equal(side, 7000);
  assert.equal(computePanelPiecePrice('STI', 'FUERTE', ctx), side);
  assert.equal(computePanelPiecePrice('FT', 'LEVE', ctx), 2900);
  const inherited = computePiecePrice({
    basePrice: 2900,
    sizeTier: 'Compacto',
    isPremium: false,
    damageMagnitude: 'FUERTE',
  });
  assert.equal(inherited, 3750);
});
