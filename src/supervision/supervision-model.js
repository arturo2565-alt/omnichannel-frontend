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

export function formatSupervisionMoney(amount) {
  const value = Math.round(Number(amount) || 0);
  return value.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
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

  const lines = (Array.isArray(input.lines) ? input.lines : []).map((line, index) => ({
    id: String(line.id ?? line.quoteLineId ?? index),
    label: String(line.label ?? line.description ?? 'Partida').trim() || 'Partida',
    code: String(line.code ?? line.physicalPanelKey ?? '').trim(),
    amount: Math.round(Number(line.amount ?? line.precioMx) || 0),
    severity: String(line.severity ?? line.severidad ?? '').trim(),
    treatment: String(line.treatment ?? line.tratamiento ?? '').trim(),
    priceSource: String(line.priceSource ?? line.pricingSource ?? '').trim(),
    pricingStatus: String(line.pricingStatus ?? '').trim(),
    base: line.base == null || line.base === '' ? null : Math.round(Number(line.base) || 0),
    factors: String(line.factors ?? '').trim(),
  }));

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
