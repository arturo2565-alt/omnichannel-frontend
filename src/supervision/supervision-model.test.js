import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSupervisionModel, describePricingTrace } from './supervision-model.js';

test('cotización completa enviada y vehículo declarado', () => {
  const model = buildSupervisionModel({
    autopilotOn: true,
    leadStatus: 'cotizado',
    contact: { name: 'Ana Ensayo', channel: 'lab' },
    vehicles: [
      {
        identity: {
          vehicleId: 'veh-1',
          displayLabel: 'Mazda 2 2024',
          make: 'Mazda',
          model: '2',
          year: '2024',
          source: 'user',
          confirmedByUser: true,
        },
      },
    ],
    quote: { hasQuote: true, sent: true, partial: false, total: 6950 },
    lines: [
      {
        id: 'l1',
        label: 'Costado izquierdo',
        code: 'CTI',
        amount: 4050,
        priceSource: 'AUTOFIX_CATALOG',
        pricingStatus: 'OK',
      },
    ],
  });
  assert.equal(model.agent.mode, 'Autónomo');
  assert.equal(model.quote.label, 'Cotización enviada');
  assert.equal(model.quote.totalLabel, '$6,950');
  assert.equal(model.client.vehicles[0].provenance, 'declarado');
  assert.equal(model.client.vehicles[0].year, '2024');
});

test('cotización parcial y conversación sin cotización', () => {
  const partial = buildSupervisionModel({
    quote: { hasQuote: true, partial: true, total: 2900 },
  });
  assert.equal(partial.quote.label, 'Cotización parcial');
  const empty = buildSupervisionModel({});
  assert.equal(empty.quote.kind, 'sin_cotizacion');
  assert.equal(empty.agent.operation, 'Sin una operación registrada en este expediente.');
});

test('cita confirmada detecta el vehículo perdido y no inventa factores', () => {
  const model = buildSupervisionModel({
    leadStatus: 'agendado',
    autopilotOn: true,
    vehicles: [
      {
        identity: {
          displayLabel: 'Mazda 2 2024',
          source: 'user',
          confirmedByUser: true,
        },
      },
    ],
    appointment: {
      status: 'confirmada',
      when: 'miércoles 10:00',
      clientName: 'Ana Ensayo',
      vehicle: '',
      phone: '5512345678',
    },
    lines: [{ label: 'Costado', amount: 4050 }],
  });
  assert.equal(model.appointment.vehicle, 'Vehículo no indicado');
  assert.match(model.appointment.discrepancy, /no lo registró/);
  assert.equal(model.quote.lines[0].base, null);
  assert.equal(model.quote.lines[0].factors, '');
  assert.equal(model.quote.lines[0].trace, null);
});

test('una cotización histórica sin traza no se reconstruye', () => {
  const model = buildSupervisionModel({
    lines: [{ label: 'Costado trasero izquierdo', code: 'STI', amount: 4050, base: 3100, factors: 'x 1.3' }],
  });
  assert.equal(model.quote.lines[0].trace, null);
  assert.equal(model.quote.lines[0].base, null);
  assert.equal(model.quote.lines[0].amount, 4050);
});

