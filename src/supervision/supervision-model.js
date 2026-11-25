const LEAD_LABELS = {
  nuevo: 'Nuevo',
  cotizado: 'Cotizado',
  agendado: 'Agendado',
  recordatorio_enviado: 'Recordatorio enviado',
  atendido: 'Atendido',
  en_taller: 'En taller',
  no_asistio: 'No asistió',
  completado: 'Completado',
  transferido: 'Transferido',
};

export function describePricingTrace(trace) {
  if (!trace) return [];
  const money = (value) => formatSupervisionMoney(value);
  const rows = [];
  if (trace.pricingMethod === 'manual') {
    rows.push(['Procedencia', 'Precio manual autorizado. No usa una fórmula de catálogo.']);
  } else if (trace.pricingMethod === 'market_part') {
    rows.push(['Procedencia', 'Refacción de mercado. No procede de price_matrix.']);
  } else if (trace.pricingMethod === 'unconfigured') {
    rows.push(['Procedencia', 'Tarifa no configurada.']);
  }
  if (trace.catalogService) rows.push(['Tarifa', trace.catalogService]);
  if (trace.matrixSeverityKey) {
    rows.push([
      'Celda',
      trace.matrixRowId ? `${trace.matrixSeverityKey} · ${trace.matrixRowId}` : trace.matrixSeverityKey,
    ]);
  }
  if (trace.operationOrder === 'premium_round_then_severity') {
    if (trace.catalogBasePriceMx != null) rows.push(['Base de catálogo', money(trace.catalogBasePriceMx)]);
    if (trace.premiumApplied && trace.premiumFactor != null) {
      rows.push(['Premium', `× ${trace.premiumFactor}`]);
    }
    if (trace.intermediateRoundToMx != null) {
      rows.push(['Redondeo intermedio', money(trace.intermediateRoundToMx)]);
    }
    if (trace.effectiveBasePriceMx != null) rows.push(['Base efectiva', money(trace.effectiveBasePriceMx)]);
    rows.push(['Orden', 'Premium y redondeo, después la severidad.']);
    if (trace.vehicleSizeTier) {
      rows.push(['Vehículo', `${trace.vehicleSizeTier}. La celda ya corresponde a ese tamaño.`]);
    }
  } else if (trace.operationOrder === 'tier_cell_then_severity') {
    if (trace.catalogBasePriceMx != null) rows.push(['Base de catálogo', money(trace.catalogBasePriceMx)]);
    if (trace.vehicleSizeTier) {
      rows.push(['Vehículo', `${trace.vehicleSizeTier}. La celda ya corresponde a ese tamaño.`]);
    }
    rows.push(['Orden', 'Celda de tamaño, después la severidad.']);
  } else {
    if (trace.catalogBasePriceMx != null) rows.push(['Base', money(trace.catalogBasePriceMx)]);
    else if (trace.basePriceMx != null) rows.push(['Base', money(trace.basePriceMx)]);
    if (trace.vehicleSizeTier) {
      const factor = trace.sizeFactor != null ? ` × ${trace.sizeFactor}` : '';
      rows.push(['Vehículo', `${trace.vehicleSizeTier}${factor}`]);
    }
    if (trace.premiumApplied && trace.premiumFactor != null) {
      rows.push(['Premium', `× ${trace.premiumFactor}`]);
    }
  }
  if (trace.damageMagnitude) {
    const factor = trace.severityFactor != null ? ` × ${trace.severityFactor}` : '';
    rows.push(['Severidad', `${trace.damageMagnitude}${factor}`]);
  }
  if (trace.roundToMx != null) rows.push(['Redondeo', money(trace.roundToMx)]);
  if (trace.pricingSource) rows.push(['Fuente', trace.pricingSource]);
  if (trace.pricingStatus) rows.push(['Estado', trace.pricingStatus]);
  return rows.map(([label, value]) => ({ label, value }));
}