test('la traza real se muestra y una traza distinta al importe no lo justifica', () => {
  const traced = buildSupervisionModel({
    lines: [{
      label: 'Costado trasero izquierdo',
      amount: 3750,
      pricingTrace: {
        schemaVersion: 1,
        pricingMethod: 'catalog_piece',
        physicalPanelKey: 'STI',
        catalogService: 'Salpicadera trasera',
        matrixSeverityKey: 'LEVE',
        basePriceMx: 2900,
        vehicleSizeTier: 'Compacto',
        sizeFactor: 1,
        premiumFactor: 1,
        damageMagnitude: 'FUERTE',
        severityFactor: 1.3,
        roundToMx: 50,
        calculatedAmountMx: 3750,
        pricingSource: 'AUTOFIX_CATALOG',
        pricingStatus: 'OK',
      },
    }],
  });
  const line = traced.quote.lines[0];
  assert.equal(line.trace.catalogService, 'Salpicadera trasera');
  assert.equal(line.trace.matrixSeverityKey, 'LEVE');
  assert.equal(line.base, 2900);
  assert.equal(line.amount, 3750);
  assert.equal(line.traceAgrees, true);

  const manual = buildSupervisionModel({
    lines: [{
      label: 'Fascia',
      amount: 1800,
      pricingTrace: {
        schemaVersion: 1,
        pricingMethod: 'manual',
        calculatedAmountMx: 1800,
        pricingSource: 'MANUAL',
        pricingStatus: 'OK',
      },
    }],
  });
  assert.equal(manual.quote.lines[0].trace.pricingMethod, 'manual');
  assert.equal(manual.quote.lines[0].trace.basePriceMx, null);
  assert.equal(manual.quote.lines[0].base, null);

  const stale = buildSupervisionModel({
    lines: [{
      label: 'Costado',
      amount: 4050,
      pricingTrace: {
        schemaVersion: 1,
        pricingMethod: 'catalog_piece',
        basePriceMx: 2900,
        calculatedAmountMx: 3750,
        pricingStatus: 'OK',
      },
    }],
  });
  assert.equal(stale.quote.lines[0].traceAgrees, false);
  assert.equal(stale.quote.lines[0].amount, 4050);
});

test('vehículo inferido, varios vehículos e intervención humana', () => {
  const model = buildSupervisionModel({
    autopilotOn: false,
    vehicles: [
      { identity: { vehicleId: 'a', displayLabel: 'Mazda 2 2024', source: 'vision' } },
      { identity: { vehicleId: 'b', displayLabel: 'Jetta 2018', source: 'user', confirmedByUser: true } },
    ],
    quote: { hasQuote: true, cartEditable: true, total: 1000 },
    awaitingVehicle: true,
  });
  assert.equal(model.agent.mode, 'Intervención humana');
  assert.equal(model.client.vehicles[0].provenance, 'inferido');
  assert.equal(model.client.vehicles[1].provenance, 'declarado');
  assert.equal(model.quote.label, 'Carrito editable');
  assert.equal(model.agent.blocked[0], 'Falta la identidad del vehículo para cotizar.');
});

test('separa el total enviado del expediente cuando el carrito cambió', () => {
  const model = buildSupervisionModel({
    quote: {
      hasQuote: true,
      sent: true,
      partial: true,
      cartEditable: true,
      sentTotal: 6950,
      total: 2900,
    },
  });
  assert.equal(model.quote.label, 'Cotización enviada, aún parcial');
  assert.equal(model.quote.amountCaption, 'Enviada, subtotal parcial');
  assert.equal(model.quote.totalLabel, '$6,950');
  assert.equal(model.quote.liveTotalLabel, '$2,900');
  assert.equal(model.quote.liveCaption, 'Subtotal del expediente');
});

test('el premium previo a la severidad conserva el factor real', () => {
  const facts = describePricingTrace({
    pricingMethod: 'catalog_piece',
    catalogService: 'Salpicadera',
    matrixSeverityKey: 'Mediano|LEVE',
    catalogBasePriceMx: 1500,
    effectiveBasePriceMx: 1650,
    premiumApplied: true,
    premiumFactor: 1.1,
    operationOrder: 'premium_round_then_severity',
    intermediateRoundToMx: 50,
    vehicleSizeTier: 'Mediano',
    damageMagnitude: 'LEVE',
    severityFactor: 1,
    roundToMx: 50,
    pricingSource: 'AUTOFIX_CATALOG',
    pricingStatus: 'OK',
  });
  const text = facts.map((fact) => `${fact.label} ${fact.value}`).join('\n');
  assert.match(text, /Base de catálogo/);
  assert.match(text, /Base efectiva/);
  assert.match(text, /Premium × 1\.1/);
  assert.match(text, /Redondeo intermedio/);
  assert.doesNotMatch(text, /Premium × 1$/m);
});

test('estado sin datos', () => {
  const model = buildSupervisionModel({ contact: {}, vehicles: [], evidence: [{ url: '' }] });
  assert.equal(model.client.name, 'Sin nombre');
  assert.equal(model.client.vehicles.length, 0);
  assert.equal(model.evidence.length, 0);
  assert.equal(model.appointment, null);
});