export function formatSupervisionMoney(amount) {
  const value = Math.round(Number(amount) || 0);
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

function readPricingTrace(raw) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) return null;
  const text = (value) => String(value ?? '').trim();
  const num = (value) =>
    value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const pricingMethod = text(raw.pricingMethod);
  if (!pricingMethod) return null;
  return {
    pricingMethod,
    physicalPanelKey: text(raw.physicalPanelKey),
    catalogService: text(raw.catalogService),
    matrixSeverityKey: text(raw.matrixSeverityKey),
    matrixRowId: text(raw.matrixRowId),
    catalogBasePriceMx: num(raw.catalogBasePriceMx),
    effectiveBasePriceMx: num(raw.effectiveBasePriceMx),
    basePriceMx: num(raw.basePriceMx),
    vehicleSizeTier: text(raw.vehicleSizeTier),
    formulaSizeTier: text(raw.formulaSizeTier),
    sizeFactor: num(raw.sizeFactor),
    premiumApplied: raw.premiumApplied === true,
    formulaPremiumApplied: raw.formulaPremiumApplied === true,
    premiumFactor: num(raw.premiumFactor),
    operationOrder: text(raw.operationOrder),
    intermediateRoundToMx: num(raw.intermediateRoundToMx),
    damageMagnitude: text(raw.damageMagnitude),
    severityFactor: num(raw.severityFactor),
    roundToMx: num(raw.roundToMx),
    calculatedAmountMx: num(raw.calculatedAmountMx),
    pricingSource: text(raw.pricingSource),
    pricingStatus: text(raw.pricingStatus),
  };
}

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function provenanceOf(source, confirmed) {
  const key = String(source ?? '').toLowerCase();
  if (key === 'user' || key === 'client') {
    return confirmed === false ? 'declarado' : 'declarado';
  }
  if (key === 'operator') return 'operador';
  if (key === 'vision' || key === 'inferred' || key === 'system') return 'inferido';
  return 'desconocido';
}

function vehicleLabel(vehicle) {
  const identity = vehicle?.identity ?? vehicle;
  const display = String(
    identity?.displayLabel ?? vehicle?.displayLabel ?? vehicle?.label ?? '',
  ).trim();
  if (display) return display;
  const parts = [identity?.make, identity?.model, identity?.year]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(' ');
}

function quotePresentation(input) {
  const hasQuote = Boolean(input?.hasQuote);
  const sent = Boolean(input?.sent);
  const partial = Boolean(input?.partial);
  const cartEditable = Boolean(input?.cartEditable);
  const total = Math.round(Number(input?.total) || 0);
  const sentTotal =
    input?.sentTotal == null || input?.sentTotal === ''
      ? null
      : Math.round(Number(input.sentTotal) || 0);
  let kind = 'sin_cotizacion';
  if (hasQuote && sent && partial) kind = 'enviada_parcial';
  else if (hasQuote && sent && cartEditable) kind = 'enviada_carrito';
  else if (hasQuote && sent) kind = 'enviada';
  else if (hasQuote && partial) kind = 'parcial';
  else if (hasQuote && cartEditable) kind = 'carrito';
  else if (hasQuote) kind = 'expediente';
  const amountCaption = !hasQuote
    ? 'Importe'
    : sent && sentTotal != null
      ? partial
        ? 'Enviada, subtotal parcial'
        : 'Total enviado'
      : partial
        ? 'Subtotal parcial'
        : kind === 'carrito'
          ? 'Total del carrito'
          : 'Total del expediente';
  const shown = sent && sentTotal != null ? sentTotal : total;
  const liveDiffers = sentTotal != null && hasQuote && sentTotal !== total;
  return {
    kind,
    amountCaption,
    total: shown,
    totalLabel: hasQuote ? formatSupervisionMoney(shown) : 'Sin total',
    liveCaption: partial ? 'Subtotal del expediente' : 'Expediente actual',
    liveTotalLabel: liveDiffers ? formatSupervisionMoney(total) : '',
  };
}

const QUOTE_KIND_LABEL = {
  sin_cotizacion: 'Sin cotización',
  enviada: 'Cotización enviada',
  enviada_parcial: 'Cotización enviada, aún parcial',
  enviada_carrito: 'Enviada; el carrito cambió',
  parcial: 'Cotización parcial',
  carrito: 'Carrito editable',
  expediente: 'Último expediente',
};

export function buildSupervisionModel(input = {}) {
  const contact = input.contact ?? {};
  const appointment = input.appointment ?? null;
  const autopilotOn = input.autopilotOn !== false;
  const leadStatus = String(input.leadStatus ?? 'nuevo');
  const vehicles = (Array.isArray(input.vehicles) ? input.vehicles : [])
    .map((vehicle) => {
      const identity = vehicle?.identity ?? vehicle ?? {};
      const label = vehicleLabel(vehicle);
      if (!label) return null;
      return {
        id: String(identity.vehicleId ?? vehicle.id ?? label),
        label,
        make: String(identity.make ?? '').trim(),
        model: String(identity.model ?? '').trim(),
        year: String(identity.year ?? '').trim(),
        provenance: provenanceOf(identity.source, identity.confirmedByUser),
      };
    })
    .filter(Boolean);

  const declared = vehicles.find((vehicle) => vehicle.provenance === 'declarado');
  const appointmentVehicle = String(appointment?.vehicle ?? '').trim();
  let vehicleDiscrepancy = '';
  if (
    appointment &&
    declared &&
    fold(appointmentVehicle) &&
    fold(appointmentVehicle) !== fold(declared.label)
  ) {
    vehicleDiscrepancy = 'La cita no tiene el mismo vehículo que el cliente declaró.';
  } else if (appointment && declared && !appointmentVehicle) {
    vehicleDiscrepancy = 'El cliente declaró un vehículo y la cita no lo registró.';
  }

  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line, index) => {
    const trace = readPricingTrace(line.pricingTrace);
    const amount = Math.round(Number(line.amount ?? line.precioMx) || 0);
    return {
      id: String(line.id ?? line.quoteLineId ?? index),
      label: String(line.label ?? line.description ?? 'Partida').trim() || 'Partida',
      code: String(trace?.physicalPanelKey || line.code || line.physicalPanelKey || '').trim(),
      amount,
      severity: String(line.severity ?? line.severidad ?? '').trim(),
      treatment: String(line.treatment ?? line.tratamiento ?? '').trim(),
      priceSource: String(trace?.pricingSource || line.priceSource || line.pricingSource || '').trim(),
      pricingStatus: String(trace?.pricingStatus || line.pricingStatus || '').trim(),
      base: trace?.basePriceMx ?? null,
      factors: '',
      trace,
      traceAgrees: !trace || trace.calculatedAmountMx === amount,
    };
  });

  const blocked = [];
  if (input.awaitingVehicle) blocked.push('Falta la identidad del vehículo para cotizar.');
  for (const line of lines) {
    if (line.pricingStatus === 'UNCONFIGURED' || line.priceSource === 'UNCONFIGURED') {
      blocked.push(`${line.label} no tiene tarifa configurada.`);
    }
  }
  if (input.error) blocked.push(String(input.error));

  const presented = quotePresentation(input.quote);
  const evidence = (Array.isArray(input.evidence) ? input.evidence : [])
    .map((item, index) => ({
      id: String(item.id ?? index),
      url: String(item.url ?? '').trim(),
      panel: String(item.panel ?? '').trim(),
      severity: String(item.severity ?? '').trim(),
      treatment: String(item.treatment ?? '').trim(),
    }))
    .filter((item) => item.url);

  let operation = 'Sin una operación registrada en este expediente.';
  if (appointment?.scheduledAt || appointment?.when) {
    operation = 'La última operación registrada es la cita.';
  } else if (presented.kind === 'enviada' || presented.kind === 'enviada_parcial' || presented.kind === 'enviada_carrito') {
    operation = 'La última operación registrada es el envío de la cotización.';
  } else if (presented.kind === 'parcial' || presented.kind === 'carrito' || presented.kind === 'expediente') {
    operation = 'Hay una cotización en el expediente. No consta un envío al cliente.';
  }

  return {
    agent: {
      mode: autopilotOn ? 'Autónomo' : 'Intervención humana',
      autonomous: autopilotOn,
      status: LEAD_LABELS[leadStatus] ?? leadStatus,
      operation,
      blocked,
    },
    client: {
      name: String(contact.name ?? '').trim() || 'Sin nombre',
      channel: String(contact.channel ?? '').trim() || 'Canal no indicado',
      vehicles,
    },
    quote: {
      kind: presented.kind,
      label: QUOTE_KIND_LABEL[presented.kind],
      amountCaption: presented.amountCaption,
      total: presented.total,
      totalLabel: presented.totalLabel,
      liveCaption: presented.liveCaption,
      liveTotalLabel: presented.liveTotalLabel,
      lines,
    },
    evidence,
    appointment: appointment
      ? {
          status: String(appointment.status ?? '').trim() || 'sin estado',
          when: String(appointment.when ?? '').trim(),
          name: String(appointment.clientName ?? '').trim(),
          vehicle: appointmentVehicle || 'Vehículo no indicado',
          phone: String(appointment.phone ?? '').trim(),
          discrepancy: vehicleDiscrepancy,
        }
      : null,
  };
}
