import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, LogOut } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import QuickReplies from './QuickReplies';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { apiFetchWebhook, apiFetchOrigin, markClienteAtendidoRequest } from './apiClient.js';
import {
  PANEL_DAMAGE_MAGNITUDES,
  PANEL_SEVERITY_LABELS,
  coercePanelDamageMagnitude,
  computePanelIntegralPrice,
  computePanelPiecePrice,
  createPanelPricingContext,
} from './panel-quote-pricing.js';
import {
  PANEL_PIEZA_OPTION_GROUPS,
  findPanelPiezaOption,
  getPiezaClienteDisplayName,
  getPiezaMenuLabel,
  getPiezaSelectLabel,
  isInternalDamageRangePieza,
  isRefaccionPieza,
  isIntegralPanelPieza,
  isKnownPanelPiezaCode,
  normalizePiezaCodeForPanel,
  vehicleSizeTierToPanelSizeTierLabel,
} from './panel-pieza-options';

// --- FUNCIONES DE UTILIDAD (Fuera del componente) ---
// Añade soporte para Facebook y mejora la visualización del badge con círculo perfecto y centrado
const classifyPlatform = (raw) => {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  if (
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fb_') ||
    s === 'fb'
  ) {
    return 'facebook';
  }
  return 'other';
};

const PlatformBadge = ({
  platform,
  size = 'md',
  className = '',
}) => {
  const kind = classifyPlatform(platform);
  // Configuramos dimensiones fijas para asegurar círculo perfecto y no deformable
  const dim =
    size === 'sm'
      ? 'w-[18px] h-[18px] text-[11px]'
      : 'w-[24px] h-[24px] text-[13px]';

  // Las siguientes reglas aseguran círculo perfecto, centrado y sin deformaciones:
  // w-[] h-[] rounded-full flex items-center justify-center shrink-0
  const baseBadge =
    `flex items-center justify-center rounded-full font-bold text-white shrink-0 box-border shadow-sm ${dim} ${className}`;

  if (kind === 'whatsapp') {
    return (
      <span
        title="WhatsApp"
        className={`bg-green-500 ${baseBadge}`}
        aria-hidden
      >
        W
      </span>
    );
  }
  if (kind === 'instagram') {
    return (
      <span
        title="Instagram"
        className={`bg-pink-500 ${baseBadge}`}
        aria-hidden
      >
        I
      </span>
    );
  }
  if (kind === 'facebook') {
    return (
      <span
        title="Facebook"
        className={`bg-blue-600 ${baseBadge}`}
        aria-hidden
      >
        {/* Usa la letra F como icono representativo */}
        F
      </span>
    );
  }
  return (
    <span
      title="Canal desconocido"
      className={`bg-gray-500 ${baseBadge}`}
      aria-hidden
    >
      ?
    </span>
  );
};

const isImage = (url) => {
  if (!url) return false;
  // Soporte para URLs reales y para URLs temporales de blob
  return (url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null) || url.includes('images.unsplash.com') || url.startsWith('blob:');
};

const getPreviewText = (content) => {
  if (!content) return 'Sin mensajes aún...';
  if (isImage(content)) return '📷 Imagen';
  return content;
};

/** Alinea con backend `Conversation.status` (compat. `open` legado). */
function normalizeConversationLeadStatus(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (['nuevo', 'por_cotizar', 'cotizado', 'agendado'].includes(s)) return s;
  if (s === 'open' || s === 'closed') return 'nuevo';
  return 'nuevo';
}

const LeadStatusBadge = ({ status }) => {
  const st = normalizeConversationLeadStatus(status);
  const map = {
    por_cotizar: {
      label: 'Por cotizar',
      className: 'bg-red-100 text-red-800 border-red-200',
    },
    cotizado: {
      label: 'Cotizado',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    agendado: {
      label: 'Agendado',
      className: 'bg-green-100 text-green-800 border-green-200',
    },
    nuevo: {
      label: 'Nuevo',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
  };
  const cfg = map[st] ?? map.nuevo;
  return (
    <span
      className={`mt-0.5 inline-flex w-fit max-w-full items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
};

const BPC_SIZE_TIER_OPTIONS = ['Chico', 'Mediano', 'Grande', 'XL'];

/** Parsea `draft.imageUrl` (URL única o JSON array). */
function parseDraftImageUrlField(imageUrl) {
  const s = String(imageUrl ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed)
        ? parsed.map(String).filter((u) => u.trim())
        : [s];
    } catch {
      return [s];
    }
  }
  return [s];
}

function recalcRowPriceFromMatrix(row, pricingCtx) {
  if (isInternalDamageRangePieza(row.pieza) || isRefaccionPieza(row.pieza)) {
    return row;
  }
  if (isIntegralPanelPieza(row.pieza)) {
    const n = computePanelIntegralPrice(row.pieza, row.severidad, pricingCtx);
    if (n <= 0) return row;
    return { ...row, precioInput: String(Math.round(n)) };
  }
  const n = computePanelPiecePrice(row.pieza, row.severidad, pricingCtx);
  if (n <= 0) return row;
  return { ...row, precioInput: String(Math.round(n)) };
}

function parsePrecioMinMaxFromRow(row) {
  const min = parsePrecioInput(
    row.precioMinInput ?? row.precioInput ?? '0',
  );
  const max = parsePrecioInput(
    row.precioMaxInput ?? row.precioMinInput ?? row.precioInput ?? '0',
  );
  const minSafe = Number.isFinite(min) ? Math.max(0, min) : 0;
  let maxSafe = Number.isFinite(max) ? Math.max(0, max) : minSafe;
  if (maxSafe < minSafe) maxSafe = minSafe;
  return { min: minSafe, max: maxSafe };
}

function rowAmountForPanelTotal(row) {
  if (isInternalDamageRangePieza(row.pieza)) {
    return parsePrecioMinMaxFromRow(row).min;
  }
  const n = parsePrecioInput(row.precioInput);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatRefaccionClienteLine(detalle, price) {
  const nombre = String(detalle ?? '').trim() || 'Sin especificar';
  const amount = Number.isFinite(price) ? Math.max(0, Math.round(price)) : 0;
  return `⚙️ Refacción (${nombre}): $${formatMoneyClienteQuoteMxAmount(amount)} MXN`;
}

function parseRefaccionDetalleFromStoredPieza(piezaRaw, descripcionTecnica) {
  const fromDesc = String(descripcionTecnica ?? '').trim();
  if (fromDesc) return fromDesc;
  const p = String(piezaRaw ?? '').trim();
  const m = p.match(/^refacci[oó]n\s*:\s*(.+)$/i);
  if (m) return String(m[1]).trim();
  if (/^refacci[oó]n$/i.test(p)) return '';
  return '';
}

function formatInternalDamageClienteLine(min, max) {
  const { min: a, max: b } = (() => {
    let lo = min;
    let hi = max;
    if (hi < lo) hi = lo;
    return { min: lo, max: hi };
  })();
  return `⚠️ Posibles daños internos: $${formatMoneyClienteQuoteMxAmount(a)} - $${formatMoneyClienteQuoteMxAmount(b)} MXN (Sujeto a desarme)`;
}

function parseInternalDamageMaxFromDescription(text, fallbackMin) {
  const s = String(text ?? '');
  const m = s.match(/\$\s*([\d,.]+)\s*-\s*\$\s*([\d,.]+)/i);
  if (m) {
    const max = Number(String(m[2]).replace(/,/g, ''));
    if (Number.isFinite(max)) return Math.max(0, Math.round(max));
  }
  return fallbackMin;
}

/** Valor inicial de pieza en filas añadidas manualmente hasta elegir una de la matriz. */
const MANUAL_ROW_PLACEHOLDER_PIEZA = 'Seleccionar';

function isPlaceholderPieza(pieza) {
  return String(pieza ?? '')
    .trim()
    .toLowerCase() === MANUAL_ROW_PLACEHOLDER_PIEZA.toLowerCase();
}

/** Alinea texto IA / backend al código del panel (PDI, SI, …) cuando hay match. */
function normalizePiezaForPanel(raw) {
  const t = String(raw ?? '').trim();
  if (!t || isPlaceholderPieza(t)) return MANUAL_ROW_PLACEHOLDER_PIEZA;
  const code = normalizePiezaCodeForPanel(t);
  if (isKnownPanelPiezaCode(code)) return code;
  return t;
}

function normalizePanelSeverityForRow(severidadRaw, pieza) {
  if (isIntegralPanelPieza(pieza)) {
    const raw = String(severidadRaw ?? '').trim();
    if (raw && BPC_SIZE_TIER_OPTIONS.includes(raw)) return raw;
    return vehicleSizeTierToPanelSizeTierLabel(raw) || 'Mediano';
  }
  if (isInternalDamageRangePieza(pieza) || isRefaccionPieza(pieza)) {
    return 'N/A';
  }
  const mag = coercePanelDamageMagnitude(severidadRaw);
  return mag === 'N/A' ? 'LEVE' : mag;
}

function buildQuoteRowFromSource({
  id,
  piezaRaw,
  severidadRaw,
  precio,
  urls,
  lineDescription,
  descripcionTecnica,
}) {
  const pieza = normalizePiezaForPanel(piezaRaw ?? '');
  const code = normalizePanelSeverityForRow(severidadRaw, pieza);
  const base = {
    id,
    pieza,
    urls_origen: urls,
  };
  if (isInternalDamageRangePieza(pieza)) {
    const min = Math.max(0, Math.round(Number(precio) || 0));
    const max = parseInternalDamageMaxFromDescription(
      descripcionTecnica ?? lineDescription,
      min,
    );
    return {
      ...base,
      severidad: 'N/A',
      precioInput: '0',
      precioMinInput: String(min),
      precioMaxInput: String(max),
    };
  }
  if (isRefaccionPieza(pieza)) {
    const detalle = parseRefaccionDetalleFromStoredPieza(
      piezaRaw,
      descripcionTecnica ?? lineDescription,
    );
    return {
      ...base,
      severidad: 'N/A',
      refaccionDetalle: detalle,
      precioInput: String(Math.max(0, Math.round(Number(precio) || 0))),
    };
  }
  if (isIntegralPanelPieza(pieza)) {
    const tier = normalizePanelSeverityForRow(severidadRaw, pieza);
    return {
      ...base,
      severidad: tier,
      precioInput: String(Math.max(0, Math.round(Number(precio) || 0))),
    };
  }
  return {
    ...base,
    severidad: code,
    precioInput: String(Math.round(precio)),
  };
}

function applyPiezaSelectionToRow(row, piezaCode, pricingCtx) {
  if (isInternalDamageRangePieza(piezaCode)) {
    return {
      ...row,
      pieza: piezaCode,
      severidad: 'N/A',
      precioInput: '0',
      precioMinInput: row.precioMinInput ?? '0',
      precioMaxInput: row.precioMaxInput ?? '0',
      refaccionDetalle: undefined,
    };
  }
  if (isRefaccionPieza(piezaCode)) {
    return {
      ...row,
      pieza: piezaCode,
      severidad: 'N/A',
      refaccionDetalle: row.refaccionDetalle ?? '',
      precioInput: row.precioInput ?? '0',
      precioMinInput: undefined,
      precioMaxInput: undefined,
    };
  }
  if (isIntegralPanelPieza(piezaCode)) {
    const next = {
      ...row,
      pieza: piezaCode,
      severidad:
        row.severidad && BPC_SIZE_TIER_OPTIONS.includes(row.severidad)
          ? row.severidad
          : vehicleSizeTierToPanelSizeTierLabel(
              pricingCtx?.vehicleProfile?.sizeTier,
            ) || 'Mediano',
    };
    delete next.precioMinInput;
    delete next.precioMaxInput;
    delete next.refaccionDetalle;
    return recalcRowPriceFromMatrix(next, pricingCtx);
  }
  const next = {
    ...row,
    pieza: piezaCode,
    severidad: coercePanelDamageMagnitude(row.severidad) === 'N/A'
      ? 'LEVE'
      : coercePanelDamageMagnitude(row.severidad),
  };
  delete next.precioMinInput;
  delete next.precioMaxInput;
  delete next.refaccionDetalle;
  return recalcRowPriceFromMatrix(next, pricingCtx);
}

function piezaSelectShowsUnmappedFallback(pieza) {
  const t = String(pieza ?? '').trim();
  if (!t || isPlaceholderPieza(t)) return false;
  return !isKnownPanelPiezaCode(t) && !findPanelPiezaOption(t);
}

/** Compat servidor antiguo: urls_origen primero; luego urls_asociadas */
function urlsFromInventoryItem(it) {
  if (Array.isArray(it?.urls_origen) && it.urls_origen.length > 0) {
    return [...it.urls_origen];
  }
  if (Array.isArray(it?.urls_asociadas) && it.urls_asociadas.length > 0) {
    return [...it.urls_asociadas];
  }
  return [];
}

function parsePrecioInput(raw) {
  const s = String(raw ?? '').trim().replace(/\s/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Mapa oficial del taller (`VITE_WORKSHOP_MAPS_URL` en `.env`). Sin valor → no se muestra enlace. */
const WORKSHOP_MAPS_URL =
  typeof import.meta !== 'undefined' && import.meta.env
    ? String(import.meta.env.VITE_WORKSHOP_MAPS_URL || '').trim()
    : '';

const WORKSHOP_TZ = 'America/Mexico_City';

function formatMoneyClienteQuoteMxAmount(n) {
  const rounded = Math.round(Number(n));
  if (!Number.isFinite(rounded) || rounded < 0) return '0';
  return rounded.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

/** Resumen interno SISTEMA: para resume-after-draft (mismos montos que el panel). */
function buildPanelSystemAuthorizationMessage(quoteRows, draftReference) {
  const lines = (quoteRows ?? [])
    .map((r) => {
      if (isInternalDamageRangePieza(r.pieza)) {
        const { min, max } = parsePrecioMinMaxFromRow(r);
        return formatInternalDamageClienteLine(min, max);
      }
      if (isRefaccionPieza(r.pieza)) {
        return formatRefaccionClienteLine(
          r.refaccionDetalle,
          rowAmountForPanelTotal(r),
        );
      }
      const piezaNombre = getPiezaClienteDisplayName(r.pieza);
      const price = rowAmountForPanelTotal(r);
      return `🛠️ ${piezaNombre}: $${formatMoneyClienteQuoteMxAmount(price)} MXN`;
    })
    .join('\n');
  const total = (quoteRows ?? []).reduce(
    (acc, r) => acc + rowAmountForPanelTotal(r),
    0,
  );
  const refLine = draftReference
    ? `Referencia interna del borrador: ${draftReference}`
    : 'Referencia interna del borrador: (sin código)';
  return [
    'SISTEMA: El agente ha autorizado la siguiente cotización:',
    lines,
    `Total: $${formatMoneyClienteQuoteMxAmount(total)} MXN`,
    refLine,
  ].join('\n');
}

function isClienteFormalNarrative(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  if (
    s.startsWith('Estimado cliente,') &&
    s.includes('PROPUESTA DE COTIZACIÓN')
  ) {
    return false;
  }
  return true;
}

function logPanelClienteMessageDebug(label, payload) {
  if (typeof console === 'undefined') return;
  console.log(`[PanelClienteMsg] ${label}`, payload);
}

function pickBackendClienteNarrative(...candidates) {
  for (const raw of candidates) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    if (isClienteFormalNarrative(t)) return t;
  }
  return '';
}

/** Narrativa al cliente desde borrador/cart/mensaje (todas las fuentes del panel). */
function collectPanelBackendClienteNarrative({
  latestDraftQuote,
  activeDraftForPanel,
  latestQuoteMessage,
  panelDisplayQuote,
}) {
  return pickBackendClienteNarrative(
    ...draftQuoteClienteMessageFields(latestDraftQuote?.quote),
    ...draftQuoteClienteMessageFields(activeDraftForPanel?.quotePayload),
    ...draftQuoteClienteMessageFields(activeDraftForPanel),
    ...draftQuoteClienteMessageFields(latestQuoteMessage?.draftQuote),
    ...draftQuoteClienteMessageFields(latestQuoteMessage?.draftQuote?.quotePayload),
    ...draftQuoteClienteMessageFields(panelDisplayQuote),
  );
}

/** Campos del borrador que pueden traer el mensaje al cliente (BPC y reparaciones comunes). */
function draftQuoteClienteMessageFields(draft) {
  if (!draft || typeof draft !== 'object') return [];
  const qp = draft.quotePayload;
  return [
    draft.generatedMessage,
    draft.clientMessage,
    draft.formalNarrative,
    qp?.generatedMessage,
    qp?.clientMessage,
    qp?.formalNarrative,
  ];
}

function quoteRowsToToolEmojiLines(rows) {
  return (rows ?? [])
    .map((r) => {
      if (isInternalDamageRangePieza(r.pieza)) {
        const { min, max } = parsePrecioMinMaxFromRow(r);
        return formatInternalDamageClienteLine(min, max);
      }
      if (isRefaccionPieza(r.pieza)) {
        return formatRefaccionClienteLine(
          r.refaccionDetalle,
          rowAmountForPanelTotal(r),
        );
      }
      const piezaNombre = getPiezaClienteDisplayName(r.pieza);
      const price = rowAmountForPanelTotal(r);
      const emoji = isIntegralPanelPieza(r.pieza) ? '🎨' : '🛠️';
      return `${emoji} ${piezaNombre}: $${formatMoneyClienteQuoteMxAmount(price)} MXN`;
    })
    .join('\n');
}

function totalFromQuoteRows(rows) {
  return (rows ?? []).reduce((acc, r) => acc + rowAmountForPanelTotal(r), 0);
}

function pickPremiumQuoteVariant(conversationId, variantSalt = '') {
  const id = `${String(conversationId ?? '')}${String(variantSalt ?? '')}`;
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h + id.charCodeAt(i)) % 3;
  }
  return ['A', 'B', 'C'][h];
}

function formatAppointmentCitaWhen(scheduledAtIso) {
  const d = new Date(scheduledAtIso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-MX', {
    timeZone: WORKSHOP_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPreviewNarrativePiecesFromQuoteRows(rows) {
  return (rows ?? []).map((r) => {
    if (isInternalDamageRangePieza(r.pieza)) {
      const { min, max } = parsePrecioMinMaxFromRow(r);
      return {
        pieza: formatInternalDamageClienteLine(min, max),
        severidad: 'N/A',
        precioMx: min,
        precioMaxMx: max,
      };
    }
    if (isRefaccionPieza(r.pieza)) {
      const price = rowAmountForPanelTotal(r);
      const detalle = String(r.refaccionDetalle ?? '').trim();
      return {
        pieza: formatRefaccionClienteLine(detalle, price),
        severidad: 'N/A',
        precioMx: price,
        descripcionTecnica: detalle,
      };
    }
    if (isIntegralPanelPieza(r.pieza)) {
      const price = rowAmountForPanelTotal(r);
      return {
        pieza: getPiezaClienteDisplayName(r.pieza),
        severidad: String(r.severidad ?? 'Mediano'),
        precioMx: price,
      };
    }
    return {
      pieza: getPiezaClienteDisplayName(r.pieza),
      severidad: r.severidad,
      precioMx: parsePrecioInput(r.precioInput),
    };
  });
}

function resolveModeloVehiculoForPreview(quote, damageAnalysis) {
  const q = quote ?? {};
  const d = damageAnalysis ?? {};
  const basis = q.analysisBasis ?? {};
  return (
    String(
      q.modeloVehiculo ??
        q.vehicleModel ??
        d.modeloVehiculo ??
        d.vehicleModel ??
        basis.modeloVehiculo ??
        '',
    ).trim() || ''
  );
}

function quoteRowsValidForNarrativeRegen(rows) {
  const list = rows ?? [];
  if (!list.length) return false;
  for (const r of list) {
    const pieza = String(r.pieza ?? '').trim();
    if (!pieza || isPlaceholderPieza(pieza)) return false;
    if (isInternalDamageRangePieza(pieza)) {
      const { min, max } = parsePrecioMinMaxFromRow(r);
      if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < 0) {
        return false;
      }
      continue;
    }
    if (isRefaccionPieza(pieza)) {
      const n = parsePrecioInput(r.precioInput);
      if (!Number.isFinite(n) || n < 0) return false;
      continue;
    }
    if (isIntegralPanelPieza(pieza)) {
      const n = parsePrecioInput(r.precioInput);
      if (!Number.isFinite(n) || n < 0) return false;
      continue;
    }
    const n = parsePrecioInput(r.precioInput);
    if (!Number.isFinite(n) || n < 0) return false;
  }
  return true;
}

function assembleDynamicClienteQuoteMessage(rows, options = {}) {
  const {
    leadStatus = 'nuevo',
    contactName = 'cliente',
    appointmentWhen = null,
    conversationId = '',
    mapsUrl = WORKSHOP_MAPS_URL,
    variantSalt = '',
  } = options;

  const name = String(contactName ?? '').trim() || 'cliente';
  const list = quoteRowsToToolEmojiLines(rows);
  const totalFmt = formatMoneyClienteQuoteMxAmount(totalFromQuoteRows(rows));
  const isAgendado = normalizeConversationLeadStatus(leadStatus) === 'agendado';
  const mapLink = String(mapsUrl ?? '').trim();

  if (isAgendado) {
    const when =
      String(appointmentWhen ?? '').trim() ||
      'el día acordado para tu visita';
    return [
      `👋 ¡Listo, ${name}! Aquí tienes el desglose del costo extra para tu visita:`,
      '',
      list,
      '',
      `💰 *Inversión Extra Estimada: $${totalFmt} MXN*`,
      '_(Sujeto a revisión física. Incluye materiales premium Sikkens y garantía por escrito.)_',
      '',
      `Anotamos estos conceptos como un **extra en tu orden de servicio**. **Los realizaremos este mismo ${when} que ingresas tu vehículo al taller.**`,
      '',
      '¿Tienes alguna duda con las piezas o prefieres que lo sumemos al presupuesto inicial? 😊✨',
    ].join('\n');
  }

  const variant = pickPremiumQuoteVariant(conversationId, variantSalt);
  const mapBlock = mapLink
    ? [`📍 Estamos aquí, fácil de llegar: ${mapLink}`, '']
    : [];

  if (variant === 'B') {
    return [
      `👋 ¡Perfecto, ${name}! Te comparto la estimación para dejar tu unidad impecable:`,
      '',
      list,
      '',
      `💰 *Inversión Total Estimada: $${totalFmt} MXN*`,
      'Materiales premium **Sikkens**, acabado espejo y **garantía por escrito** *(sujeto a revisión física en planta)*.',
      '',
      ...mapBlock,
      '📅 ¿Qué día de la semana te queda mejor para ingresar tu unidad?',
    ].join('\n');
  }

  if (variant === 'C') {
    return [
      `👋 Con gusto, ${name}, este es el resumen de tu cotización:`,
      '',
      list,
      '',
      `💰 *Inversión estimada: $${totalFmt} MXN*`,
      '_(Sujeto a revisión física. Incluye materiales premium Sikkens, acabado espejo y garantía por escrito.)_',
      '',
      ...mapBlock,
      'Para agendar tu ingreso al taller, dime qué día de la semana te funciona mejor. ✨',
    ].join('\n');
  }

  return [
    `👋 ¡Listo, ${name}! Aquí tienes el desglose de tu cotización:`,
    '',
    list,
    '',
    `💰 *Inversión Total Estimada: $${totalFmt} MXN*`,
    '_(Sujeto a revisión física. Incluye garantía y materiales premium Sikkens.)_',
    '',
    ...mapBlock,
    '📅 Tenemos espacios esta semana. ¿Qué día te queda mejor para ingresar tu unidad?',
  ].join('\n');
}

function ChatView({ 
  contacts, 
  selectedConvId, 
  setSelectedConvId, 
  selectedUserName, 
  messages, 
  reply, 
  setReply, 
  onSendMessage,
  onSendQuoteText,
  onRefresh,
  quickReplySuggestions,
  onGetAiSuggestion, 
  isAiLoading,
  isConnected,

  // --- 🌟 NUEVAS PROPS 🌟 ---
  filePreviewUrl, // URL temporal del blob
  onFileSelect,   // Función handleFileSelect de App.jsx
  onClearFile,    // Función handleClearFile de App.jsx
  isSending,       // Estado de carga del envío
  apiBaseUrl,
  onDraftQuotePatched,
  onDeleteConversation,
  onClienteEsperandoAtendido,
}) {

  const { logout } = useAuth();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); // Referencia al input hidden
  const [platformFilter, setPlatformFilter] = useState('all');
  /** En móvil: lista vs chat a pantalla completa */
  const [showChatWindow, setShowChatWindow] = useState(false);
  /** En móvil: panel de cotización en bottom drawer */
  const [quoteDrawerOpen, setQuoteDrawerOpen] = useState(false);
  /** Visor fullscreen de evidencias: `{ urls, index }` o null */
  const [evidenceLightbox, setEvidenceLightbox] = useState(null);

  const openEvidenceLightbox = useCallback((urls, index = 0) => {
    const list = [...new Set((urls ?? []).map(String).filter(Boolean))];
    if (!list.length) return;
    const safeIndex = Math.min(
      Math.max(0, Number(index) || 0),
      list.length - 1,
    );
    setEvidenceLightbox({ urls: list, index: safeIndex });
  }, []);

  const closeEvidenceLightbox = useCallback(() => {
    setEvidenceLightbox(null);
  }, []);
  const [catalogPieceBases, setCatalogPieceBases] = useState([]);
  const [catalogIntegralBases, setCatalogIntegralBases] = useState([]);
  const [catalogPricingRules, setCatalogPricingRules] = useState(null);

  const filteredContacts = useMemo(() => {
    if (platformFilter === 'all') return contacts;
    return contacts.filter((c) => classifyPlatform(c.platform) === platformFilter);
  }, [contacts, platformFilter]);

  /** Urgencia primero: `por_cotizar`, luego el resto por actividad reciente. */
  const sortedBandejaContacts = useMemo(() => {
    const list = [...filteredContacts];
    list.sort((a, b) => {
      const sa = normalizeConversationLeadStatus(a.status);
      const sb = normalizeConversationLeadStatus(b.status);
      const rank = (x) => (x === 'por_cotizar' ? 0 : 1);
      const d = rank(sa) - rank(sb);
      if (d !== 0) return d;
      const ta = new Date(a.lastMessageAt ?? 0).getTime();
      const tb = new Date(b.lastMessageAt ?? 0).getTime();
      return tb - ta;
    });
    return list;
  }, [filteredContacts]);

  const pendingPorCotizarCount = useMemo(
    () =>
      contacts.filter(
        (c) => normalizeConversationLeadStatus(c.status) === 'por_cotizar',
      ).length,
    [contacts],
  );

  const selectedContact = contacts.find((c) => c.id === selectedConvId);

  const [autoPilotToggleBusy, setAutoPilotToggleBusy] = useState(false);
  const [deleteConversationBusy, setDeleteConversationBusy] = useState(false);
  const [arrivalAlarmBusy, setArrivalAlarmBusy] = useState(false);
  const [arrivalAlarmDismissedLocal, setArrivalAlarmDismissedLocal] =
    useState(false);

  useEffect(() => {
    setArrivalAlarmDismissedLocal(false);
  }, [selectedConvId]);

  const clienteEsperandoAfuera = useMemo(() => {
    if (arrivalAlarmDismissedLocal) return false;
    return Boolean(selectedContact?.clienteEsperandoAfuera);
  }, [
    arrivalAlarmDismissedLocal,
    selectedContact?.clienteEsperandoAfuera,
  ]);

  const handleConfirmarRecepcionCliente = useCallback(async () => {
    if (!selectedConvId || arrivalAlarmBusy || !clienteEsperandoAfuera) return;
    setArrivalAlarmBusy(true);
    try {
      await markClienteAtendidoRequest(selectedConvId);
      setArrivalAlarmDismissedLocal(true);
      onClienteEsperandoAtendido?.(selectedConvId);
      onRefresh?.();
    } catch (e) {
      console.error('marcar-atendido:', e);
      window.alert(
        e?.message ?? 'No se pudo confirmar la recepción del cliente.',
      );
    } finally {
      setArrivalAlarmBusy(false);
    }
  }, [
    selectedConvId,
    arrivalAlarmBusy,
    clienteEsperandoAfuera,
    onClienteEsperandoAtendido,
    onRefresh,
  ]);

  const handleDeleteConversationClick = useCallback(async () => {
    if (!selectedConvId || deleteConversationBusy || !onDeleteConversation) return;
    setDeleteConversationBusy(true);
    try {
      await onDeleteConversation();
    } finally {
      setDeleteConversationBusy(false);
    }
  }, [selectedConvId, deleteConversationBusy, onDeleteConversation]);

  const handleAutoPilotToggle = useCallback(async () => {
    if (!apiBaseUrl || !selectedConvId || autoPilotToggleBusy) return;
    const currentOn = selectedContact?.isAutoPilotActive !== false;
    const next = !currentOn;
    setAutoPilotToggleBusy(true);
    try {
      const res = await apiFetchWebhook(`/conversations/${selectedConvId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAutoPilotActive: next }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      onRefresh?.();
    } catch (e) {
      console.error('Autopilot PATCH:', e);
    } finally {
      setAutoPilotToggleBusy(false);
    }
  }, [
    apiBaseUrl,
    selectedConvId,
    selectedContact?.isAutoPilotActive,
    autoPilotToggleBusy,
    onRefresh,
  ]);

  const [conversationDraftRows, setConversationDraftRows] = useState([]);
  /** Vista agregada del carrito global (aprobado + complemento/pendiente). */
  const [conversationCart, setConversationCart] = useState(null);

  const refreshConversationCart = useCallback(
    async (signal) => {
      if (!selectedConvId || !apiBaseUrl) {
        setConversationCart(null);
        return;
      }
      try {
        const r = await apiFetchWebhook(
          `/conversations/${selectedConvId}/cart`,
          signal ? { signal } : {},
        );
        if (!r.ok) {
          setConversationCart(null);
          return;
        }
        const data = await r.json().catch(() => null);
        setConversationCart(data && typeof data === 'object' ? data : null);
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return;
        setConversationCart(null);
      }
    },
    [selectedConvId, apiBaseUrl],
  );

  const latestDraftQuote = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i]?.draftQuote;
      if (q) {
        const clientNarrative = pickBackendClienteNarrative(
          ...draftQuoteClienteMessageFields(q),
        );
        return {
          messageId: list[i].id,
          quote: {
            ...q,
            formalNarrative: clientNarrative || String(q.formalNarrative ?? '').trim(),
          },
        };
      }
    }
    const draftRow = Array.isArray(conversationDraftRows)
      ? conversationDraftRows[0]
      : null;
    const qp = draftRow?.quotePayload;
    if (qp) {
      const clientNarrative = pickBackendClienteNarrative(
        ...draftQuoteClienteMessageFields(qp),
      );
      return {
        messageId: draftRow.messageId ?? null,
        quote: {
          ...qp,
          formalNarrative: clientNarrative || String(qp.formalNarrative ?? '').trim(),
        },
      };
    }
    return null;
  }, [messages, conversationDraftRows]);

  const latestQuoteMessage = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    return list.find((m) => m.id === latestDraftQuote?.messageId) ?? null;
  }, [messages, latestDraftQuote?.messageId]);
  /** Una fila por daño/pieza: pieza, severidad, precio editable, URLs para mini galería */
  const [quoteRows, setQuoteRows] = useState([]);
  const [quoteFormDirty, setQuoteFormDirty] = useState(false);
  const [clientePreviewLocalFallback, setClientePreviewLocalFallback] =
    useState('');
  const [dirtyPreviewNarrative, setDirtyPreviewNarrative] = useState('');
  const [panelQuoteFrozen, setPanelQuoteFrozen] = useState(null);
  const [isRegeneratingClientePreview, setIsRegeneratingClientePreview] =
    useState(false);
  const clienteNarrativeHydratedRef = useRef('');
  const [quoteSaveError, setQuoteSaveError] = useState('');
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [isSendingFinalQuote, setIsSendingFinalQuote] = useState(false);

  /** Borrador editable del carrito activo (siempre editable, incluso post-envío). */
  const activeDraftForPanel = useMemo(() => {
    const fromCart =
      conversationCart?.activeDraft ?? conversationCart?.pendingDraft;
    if (fromCart?.id) {
      return fromCart;
    }
    if (!Array.isArray(conversationDraftRows) || conversationDraftRows.length === 0) {
      return null;
    }
    const pendingRow = conversationDraftRows.find(
      (r) => String(r.status ?? '').toUpperCase() === 'PENDING_APPROVAL',
    );
    if (pendingRow) return pendingRow;
    if (!latestDraftQuote?.messageId) {
      return null;
    }
    return (
      conversationDraftRows.find(
        (r) =>
          r.messageId === latestDraftQuote.messageId &&
          String(r.status ?? '').toUpperCase() === 'PENDING_APPROVAL',
      ) ?? null
    );
  }, [
    conversationCart?.activeDraft,
    conversationCart?.pendingDraft,
    conversationDraftRows,
    latestDraftQuote?.messageId,
  ]);

  const panelVehicleProfile = useMemo(
    () =>
      activeDraftForPanel?.damageAnalysis?.quoteCartMeta
        ?.vehiclePricingProfile ?? null,
    [activeDraftForPanel?.damageAnalysis?.quoteCartMeta?.vehiclePricingProfile],
  );

  const panelPricingContext = useMemo(
    () =>
      createPanelPricingContext({
        pieceBases: catalogPieceBases,
        integralBases: catalogIntegralBases,
        rules: catalogPricingRules,
        vehicleProfile: panelVehicleProfile,
      }),
    [
      catalogPieceBases,
      catalogIntegralBases,
      catalogPricingRules,
      panelVehicleProfile,
    ],
  );

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await apiFetchOrigin('/catalog/catalog-view', {
          signal: ac.signal,
        });
        if (!r.ok) return;
        const data = await r.json();
        setCatalogPieceBases(
          Array.isArray(data.pieceBases) ? data.pieceBases : [],
        );
        setCatalogIntegralBases(
          Array.isArray(data.integralBases) ? data.integralBases : [],
        );
        setCatalogPricingRules(data.rules ?? null);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          setCatalogPieceBases([]);
          setCatalogIntegralBases([]);
          setCatalogPricingRules(null);
        }
      }
    })();
    return () => ac.abort();
  }, []);

  /** Referencia de cotización aprobada (solo lectura en panel). */
  const approvedDraftReference = useMemo(() => {
    if (
      Array.isArray(conversationCart?.approvedDrafts) &&
      conversationCart.approvedDrafts.length > 0
    ) {
      return conversationCart.approvedDrafts[
        conversationCart.approvedDrafts.length - 1
      ];
    }
    return (
      conversationDraftRows.find(
        (r) => String(r.status ?? '').toUpperCase() === 'APPROVED',
      ) ?? null
    );
  }, [conversationCart?.approvedDrafts, conversationDraftRows]);

  const cartEstado = conversationCart?.estadoCarrito ?? null;
  const isComplementCart = cartEstado === 'complemento_pendiente';
  const isCartModifiedSinceSend =
    cartEstado === 'activo_modificado' ||
    Boolean(conversationCart?.hayCambiosDesdeUltimoEnvio);
  const lastSendSnapshot =
    conversationCart?.lastSendSnapshot ??
    activeDraftForPanel?.quotePayload?.lastSendSnapshot ??
    null;
  const quoteSendCount = Math.max(
    0,
    Number(
      conversationCart?.sendCount ??
        activeDraftForPanel?.quotePayload?.sendCount ??
        0,
    ) || 0,
  );
  const isCartApprovedOnly =
    cartEstado === 'aprobado' && !conversationCart?.pendingDraft?.id;
  const cartTotalGlobal = Math.max(
    0,
    Math.round(Number(conversationCart?.totalGlobal) || 0),
  );
  const cartTotalAprobado = Math.max(
    0,
    Math.round(Number(conversationCart?.totalAprobado) || 0),
  );
  const cartTotalComplemento = Math.max(
    0,
    Math.round(Number(conversationCart?.totalComplemento) || 0),
  );

  const approvedCartDisplayLines = useMemo(() => {
    const drafts = conversationCart?.approvedDrafts;
    if (!Array.isArray(drafts) || !drafts.length) return [];
    const out = [];
    for (const draft of drafts) {
      const items = Array.isArray(draft.items) ? draft.items : [];
      for (const it of items) {
        out.push({
          key: `${draft.id}-${it.id ?? it.pieza}`,
          pieza: getPiezaClienteDisplayName(String(it.pieza ?? '')),
          precioMx: Math.max(0, Math.round(Number(it.precioMx) || 0)),
        });
      }
    }
    return out;
  }, [conversationCart?.approvedDrafts]);

  useEffect(() => {
    setClientePreviewLocalFallback('');
    setDirtyPreviewNarrative('');
    setPanelQuoteFrozen(null);
    clienteNarrativeHydratedRef.current = '';
  }, [selectedConvId]);

  const isPanelReadOnly = Boolean(panelQuoteFrozen) && !quoteFormDirty;

  const panelDisplayQuote =
    panelQuoteFrozen?.quote ??
    latestDraftQuote?.quote ??
    activeDraftForPanel?.quotePayload ??
    approvedDraftReference?.quotePayload;

  const isAwaitingVehicleBanioDraft =
    activeDraftForPanel?.status === 'AWAITING_VEHICLE' ||
    Boolean(
      activeDraftForPanel?.damageAnalysis?.banioPinturaGate?.solicitarModeloBanio,
    );

  const hasPanelQuote =
    !isAwaitingVehicleBanioDraft &&
    Boolean(
      panelQuoteFrozen ||
        isCartApprovedOnly ||
        isComplementCart ||
        (panelDisplayQuote && Number(panelDisplayQuote.total ?? 0) > 0) ||
        cartTotalGlobal > 0,
    );

  const hasPanelPeritajeOnly =
    isAwaitingVehicleBanioDraft &&
    Boolean(activeDraftForPanel?.damageAnalysis);

  const refreshConversationDraftQuotes = useCallback(
    async (signal) => {
      if (!selectedConvId || !apiBaseUrl) {
        setConversationDraftRows([]);
        return;
      }
      try {
        const r = await apiFetchWebhook(
          `/conversations/${selectedConvId}/draft-quotes`,
          signal ? { signal } : {},
        );
        const data = r.ok ? await r.json() : [];
        setConversationDraftRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return;
        setConversationDraftRows([]);
      }
    },
    [selectedConvId, apiBaseUrl],
  );

  const refreshConversationQuoteData = useCallback(
    async (signal) => {
      await Promise.all([
        refreshConversationDraftQuotes(signal),
        refreshConversationCart(signal),
      ]);
    },
    [refreshConversationDraftQuotes, refreshConversationCart],
  );

  const banioGateRefreshKey = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    return list
      .map((m) => m.damageAnalysis?.banioPinturaGate?.guardadoEn ?? '')
      .filter(Boolean)
      .join('|');
  }, [messages]);

  useEffect(() => {
    if (!selectedConvId || !apiBaseUrl) {
      setConversationDraftRows([]);
      return;
    }
    const ac = new AbortController();
    void refreshConversationQuoteData(ac.signal);
    return () => ac.abort();
  }, [
    selectedConvId,
    apiBaseUrl,
    latestDraftQuote?.messageId,
    latestDraftQuote?.quote?.total,
    latestDraftQuote?.quote?.subtotal,
    banioGateRefreshKey,
    refreshConversationQuoteData,
  ]);

  const quoteSyncKey = useMemo(() => {
    if (!latestDraftQuote?.quote) return '';
    const q = latestDraftQuote.quote;
    const basis = q.analysisBasis ?? {};
    const inv =
      Array.isArray(basis.inventory) && basis.inventory.length > 0
        ? basis.inventory
        : Array.isArray(latestQuoteMessage?.damageAnalysis?.inventory) &&
            latestQuoteMessage.damageAnalysis.inventory.length > 0
          ? latestQuoteMessage.damageAnalysis.inventory
          : null;
    const invKey = inv?.map((x) => `${x.pieza}:${x.severidad}`).join('|') ?? '';
    const linesKey = JSON.stringify(
      (q.lines ?? []).map((l) => Number(l.subtotal ?? 0)),
    );
    const bkItems = activeDraftForPanel?.items;
    const itemsKey =
      Array.isArray(bkItems) && bkItems.length > 0
        ? [...bkItems]
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(
              (it) =>
                `${it.id ?? ''}:${it.pieza}:${it.severidad}:${it.precioMx}`,
            )
            .join('|')
        : '';
    return `${latestDraftQuote.messageId}|${q.total}|${invKey}|${linesKey}|bk:${itemsKey}|dk:${activeDraftForPanel?.id ?? ''}`;
  }, [latestDraftQuote, latestQuoteMessage, activeDraftForPanel]);

  useEffect(() => {
    if (panelQuoteFrozen) return;
    if (activeDraftForPanel?.status !== 'AWAITING_VEHICLE') return;
    const gate = activeDraftForPanel.damageAnalysis?.banioPinturaGate;
    const inv =
      (Array.isArray(gate?.inventarioVisual) && gate.inventarioVisual.length > 0
        ? gate.inventarioVisual
        : null) ??
      (Array.isArray(activeDraftForPanel.damageAnalysis?.inventory) &&
      activeDraftForPanel.damageAnalysis.inventory.length > 0
        ? activeDraftForPanel.damageAnalysis.inventory
        : null);
    if (!inv?.length) return;
    const msgImg =
      latestQuoteMessage?.content && isImage(latestQuoteMessage.content)
        ? [latestQuoteMessage.content]
        : [];
    const rows = inv.map((it, idx) => {
      const rawSev = String(it.severidad ?? 'LEVE');
      let urls = urlsFromInventoryItem(it);
      if (!urls.length && idx === 0 && msgImg.length) urls = [...msgImg];
      return buildQuoteRowFromSource({
        id: `row-await-${idx}-${String(it.pieza).slice(0, 24)}`,
        piezaRaw: it.pieza,
        severidadRaw: rawSev,
        precio: 0,
        urls,
        descripcionTecnica: it.descripcionTecnica,
      });
    });
    setQuoteRows(rows);
    setQuoteFormDirty(false);
    setQuoteSaveError('');
  }, [
    activeDraftForPanel?.id,
    activeDraftForPanel?.status,
    activeDraftForPanel?.damageAnalysis,
    latestQuoteMessage?.content,
    panelQuoteFrozen,
  ]);

  useEffect(() => {
    if (panelQuoteFrozen) return;
    if (!latestDraftQuote?.quote) return;
    const q = latestDraftQuote.quote;
    const basis = q.analysisBasis ?? {};
    const damage = latestQuoteMessage?.damageAnalysis ?? {};
    const inv =
      Array.isArray(basis.inventory) && basis.inventory.length > 0
        ? basis.inventory
        : Array.isArray(damage.inventory) && damage.inventory.length > 0
          ? damage.inventory
          : null;

    const msgImg =
      latestQuoteMessage?.content && isImage(latestQuoteMessage.content)
        ? [latestQuoteMessage.content]
        : [];

    const lines = q.lines ?? [];
    const backendItems = activeDraftForPanel?.items;

    /** Prioridad 1: filas relacionales del backend (`DraftQuoteItem`). */
    if (Array.isArray(backendItems) && backendItems.length > 0) {
      const sorted = [...backendItems].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      const rows = sorted.map((it, idx) => {
        const rawSev = String(it.severidad ?? 'LEVE');
        let precio = Number(it.precioMx ?? 0);
        const lineAt = lines[idx];
        if (
          lineAt &&
          Number.isFinite(Number(lineAt.subtotal)) &&
          sorted.length === lines.length
        ) {
          precio = Number(lineAt.subtotal);
        }
        const urlsRaw = Array.isArray(it.urlsOrigen) ? it.urlsOrigen : [];
        let urls = urlsRaw.map(String).filter(Boolean);
        if (!urls.length && idx === 0 && msgImg.length) urls = [...msgImg];
        return buildQuoteRowFromSource({
          id: it.id
            ? String(it.id)
            : `row-be-${idx}-${String(it.pieza).slice(0, 20)}`,
          piezaRaw: it.pieza,
          severidadRaw: rawSev,
          precio,
          urls,
          lineDescription: lineAt?.description,
          descripcionTecnica: it.descripcionTecnica,
        });
      });
      setQuoteRows(rows);
    } else if (inv?.length) {
      const rows = inv.map((it, idx) => {
        const rawSev = String(it.severidad ?? 'LEVE');
        let precio = 0;
        const lineAt = lines[idx];
        if (
          lineAt &&
          Number.isFinite(Number(lineAt.subtotal)) &&
          inv.length === lines.length
        ) {
          precio = Number(lineAt.subtotal);
        }
        let urls = urlsFromInventoryItem(it);
        if (!urls.length && idx === 0 && msgImg.length) urls = [...msgImg];
        return buildQuoteRowFromSource({
          id: `row-${idx}-${String(it.pieza).slice(0, 24)}`,
          piezaRaw: it.pieza,
          severidadRaw: rawSev,
          precio,
          urls,
        });
      });
      setQuoteRows(rows);
    } else {
      const rawSev = String(basis.severidad ?? 'LEVE');
      const code = normalizePanelSeverityForRow(
        rawSev,
        normalizePiezaForPanel(basis.pieza ?? ''),
      );
      setQuoteRows([
        {
          id: 'row-0-single',
          pieza: normalizePiezaForPanel(basis.pieza ?? ''),
          severidad: code,
          precioInput: String(
            Math.round(Number(q.total ?? q.subtotal ?? 0)),
          ),
          urls_origen: msgImg,
        },
      ]);
    }
    logPanelClienteMessageDebug('filas sincronizadas desde borrador', {
      hasBackendItems: Array.isArray(backendItems) && backendItems.length > 0,
      invCount: inv?.length ?? 0,
      lineCount: lines.length,
      analysisPieza: basis.pieza ?? damage.pieza ?? '',
      formalNarrativePreview: String(q.formalNarrative ?? '').slice(0, 100),
      isLegalDoc: String(q.formalNarrative ?? '').includes('PROPUESTA DE COTIZACIÓN'),
    });
    const syncedNarrative = collectPanelBackendClienteNarrative({
      latestDraftQuote: { quote: q },
      activeDraftForPanel,
      latestQuoteMessage,
      panelDisplayQuote: q,
    });
    if (syncedNarrative) {
      setClientePreviewLocalFallback(syncedNarrative);
      setDirtyPreviewNarrative('');
      setIsRegeneratingClientePreview(false);
    }
    setQuoteFormDirty(false);
    setQuoteSaveError('');
  }, [quoteSyncKey, panelQuoteFrozen, activeDraftForPanel, latestQuoteMessage]);

  const quoteRowsEditKey = useMemo(
    () =>
      quoteRows
        .map((r) => `${r.id}:${r.pieza}:${r.severidad}:${r.precioInput}`)
        .join('|'),
    [quoteRows],
  );

  const panelRowsForDisplay =
    isPanelReadOnly && panelQuoteFrozen?.quoteRows?.length
      ? panelQuoteFrozen.quoteRows
      : quoteRows;

  const granTotalPanel = useMemo(
    () => panelRowsForDisplay.reduce((acc, r) => acc + rowAmountForPanelTotal(r), 0),
    [panelRowsForDisplay],
  );

  const granTotalDisplay = useMemo(() => {
    if (cartTotalGlobal > 0 && !quoteFormDirty) return cartTotalGlobal;
    return granTotalPanel;
  }, [cartTotalGlobal, granTotalPanel, quoteFormDirty]);

  const panelHasInternalDamageRange = useMemo(
    () => panelRowsForDisplay.some((r) => isInternalDamageRangePieza(r.pieza)),
    [panelRowsForDisplay],
  );

  const panelConceptLinesFromRows = useMemo(
    () =>
      panelRowsForDisplay.map((r) => {
        if (isInternalDamageRangePieza(r.pieza)) {
          const { min, max } = parsePrecioMinMaxFromRow(r);
          return {
            key: r.id,
            description: '⚠️ Posibles daños internos',
            amountLabel: `$${formatMoneyClienteQuoteMxAmount(min)} – $${formatMoneyClienteQuoteMxAmount(max)} MXN`,
            subtotalForSum: min,
            isRange: true,
          };
        }
        if (isRefaccionPieza(r.pieza)) {
          const sub = rowAmountForPanelTotal(r);
          const detalle = String(r.refaccionDetalle ?? '').trim();
          return {
            key: r.id,
            description: detalle
              ? `⚙️ Refacción (${detalle})`
              : '⚙️ Refacción',
            amountLabel: sub.toLocaleString('es-MX', {
              style: 'currency',
              currency: 'MXN',
              maximumFractionDigits: 0,
            }),
            subtotalForSum: sub,
            isRange: false,
          };
        }
        if (isIntegralPanelPieza(r.pieza)) {
          const sub = rowAmountForPanelTotal(r);
          const tier = String(r.severidad ?? '').trim();
          return {
            key: r.id,
            description: tier
              ? `🎨 ${getPiezaClienteDisplayName(r.pieza)} (${tier})`
              : `🎨 ${getPiezaClienteDisplayName(r.pieza)}`,
            amountLabel: sub.toLocaleString('es-MX', {
              style: 'currency',
              currency: 'MXN',
              maximumFractionDigits: 0,
            }),
            subtotalForSum: sub,
            isRange: false,
          };
        }
        const sub = rowAmountForPanelTotal(r);
        return {
          key: r.id,
          description: getPiezaClienteDisplayName(r.pieza),
          amountLabel: sub.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            maximumFractionDigits: 0,
          }),
          subtotalForSum: sub,
          isRange: false,
        };
      }),
    [panelRowsForDisplay],
  );

  /** Miniaturas de evidencia para carrusel del panel (filas + borrador + mensajes). */
  const quoteEvidenceImageUrls = useMemo(() => {
    const urls = new Set();
    for (const r of panelRowsForDisplay) {
      for (const u of r.urls_origen ?? []) {
        const s = String(u ?? '').trim();
        if (s && isImage(s)) urls.add(s);
      }
    }
    for (const u of parseDraftImageUrlField(activeDraftForPanel?.imageUrl)) {
      if (isImage(u)) urls.add(u);
    }
    const msgContent = String(latestQuoteMessage?.content ?? '').trim();
    if (msgContent && isImage(msgContent)) urls.add(msgContent);
    for (const m of messages ?? []) {
      const c = String(m?.content ?? '').trim();
      if (c && isImage(c)) urls.add(c);
    }
    return [...urls];
  }, [
    panelRowsForDisplay,
    activeDraftForPanel?.imageUrl,
    latestQuoteMessage?.content,
    messages,
  ]);

  const leadStatusForQuote = normalizeConversationLeadStatus(
    selectedContact?.status,
  );

  const [conversationAppointmentWhen, setConversationAppointmentWhen] =
    useState(null);

  useEffect(() => {
    if (
      !selectedConvId ||
      !apiBaseUrl ||
      leadStatusForQuote !== 'agendado'
    ) {
      setConversationAppointmentWhen(null);
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const r = await apiFetchWebhook('/appointments', {
          signal: ac.signal,
        });
        const data = r.ok ? await r.json() : [];
        const list = Array.isArray(data) ? data : [];
        const active = list
          .filter(
            (a) =>
              a?.conversationId === selectedConvId &&
              ['confirmada', 'pendiente'].includes(
                String(a?.status ?? '').toLowerCase(),
              ) &&
              a?.scheduledAt,
          )
          .sort(
            (a, b) =>
              new Date(b.scheduledAt).getTime() -
              new Date(a.scheduledAt).getTime(),
          )[0];
        const when = active?.scheduledAt
          ? formatAppointmentCitaWhen(active.scheduledAt)
          : null;
        setConversationAppointmentWhen(when);
      } catch (e) {
        if (e?.name !== 'AbortError') {
          setConversationAppointmentWhen(null);
        }
      }
    })();
    return () => ac.abort();
  }, [selectedConvId, apiBaseUrl, leadStatusForQuote]);

  const panelBackendClienteNarrative = useMemo(
    () =>
      collectPanelBackendClienteNarrative({
        latestDraftQuote,
        activeDraftForPanel,
        latestQuoteMessage,
        panelDisplayQuote,
      }),
    [
      latestDraftQuote?.quote,
      activeDraftForPanel?.quotePayload,
      activeDraftForPanel?.id,
      latestQuoteMessage?.draftQuote,
      panelDisplayQuote,
    ],
  );

  const mensajeClientePreview = useMemo(() => {
    if (panelQuoteFrozen?.mensajeCliente?.trim()) {
      return panelQuoteFrozen.mensajeCliente.trim();
    }

    const dirty = String(dirtyPreviewNarrative ?? '').trim();
    if (quoteFormDirty && dirty) {
      return dirty;
    }

    if (panelBackendClienteNarrative) {
      return panelBackendClienteNarrative;
    }

    const fallbackTrim = String(clientePreviewLocalFallback ?? '').trim();
    if (fallbackTrim.length > 0) {
      return fallbackTrim;
    }

    if (quoteFormDirty) {
      if (isRegeneratingClientePreview) {
        return 'Generando mensaje al cliente con IA…';
      }
      return 'Preparando vista previa con IA…';
    }

    const rowsForPreview =
      panelQuoteFrozen?.quoteRows?.length
        ? panelQuoteFrozen.quoteRows
        : quoteRows;
    if (quoteRowsValidForNarrativeRegen(rowsForPreview)) {
      const assembled = assembleDynamicClienteQuoteMessage(rowsForPreview, {
        leadStatus: leadStatusForQuote,
        contactName: selectedContact?.contactName ?? 'cliente',
        appointmentWhen: conversationAppointmentWhen,
        conversationId: selectedConvId ?? '',
        mapsUrl: WORKSHOP_MAPS_URL,
      });
      if (assembled?.trim()) {
        return assembled.trim();
      }
    }

    if (hasPanelQuote && granTotalPanel > 0 && rowsForPreview.length > 0) {
      const linesOnly = quoteRowsToToolEmojiLines(rowsForPreview);
      const totalFmt = formatMoneyClienteQuoteMxAmount(
        totalFromQuoteRows(rowsForPreview),
      );
      if (linesOnly.trim()) {
        return [
          `👋 Estimado cliente, aquí tienes el desglose de tu cotización:`,
          '',
          linesOnly,
          '',
          `💰 *Inversión Total Estimada: $${totalFmt} MXN*`,
        ].join('\n');
      }
    }

    return 'Añade servicios al borrador para ver el mensaje al cliente.';
  }, [
    panelQuoteFrozen,
    quoteFormDirty,
    dirtyPreviewNarrative,
    isRegeneratingClientePreview,
    clientePreviewLocalFallback,
    panelBackendClienteNarrative,
    quoteRows,
    hasPanelQuote,
    granTotalPanel,
    leadStatusForQuote,
    selectedContact?.contactName,
    conversationAppointmentWhen,
    selectedConvId,
  ]);

  const previewNarrativeFromQuoteRows = useCallback(
    async (rows) => {
      if (!apiBaseUrl) return null;
      if (!quoteRowsValidForNarrativeRegen(rows)) {
        logPanelClienteMessageDebug('preview omitido: filas inválidas', {
          rowCount: rows?.length ?? 0,
          piezas: (rows ?? []).map((r) => r.pieza),
        });
        return null;
      }

      const started = Date.now();
      logPanelClienteMessageDebug('preview-narrative inicio', {
        conversationId: selectedConvId,
        rowCount: rows.length,
        piezas: rows.map((r) => r.pieza),
      });

      setIsRegeneratingClientePreview(true);
      try {
        const res = await apiFetchWebhook('/draft-quote/preview-narrative', {
          method: 'POST',
          body: JSON.stringify({
            pieces: buildPreviewNarrativePiecesFromQuoteRows(rows),
            modeloVehiculo: resolveModeloVehiculoForPreview(
              panelDisplayQuote ?? latestDraftQuote?.quote,
              latestQuoteMessage?.damageAnalysis,
            ),
            conversationStatus: leadStatusForQuote,
            contactName: selectedContact?.contactName ?? '',
            conversationId: selectedConvId ?? '',
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        const rawNarrative = String(data?.narrative ?? '').trim();
        const narrative =
          pickBackendClienteNarrative(
            rawNarrative,
            data?.generatedMessage,
            data?.clientMessage,
            data?.quotePayload?.generatedMessage,
            data?.quotePayload?.clientMessage,
            data?.quotePayload?.formalNarrative,
          ) || rawNarrative;
        logPanelClienteMessageDebug('preview-narrative respuesta', {
          ms: Date.now() - started,
          ok: Boolean(narrative),
          rawChars: rawNarrative.length,
          narrativeChars: narrative?.length ?? 0,
        });
        if (narrative) {
          setDirtyPreviewNarrative(narrative);
          setClientePreviewLocalFallback('');
        } else {
          const assembled = assembleDynamicClienteQuoteMessage(rows, {
            leadStatus: leadStatusForQuote,
            contactName: selectedContact?.contactName ?? 'cliente',
            appointmentWhen: conversationAppointmentWhen,
            conversationId: selectedConvId ?? '',
            mapsUrl: WORKSHOP_MAPS_URL,
          });
          if (assembled?.trim()) {
            logPanelClienteMessageDebug('preview fallback local armado', {
              chars: assembled.length,
            });
            setDirtyPreviewNarrative(assembled.trim());
          }
        }
        setQuoteSaveError('');
        return narrative;
      } catch (e) {
        logPanelClienteMessageDebug('preview-narrative error', {
          ms: Date.now() - started,
          message: e?.message ?? String(e),
        });
        const assembled = assembleDynamicClienteQuoteMessage(rows, {
          leadStatus: leadStatusForQuote,
          contactName: selectedContact?.contactName ?? 'cliente',
          appointmentWhen: conversationAppointmentWhen,
          conversationId: selectedConvId ?? '',
          mapsUrl: WORKSHOP_MAPS_URL,
        });
        if (assembled?.trim()) {
          setDirtyPreviewNarrative(assembled.trim());
        }
        setQuoteSaveError(
          e?.message || 'No se pudo actualizar la vista previa con IA.',
        );
        return null;
      } finally {
        setIsRegeneratingClientePreview(false);
      }
    },
    [
      apiBaseUrl,
      panelDisplayQuote,
      latestDraftQuote?.quote,
      latestQuoteMessage?.damageAnalysis,
      leadStatusForQuote,
      selectedContact?.contactName,
      selectedConvId,
      conversationAppointmentWhen,
    ],
  );

  useEffect(() => {
    const backendNarrative = panelBackendClienteNarrative;
    let branch = 'default';
    if (panelQuoteFrozen?.mensajeCliente?.trim()) branch = 'frozen';
    else if (quoteFormDirty && dirtyPreviewNarrative?.trim()) branch = 'dirtyPreview';
    else if (backendNarrative) branch = 'backend';
    else if (quoteFormDirty && isRegeneratingClientePreview) branch = 'generating';
    else if (quoteFormDirty) branch = 'dirtyWaitingPreview';
    else if (clientePreviewLocalFallback?.trim()) branch = 'localFallback';
    else branch = 'assembledOrEmpty';

    logPanelClienteMessageDebug('estado mensaje al cliente', {
      branch,
      quoteFormDirty,
      isRegeneratingClientePreview,
      rowCount: quoteRows.length,
      piezas: quoteRows.map((r) => r.pieza),
      backendNarrativeChars: backendNarrative.length,
      dirtyPreviewChars: String(dirtyPreviewNarrative ?? '').length,
      draftId: activeDraftForPanel?.id ?? null,
    });

    if (!backendNarrative) return;
    const hydrateKey = `${activeDraftForPanel?.id ?? ''}:${backendNarrative.length}:${backendNarrative.slice(0, 48)}`;
    if (clienteNarrativeHydratedRef.current === hydrateKey) return;
    clienteNarrativeHydratedRef.current = hydrateKey;
    setIsRegeneratingClientePreview(false);
    if (!String(dirtyPreviewNarrative ?? '').trim()) {
      setClientePreviewLocalFallback(backendNarrative);
    }
  }, [
    panelBackendClienteNarrative,
    panelQuoteFrozen,
    quoteFormDirty,
    dirtyPreviewNarrative,
    isRegeneratingClientePreview,
    clientePreviewLocalFallback,
    activeDraftForPanel?.id,
    quoteRows,
  ]);

  useEffect(() => {
    if (!quoteFormDirty || isPanelReadOnly) return;
    if (!quoteRowsValidForNarrativeRegen(quoteRows)) return;
    const t = setTimeout(() => {
      void previewNarrativeFromQuoteRows(quoteRows);
    }, 750);
    return () => clearTimeout(t);
  }, [
    quoteRowsEditKey,
    quoteFormDirty,
    isPanelReadOnly,
    previewNarrativeFromQuoteRows,
    quoteRows,
  ]);

  const handleRegenerateClientePreview = useCallback(async () => {
    if (!apiBaseUrl || quoteRows.length === 0) {
      return;
    }
    if (activeDraftForPanel?.id) {
      setIsRegeneratingClientePreview(true);
      try {
        const res = await apiFetchWebhook(
          `/draft-quote/${activeDraftForPanel.id}/regenerate-narrative`,
          { method: 'POST' },
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const rawNarrative = String(
            data?.narrative ??
              data?.clientMessage ??
              data?.generatedMessage ??
              '',
          ).trim();
          const freshNarrative =
            pickBackendClienteNarrative(
              rawNarrative,
              data?.clientMessage,
              data?.generatedMessage,
              data?.narrative,
              ...draftQuoteClienteMessageFields(data?.quotePayload),
            ) || rawNarrative;
          if (freshNarrative) {
            setClientePreviewLocalFallback(freshNarrative);
            setDirtyPreviewNarrative('');
            setQuoteFormDirty(false);
          }
          const msgId = data?.messageId ?? latestDraftQuote?.messageId ?? null;
          if (data?.quotePayload && msgId) {
            onDraftQuotePatched?.({
              messageId: msgId,
              draftQuote: data.quotePayload,
            });
          }
          await refreshConversationQuoteData();
          setQuoteSaveError('');
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (e) {
        if (quoteFormDirty) {
          await previewNarrativeFromQuoteRows(quoteRows);
        } else {
          setQuoteSaveError(
            e?.message || 'No se pudo regenerar la redacción con IA.',
          );
        }
      } finally {
        setIsRegeneratingClientePreview(false);
      }
      return;
    }
    if (quoteFormDirty) {
      await previewNarrativeFromQuoteRows(quoteRows);
    }
  }, [
    apiBaseUrl,
    activeDraftForPanel?.id,
    quoteRows,
    quoteFormDirty,
    previewNarrativeFromQuoteRows,
    latestDraftQuote?.messageId,
    onDraftQuotePatched,
    refreshConversationQuoteData,
  ]);

  const freezePanelQuoteSnapshot = useCallback(
    (mensajeCliente, quotePayload) => {
      if (!quotePayload) return;
      setPanelQuoteFrozen({
        quote: quotePayload,
        quoteRows: quoteRows.map((r) => ({ ...r })),
        mensajeCliente: String(mensajeCliente ?? '').trim(),
      });
    },
    [quoteRows],
  );

  const persistDraftQuotePatch = useCallback(async () => {
    if (!apiBaseUrl || !selectedConvId) {
      const msg =
        'Aún no se puede guardar: espera a cargar la conversación o recarga.';
      setQuoteSaveError(msg);
      throw new Error(msg);
    }
    if (quoteRows.length === 0) {
      setQuoteSaveError('Añade al menos un servicio a la cotización.');
      throw new Error('bad pieza');
    }
    const linesPayload = quoteRows.map((r) => {
      if (isInternalDamageRangePieza(r.pieza)) {
        const { min, max } = parsePrecioMinMaxFromRow(r);
        return {
          pieza: 'Posibles daños internos',
          severidad: 'N/A',
          precioMx: min,
          precioMaximo: max,
          precioMaxMx: max,
          descripcionTecnica: `Rango estimado $${formatMoneyClienteQuoteMxAmount(min)} - $${formatMoneyClienteQuoteMxAmount(max)} MXN (sujeto a desarme)`,
          urls_origen: r.urls_origen ?? [],
        };
      }
      if (isRefaccionPieza(r.pieza)) {
        const detalle = String(r.refaccionDetalle ?? '').trim();
        const price = rowAmountForPanelTotal(r);
        return {
          pieza: detalle ? `Refacción: ${detalle}` : 'Refacción',
          severidad: 'N/A',
          precioMx: price,
          detallesRefaccion: detalle || undefined,
          descripcionTecnica: detalle || 'Refacción manual desde panel',
          urls_origen: r.urls_origen ?? [],
        };
      }
      return {
        pieza: getPiezaClienteDisplayName(r.pieza),
        severidad: r.severidad,
        precioMx: parsePrecioInput(r.precioInput),
        urls_origen: r.urls_origen ?? [],
      };
    });
    for (let i = 0; i < linesPayload.length; i++) {
      const L = linesPayload[i];
      if (!L.pieza) {
        setQuoteSaveError(`El servicio no puede estar vacío (fila ${i + 1}).`);
        throw new Error('bad pieza');
      }
      if (isPlaceholderPieza(L.pieza)) {
        setQuoteSaveError(
          `Elige un servicio de la lista en la fila ${i + 1} (sustituir "${MANUAL_ROW_PLACEHOLDER_PIEZA}").`,
        );
        throw new Error('bad pieza');
      }
      if (isInternalDamageRangePieza(L.pieza)) {
        const min = Number(L.precioMx);
        const max = Number(L.precioMaxMx ?? L.precioMx);
        if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < 0) {
          setQuoteSaveError(
            `Rango inválido en fila ${i + 1} (mínimo y máximo ≥ 0).`,
          );
          throw new Error('bad price');
        }
        continue;
      }
      if (/^refacci[oó]n/i.test(String(L.pieza ?? ''))) {
        if (!Number.isFinite(L.precioMx) || L.precioMx < 0) {
          setQuoteSaveError(`Precio inválido en refacción (fila ${i + 1}).`);
          throw new Error('bad price');
        }
        continue;
      }
      if (!Number.isFinite(L.precioMx) || L.precioMx < 0) {
        setQuoteSaveError(`Precio inválido en fila ${i + 1} (número ≥ 0).`);
        throw new Error('bad price');
      }
    }
    setQuoteSaveError('');
    const res = await apiFetchWebhook(
      `/conversations/${selectedConvId}/cart`,
      {
        method: 'PATCH',
        body: JSON.stringify({ inventoryLines: linesPayload }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `HTTP ${res.status}`);
    }
    const entity = await res.json();
    onDraftQuotePatched?.({
      messageId: entity.messageId,
      draftQuote: entity.quotePayload,
      damageAnalysis: entity.damageAnalysis,
    });
    await refreshConversationQuoteData();
    setQuoteFormDirty(false);
    setClientePreviewLocalFallback('');
    setDirtyPreviewNarrative('');
    const savedNarrative = pickBackendClienteNarrative(
      ...draftQuoteClienteMessageFields(entity.quotePayload),
    );
    freezePanelQuoteSnapshot(savedNarrative, entity.quotePayload);
    return entity;
  }, [
    apiBaseUrl,
    activeDraftForPanel?.id,
    quoteRows,
    onDraftQuotePatched,
    selectedConvId,
    refreshConversationQuoteData,
    freezePanelQuoteSnapshot,
  ]);

  const handleGuardarCambios = async () => {
    setIsSavingQuote(true);
    setQuoteSaveError('');
    try {
      await persistDraftQuotePatch();
    } catch (e) {
      if (e.message !== 'bad price' && e.message !== 'bad pieza') {
        setQuoteSaveError(e.message || 'Error al guardar');
      }
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleEnviarCotizacionFinal = async () => {
    setIsSendingFinalQuote(true);
    setQuoteSaveError('');
    try {
      await persistDraftQuotePatch();
      if (!apiBaseUrl || !selectedConvId) {
        throw new Error('Sin conversación activa para activar autopilot');
      }
      const autopilotRes = await apiFetchWebhook(
        `/conversations/${selectedConvId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isAutoPilotActive: true }),
        },
      );
      if (!autopilotRes.ok) {
        const t = await autopilotRes.text().catch(() => '');
        throw new Error(
          t ||
            `No se pudo activar el autopilot (HTTP ${autopilotRes.status}). La IA no podrá responder solicitudes de cita.`,
        );
      }

      const draftRef =
        activeDraftForPanel?.quotePayload?.reference ??
        latestDraftQuote?.quote?.reference ??
        '';
      const authorizedQuoteSummary = buildPanelSystemAuthorizationMessage(
        quoteRows,
        draftRef,
      );

      freezePanelQuoteSnapshot(
        mensajeClientePreview,
        activeDraftForPanel?.quotePayload ?? latestDraftQuote?.quote,
      );

      let mensajeCliente = mensajeClientePreview;
      const resumeRes = await apiFetchWebhook(
        `/conversations/${selectedConvId}/resume-after-draft`,
        {
          method: 'POST',
          body: JSON.stringify({ authorizedQuoteSummary }),
        },
      );
      if (resumeRes.ok) {
        await resumeRes.json().catch(() => ({}));
      }

      onRefresh?.();
      await onSendQuoteText?.(mensajeCliente, {
        conversationLeadStatus: 'cotizado',
      });
    } catch (e) {
      if (e.message !== 'bad price' && e.message !== 'bad pieza') {
        setQuoteSaveError(e.message || 'Error al enviar la cotización');
      }
    } finally {
      setIsSendingFinalQuote(false);
    }
  };

  const handleAddManualPiezaRow = useCallback(() => {
    setQuoteRows((prev) => [
      ...prev,
      {
        id: `row-manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        pieza: MANUAL_ROW_PLACEHOLDER_PIEZA,
        severidad: 'LEVE',
        precioInput: '0',
        urls_origen: [],
      },
    ]);
    setQuoteFormDirty(true);
  }, []);

  const handleRemoveQuoteRow = useCallback((rowId) => {
    setQuoteRows((prev) => prev.filter((r) => r.id !== rowId));
    setQuoteFormDirty(true);
  }, []);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!selectedConvId || platformFilter === 'all') return;
    const visible = sortedBandejaContacts.some((c) => c.id === selectedConvId);
    if (!visible) setSelectedConvId(null);
  }, [sortedBandejaContacts, platformFilter, selectedConvId, setSelectedConvId]);

  useEffect(() => {
    setQuoteDrawerOpen(false);
    closeEvidenceLightbox();
  }, [selectedConvId, closeEvidenceLightbox]);

  useEffect(() => {
    if (!quoteDrawerOpen) closeEvidenceLightbox();
  }, [quoteDrawerOpen, closeEvidenceLightbox]);

  useEffect(() => {
    if (!quoteDrawerOpen && !evidenceLightbox) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [quoteDrawerOpen, evidenceLightbox]);

  useEffect(() => {
    if (!evidenceLightbox) return;
    const { urls, index } = evidenceLightbox;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeEvidenceLightbox();
        return;
      }
      if (e.key === 'ArrowLeft' && index > 0) {
        setEvidenceLightbox({ urls, index: index - 1 });
      }
      if (e.key === 'ArrowRight' && index < urls.length - 1) {
        setEvidenceLightbox({ urls, index: index + 1 });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [evidenceLightbox, closeEvidenceLightbox]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setShowChatWindow(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const openConversationOnMobile = useCallback(
    (convId) => {
      setSelectedConvId(convId);
      setShowChatWindow(true);
    },
    [setSelectedConvId],
  );

  const showMobileQuoteCta =
    Boolean(selectedConvId && hasPanelQuote);
  const quotePanelPendingApproval =
    panelDisplayQuote?.status === 'PENDING_APPROVAL';

  const renderQuoteEvidenceThumbnailStrip = () => {
    if (!quoteEvidenceImageUrls.length) return null;
    const count = quoteEvidenceImageUrls.length;
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-200/60 p-2">
        <p className="mb-1.5 text-center text-[9px] font-medium text-slate-600">
          {count === 1
            ? 'Toca para ampliar'
            : `${count} evidencias · toca una miniatura para ampliar`}
        </p>
        {count === 1 ? (
          <button
            type="button"
            onClick={() => openEvidenceLightbox(quoteEvidenceImageUrls, 0)}
            className="group block w-full text-center transition hover:opacity-95"
          >
            <img
              src={quoteEvidenceImageUrls[0]}
              alt="Evidencia 1"
              className="mx-auto h-24 max-w-full rounded-lg object-cover shadow ring-1 ring-slate-300/80"
            />
          </button>
        ) : (
          <div className="grid max-h-36 grid-cols-3 gap-2 overflow-y-auto pr-0.5">
            {quoteEvidenceImageUrls.map((imgUrl, idx) => (
              <button
                key={`${idx}-${imgUrl.slice(0, 48)}`}
                type="button"
                onClick={() => openEvidenceLightbox(quoteEvidenceImageUrls, idx)}
                className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-slate-300/80 transition hover:ring-2 hover:ring-indigo-400"
              >
                <img
                  src={imgUrl}
                  alt={`Evidencia ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-[8px] font-semibold text-white">
                  {idx + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderQuoteEvidenceLightbox = () => {
    if (!evidenceLightbox) return null;
    const { urls, index: activeImageIndex } = evidenceLightbox;
    const current = urls[activeImageIndex];
    if (!current) return null;

    const canPrev = activeImageIndex > 0;
    const canNext = activeImageIndex < urls.length - 1;
    const navBtnClass =
      'inline-flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white/10 p-3 text-2xl font-bold text-white shadow-lg backdrop-blur-sm transition active:scale-95 hover:bg-white/20 disabled:pointer-events-none disabled:opacity-25';

    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
        role="dialog"
        aria-modal="true"
        aria-label="Visor de evidencia fotográfica"
        onClick={closeEvidenceLightbox}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeEvidenceLightbox();
          }}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm transition hover:bg-white/20"
          aria-label="Cerrar visor"
        >
          ✕
        </button>

        {canPrev ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEvidenceLightbox({ urls, index: activeImageIndex - 1 });
            }}
            className={`absolute left-3 top-1/2 z-10 -translate-y-1/2 sm:left-6 ${navBtnClass}`}
            aria-label="Foto anterior"
          >
            ‹
          </button>
        ) : null}

        <img
          src={current}
          alt={`Evidencia ${activeImageIndex + 1} de ${urls.length}`}
          className="max-h-[80vh] max-w-full object-contain px-14 sm:px-20"
          onClick={(e) => e.stopPropagation()}
        />

        {canNext ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEvidenceLightbox({ urls, index: activeImageIndex + 1 });
            }}
            className={`absolute right-3 top-1/2 z-10 -translate-y-1/2 sm:right-6 ${navBtnClass}`}
            aria-label="Foto siguiente"
          >
            ›
          </button>
        ) : null}

        <p className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-sm font-medium text-white/80">
          {activeImageIndex + 1} / {urls.length}
        </p>
      </div>
    );
  };

  const renderQuoteStatusBadges = () => (
    <div className="flex flex-wrap items-center gap-2">
      {quoteSendCount > 0 ? (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-900">
          Enviada {quoteSendCount > 1 ? `×${quoteSendCount}` : ''}
        </span>
      ) : null}
      {isCartModifiedSinceSend ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
          Cambios desde último envío
        </span>
      ) : null}
      {cartEstado === 'complemento_pendiente' ? (
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-900">
          Complemento pendiente
        </span>
      ) : null}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
          isPanelReadOnly
            ? 'bg-slate-200 text-slate-700'
            : 'bg-emerald-100 text-emerald-800'
        }`}
      >
        {isPanelReadOnly
          ? 'Referencia (solo lectura)'
          : quoteSendCount > 0
            ? 'Carrito activo (editable)'
            : panelDisplayQuote?.status === 'PENDING_APPROVAL'
              ? 'Pendiente de envío'
              : panelDisplayQuote?.status ?? 'Cotización'}
      </span>
      {panelDisplayQuote?.reference ? (
        <span className="text-[10px] text-gray-500">
          {panelDisplayQuote.reference}
        </span>
      ) : null}
      {quoteFormDirty && !isPanelReadOnly ? (
        <span className="text-[10px] font-medium text-amber-700">
          Cambios sin guardar
        </span>
      ) : null}
      {isPanelReadOnly ? (
        <button
          type="button"
          className="min-h-11 text-[10px] font-medium text-indigo-700 underline"
          onClick={() => setPanelQuoteFrozen(null)}
        >
          Volver a editar
        </button>
      ) : null}
    </div>
  );

  const renderLastSendSnapshotSection = () => {
    if (!lastSendSnapshot?.desglose?.length) return null;
    const sentTotal = Math.max(0, Math.round(Number(lastSendSnapshot.total) || 0));
    return (
      <section className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-900">
          Último envío al cliente —{' '}
          {sentTotal.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            maximumFractionDigits: 0,
          })}
        </p>
        <ul className="mt-2 space-y-1">
          {lastSendSnapshot.desglose.map((line, idx) => (
            <li
              key={`${line.pieza}-${idx}`}
              className="flex items-center justify-between gap-2 text-[11px] text-sky-950"
            >
              <span className="min-w-0 truncate">{line.pieza}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {Math.max(0, Math.round(Number(line.precioMx) || 0)).toLocaleString(
                  'es-MX',
                  {
                    style: 'currency',
                    currency: 'MXN',
                    maximumFractionDigits: 0,
                  },
                )}
              </span>
            </li>
          ))}
        </ul>
        {isCartModifiedSinceSend ? (
          <p className="mt-2 text-[9px] leading-snug text-amber-900">
            El carrito editable abajo refleja cambios posteriores (chat o panel).
          </p>
        ) : null}
      </section>
    );
  };

  const renderApprovedCartSection = () => renderLastSendSnapshotSection();

  const renderQuoteDamagesSection = () => (
    <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Carrito activo (
        {(isPanelReadOnly && panelQuoteFrozen?.quoteRows?.length
          ? panelQuoteFrozen.quoteRows
          : quoteRows
        ).length}
        ){isPanelReadOnly ? ' — referencia' : ' — editable por servicio'}
      </p>
      <div
        className={`flex flex-col gap-3 ${
          isPanelReadOnly ? 'pointer-events-none opacity-90' : ''
        }`}
      >
        {panelRowsForDisplay.map((row, idx) => {
          const thumbs = row.urls_origen ?? [];
          return (
            <div
              key={row.id}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 text-[11px] font-bold text-slate-800">
                    Servicio {idx + 1}
                  </span>
                        {row.pieza && !isPlaceholderPieza(row.pieza) ? (
                          <span
                            className="truncate text-[10px] font-medium text-slate-500"
                            title={getPiezaClienteDisplayName(row.pieza)}
                          >
                            {getPiezaSelectLabel(row.pieza)}
                          </span>
                        ) : null}
                </div>
                <button
                  type="button"
                  disabled={quoteRows.length <= 1}
                  onClick={() => handleRemoveQuoteRow(row.id)}
                  title={
                    quoteRows.length <= 1
                      ? 'Debe quedar al menos un servicio en el borrador'
                      : 'Quitar este servicio de la cotización'
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Eliminar servicio de la cotización"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </svg>
                </button>
              </div>
              <div className="block text-[10px] font-medium text-gray-700">
                <span>Servicio</span>
                <div
                  className={`mt-0.5 flex gap-2 ${
                    isRefaccionPieza(row.pieza)
                      ? 'flex-col sm:flex-row sm:items-stretch'
                      : 'flex-col'
                  }`}
                >
                  <select
                    value={row.pieza}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuoteFormDirty(true);
                      setQuoteRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id
                            ? applyPiezaSelectionToRow(r, v, panelPricingContext)
                            : r,
                        ),
                      );
                    }}
                    className={`min-h-11 rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                      isRefaccionPieza(row.pieza) ? 'w-full sm:max-w-[11rem] sm:shrink-0' : 'w-full'
                    }`}
                  >
                    <option value={MANUAL_ROW_PLACEHOLDER_PIEZA}>
                      Seleccionar servicio…
                    </option>
                    {piezaSelectShowsUnmappedFallback(row.pieza) ? (
                      <option value={row.pieza}>
                        {row.pieza} (texto IA — elige de la lista)
                      </option>
                    ) : null}
                    {PANEL_PIEZA_OPTION_GROUPS.map(({ group, options }) => (
                      <optgroup key={group} label={group}>
                        {options.map((opt) => (
                          <option
                            key={opt.code}
                            value={opt.code}
                            title={opt.fullName}
                          >
                            {opt.menuLabel ?? opt.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {isRefaccionPieza(row.pieza) ? (
                    <input
                      type="text"
                      value={row.refaccionDetalle ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuoteRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, refaccionDetalle: v } : r,
                          ),
                        );
                        setQuoteFormDirty(true);
                      }}
                      placeholder="¿Qué refacción es? (Ej: Faro Izquierdo, Amortiguador)"
                      className="min-h-11 w-full flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      aria-label="Nombre de la refacción"
                    />
                  ) : null}
                </div>
              </div>
              {!isInternalDamageRangePieza(row.pieza) &&
              !isRefaccionPieza(row.pieza) ? (
                isIntegralPanelPieza(row.pieza) ? (
                  <label className="mt-2 block text-[10px] font-medium text-gray-700">
                    Tamaño de carrocería
                    <select
                      value={row.severidad}
                      onChange={(e) => {
                        setQuoteFormDirty(true);
                        setQuoteRows((prev) =>
                          prev.map((r) => {
                            if (r.id !== row.id) return r;
                            return recalcRowPriceFromMatrix(
                              { ...r, severidad: e.target.value },
                              panelPricingContext,
                            );
                          }),
                        );
                      }}
                      className="mt-0.5 w-full min-h-11 rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {BPC_SIZE_TIER_OPTIONS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                <label className="mt-2 block text-[10px] font-medium text-gray-700">
                  Severidad
                  <select
                    value={coercePanelDamageMagnitude(row.severidad)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuoteFormDirty(true);
                      setQuoteRows((prev) =>
                        prev.map((r) => {
                          if (r.id !== row.id) return r;
                          return recalcRowPriceFromMatrix(
                            { ...r, severidad: v },
                            panelPricingContext,
                          );
                        }),
                      );
                    }}
                    className="mt-0.5 w-full min-h-11 rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {PANEL_DAMAGE_MAGNITUDES.map((k) => (
                      <option key={k} value={k}>
                        {PANEL_SEVERITY_LABELS[k] ?? k}
                      </option>
                    ))}
                  </select>
                </label>
                )
              ) : null}
              {isInternalDamageRangePieza(row.pieza) ? (
                <div className="mt-2">
                  <p className="text-[10px] font-medium text-amber-900">
                    Rango estimado (MXN)
                    <span className="ml-1 font-normal text-amber-700/90">
                      — sujeto a desarme
                    </span>
                  </p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <label className="block text-[9px] font-semibold uppercase text-gray-600">
                      Mínimo
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.precioMinInput ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQuoteRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, precioMinInput: v }
                                : r,
                            ),
                          );
                          setQuoteFormDirty(true);
                        }}
                        className="mt-0.5 w-full min-h-11 rounded-md border border-amber-200 bg-amber-50/40 px-2 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        placeholder="0"
                      />
                    </label>
                    <label className="block text-[9px] font-semibold uppercase text-gray-600">
                      Máximo
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.precioMaxInput ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setQuoteRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, precioMaxInput: v }
                                : r,
                            ),
                          );
                          setQuoteFormDirty(true);
                        }}
                        className="mt-0.5 w-full min-h-11 rounded-md border border-amber-200 bg-amber-50/40 px-2 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        placeholder="0"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="mt-2 block text-[10px] font-medium text-gray-700">
                  Precio (MXN)
                  <span className="ml-1 font-normal text-gray-400">
                    {isRefaccionPieza(row.pieza)
                      ? '— manual (según proveedor)'
                      : '— editable (redondeo / descuento)'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.precioInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuoteRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, precioInput: v } : r,
                        ),
                      );
                      setQuoteFormDirty(true);
                    }}
                    className="mt-0.5 w-full min-h-11 rounded-md border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0"
                  />
                </label>
              )}

              <div className="mt-2.5 rounded-md border border-dashed border-slate-200 bg-white px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                  Fotos (evidencia)
                </p>
                {thumbs.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {thumbs.map((url, thumbIdx) => (
                      <button
                        key={url}
                        type="button"
                        title="Ver imagen en grande"
                        onClick={() => openEvidenceLightbox(thumbs, thumbIdx)}
                        className="overflow-hidden rounded-md border border-gray-200 shadow-sm transition hover:opacity-90 hover:ring-2 hover:ring-indigo-400"
                      >
                        <img
                          src={url}
                          alt=""
                          className="h-12 w-12 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-[9px] italic text-gray-400">
                    Sin fotos vinculadas a este daño.
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          disabled={
            isPanelReadOnly ||
            !activeDraftForPanel?.id ||
            isSavingQuote ||
            isSendingFinalQuote
          }
          onClick={handleAddManualPiezaRow}
          className="min-h-12 w-full rounded-lg border border-dashed border-indigo-300 bg-white py-2.5 text-[11px] font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          + Añadir servicio manualmente
        </button>
      </div>

      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
          Gran total
        </p>
        <p className="text-xl font-bold tabular-nums text-emerald-950">
          {granTotalDisplay.toLocaleString('es-MX', {
            style: 'currency',
            currency: 'MXN',
            maximumFractionDigits: 0,
          })}
        </p>
        {isComplementCart ? (
          <p className="mt-1 text-[9px] leading-snug text-emerald-900/90">
            Total actual del carrito editable
          </p>
        ) : (
          <p className="text-[9px] text-emerald-800/90">
            Suma de todos los precios de la lista
            {panelHasInternalDamageRange
              ? ' (usa el mínimo de daños internos; el máximo es referencia)'
              : ''}
          </p>
        )}
      </div>

      {!activeDraftForPanel?.id ? (
        <p className="text-[10px] text-amber-800">
          Obteniendo enlace del borrador en el servidor…
        </p>
      ) : null}
      {quoteSaveError ? (
        <p className="text-[10px] text-red-600">{quoteSaveError}</p>
      ) : null}
    </section>
  );

  const renderQuoteClientMessageBlock = () => (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs leading-relaxed text-gray-800 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
          Mensaje al cliente (envío / copiar)
        </p>
        <button
          type="button"
          title={
            isPanelReadOnly
              ? 'Modo referencia: vuelve a editar para regenerar'
              : 'Regenerar redacción con ChatAppointmentPrompt'
          }
          disabled={
            isPanelReadOnly ||
            isSending ||
            isSavingQuote ||
            isSendingFinalQuote ||
            isRegeneratingClientePreview ||
            !activeDraftForPanel?.id ||
            quoteRows.length === 0
          }
          onClick={() => void handleRegenerateClientePreview()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Regenerar mensaje al cliente"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={`h-5 w-5 ${isRegeneratingClientePreview ? 'animate-spin' : ''}`}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
      </div>
      <pre className="min-h-[80px] whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {mensajeClientePreview}
      </pre>
    </div>
  );

  const renderQuoteActionButtons = () => (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={
          isPanelReadOnly ||
          isSending ||
          isSavingQuote ||
          isSendingFinalQuote ||
          !activeDraftForPanel?.id
        }
        onClick={handleGuardarCambios}
        className="min-h-12 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-900 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSavingQuote ? 'Guardando…' : 'Guardar Cambios'}
      </button>
      <button
        type="button"
        disabled={
          isPanelReadOnly ||
          isSending ||
          isSavingQuote ||
          isSendingFinalQuote ||
          !activeDraftForPanel?.id
        }
        onClick={handleEnviarCotizacionFinal}
        className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSendingFinalQuote || isSending
          ? 'Enviando…'
          : 'Enviar Cotización Final'}
      </button>
      <button
        type="button"
        disabled={isSending || isSavingQuote || isSendingFinalQuote}
        onClick={() => {
          setReply(mensajeClientePreview);
          document.getElementById('chat-reply-input')?.focus?.();
          setQuoteDrawerOpen(false);
        }}
        className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Copiar mensaje al cliente al cuadro de respuesta
      </button>
    </div>
  );

  const renderDraftQuotePanelScrollContent = () => (
    <>
      {!selectedConvId ? (
        <p className="text-center text-xs text-gray-500">
          Selecciona una conversación para ver cotizaciones de este chat.
        </p>
      ) : !hasPanelQuote && !hasPanelPeritajeOnly ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 text-center text-xs text-gray-500">
          Aquí aparecerá la cotización cuando el sistema analice una imagen (daños /
          taller) en este chat.
        </div>
      ) : (
        <>
          {hasPanelPeritajeOnly ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950">
              <p className="font-semibold">Baño de pintura — falta marca y modelo</p>
              <p className="mt-1 text-[11px]">
                El peritaje visual ya está guardado. No hay precios hasta que el
                cliente indique su vehículo; el asistente lo solicitará en el chat.
              </p>
              {activeDraftForPanel?.damageAnalysis?.banioPinturaGate
                ?.resumenDanosVisuales ? (
                <p className="mt-2 whitespace-pre-wrap text-[11px] text-amber-900/90">
                  {
                    activeDraftForPanel.damageAnalysis.banioPinturaGate
                      .resumenDanosVisuales
                  }
                </p>
              ) : null}
            </div>
          ) : null}
          {renderQuoteEvidenceThumbnailStrip()}
          {hasPanelQuote ? renderQuoteStatusBadges() : null}
          {renderApprovedCartSection()}
          {renderQuoteDamagesSection()}
          {hasPanelQuote && panelConceptLinesFromRows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white text-[11px] shadow-sm">
              <table className="w-full min-w-[280px] text-left">
                <thead className="bg-gray-100 text-[9px] uppercase text-gray-600">
                  <tr>
                    <th className="px-2 py-1.5">Concepto</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {panelConceptLinesFromRows.map((line) => (
                    <tr key={line.key} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-800">
                        {line.description}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-900">
                        {line.isRange ? (
                          <span className="text-[10px] leading-snug text-amber-900">
                            {line.amountLabel}
                            <br />
                            <span className="font-normal text-gray-500">
                              (mín. en gran total)
                            </span>
                          </span>
                        ) : (
                          line.amountLabel
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-xs font-bold text-gray-900">
                Total (base):{' '}
                {granTotalDisplay.toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                  maximumFractionDigits: 0,
                })}
              </div>
              {isComplementCart ? (
                <p className="border-t border-indigo-100 bg-indigo-50/50 px-2 py-1.5 text-[9px] leading-snug text-indigo-950">
                  Gran total conversación (aprobado + complemento):{' '}
                  {cartTotalGlobal.toLocaleString('es-MX', {
                    style: 'currency',
                    currency: 'MXN',
                    maximumFractionDigits: 0,
                  })}
                </p>
              ) : null}
              {panelHasInternalDamageRange ? (
                <p className="border-t border-amber-100 bg-amber-50/60 px-2 py-1.5 text-[9px] leading-snug text-amber-950">
                  Los posibles daños internos se cotizan por rango; el gran total
                  suma el mínimo. El máximo aplica solo tras desarme en taller.
                </p>
              ) : null}
            </div>
          ) : null}
          {hasPanelQuote ? renderQuoteClientMessageBlock() : null}
        </>
      )}
    </>
  );

  const renderDraftQuotePanelBody = () => (
    <>
      {renderDraftQuotePanelScrollContent()}
      {hasPanelQuote && selectedConvId ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3">
          {renderQuoteActionButtons()}
        </div>
      ) : null}
    </>
  );
  const mobileChatOpen = Boolean(showChatWindow && selectedConvId);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-100 font-sans text-gray-900">
      
      {/* 1. Rail: canales + navegación */}
      <OmnichannelLeftRail
        platformSlot={
          <>
            {[
              { id: 'whatsapp', letter: 'W', className: 'bg-green-500' },
              { id: 'instagram', letter: 'I', className: 'bg-pink-500' },
              { id: 'facebook', letter: 'F', className: 'bg-blue-600' },
            ].map(({ id, letter, className }) => (
              <button
                key={id}
                type="button"
                title={
                  id === 'whatsapp'
                    ? 'WhatsApp'
                    : id === 'instagram'
                      ? 'Instagram'
                      : 'Facebook'
                }
                onClick={() =>
                  setPlatformFilter((prev) => (prev === id ? 'all' : id))
                }
                className={`flex h-12 w-12 items-center justify-center rounded-full font-bold text-white shadow-lg transition hover:scale-105 ${className} ${
                  platformFilter === id
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105'
                    : ''
                }`}
              >
                {letter}
              </button>
            ))}
          </>
        }
      />

      {/* 2–4. Bandeja + chat + panel cotización */}
      <div className="grid min-h-0 min-w-0 w-full flex-1 grid-cols-1 lg:grid-cols-12">
      {/* 2. LISTA CONTACTOS */}
      <div
        className={`flex min-h-0 w-full flex-col border-r border-gray-200 bg-white shadow-inner lg:col-span-3 ${
          mobileChatOpen ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
          {pendingPorCotizarCount > 0 ? (
            <div className="border-b border-red-100 px-4 pt-3 pb-2 bg-red-50/30">
              <p
                role="status"
                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-medium leading-snug text-red-900"
              >
                {pendingPorCotizarCount === 1
                  ? 'Tienes 1 cotización pendiente de revisión.'
                  : `Tienes ${pendingPorCotizarCount} cotizaciones pendientes de revisión.`}
              </p>
            </div>
          ) : null}
          <div
            className={`flex items-center justify-between gap-3 border-b border-gray-100/80 px-4 ${
              pendingPorCotizarCount === 0 ? 'pt-4 pb-3' : 'pt-2 pb-3'
            }`}
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-gray-900">
                Bandeja
              </h2>
              <p className="mt-1 text-[11px] font-medium text-gray-500">
                Filtra conversaciones por canal
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              <Link
                to="/calendar"
                title="Citas y agenda"
                aria-label="Ir al calendario de citas"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-200/90 bg-gradient-to-br from-indigo-50 via-white to-violet-50 text-indigo-700 shadow-md ring-1 ring-indigo-100/80 transition active:scale-95 hover:border-indigo-300 hover:shadow-lg"
              >
                <Calendar className="h-5 w-5" strokeWidth={2} aria-hidden />
              </Link>
              <button
                type="button"
                onClick={logout}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 shadow-sm transition active:scale-95 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
              >
                <LogOut className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'instagram', label: 'Instagram' },
              { id: 'facebook', label: 'Facebook' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlatformFilter(id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  platformFilter === id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedBandejaContacts.map((contact) => {
            const leadSt = normalizeConversationLeadStatus(contact.status);
            const isUrgent = leadSt === 'por_cotizar';
            const isSelected = selectedConvId === contact.id;
            return (
            <div
              key={contact.id}
              onClick={() => openConversationOnMobile(contact.id)}
              className={`flex cursor-pointer items-start space-x-3 border-b p-4 transition ${
                isSelected
                  ? 'bg-blue-50 border-r-4 border-r-blue-500'
                  : 'hover:bg-gray-50'
              } ${
                isUrgent
                  ? 'border-l-[3px] border-l-red-500 bg-red-50/55 ring-1 ring-inset ring-red-100'
                  : ''
              }`}
            >
              <div className="relative h-12 w-12 shrink-0">
                {contact.avatarUrl ? (
                  <img
                    src={contact.avatarUrl}
                    alt=""
                    className="h-full w-full rounded-full object-cover shadow-md"
                  />
                ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-lg font-bold text-white shadow-md">
                  {contact.contactName ? contact.contactName.charAt(0).toUpperCase() : '?'}
                </div>
                )}
                <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                  <PlatformBadge platform={contact.platform} size="sm" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <p className="truncate font-bold text-gray-800">{contact.contactName}</p>
                  <span className="ml-2 shrink-0 text-[10px] text-gray-400">
                    {contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>
                <LeadStatusBadge status={contact.status} />
                <p className="mt-1 truncate text-xs italic text-gray-500">
                  {contact.direction === 'outbound' ? <span className="font-medium text-blue-500">Tú: </span> : ''}
                  {getPreviewText(contact.lastMessage)}
                </p>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* 3. VENTANA CHAT */}
      <div
        className={`min-h-0 min-w-0 flex-col border-r border-gray-200 bg-white lg:col-span-6 ${
          mobileChatOpen ? 'flex' : 'hidden'
        } lg:flex`}
      >
        {selectedConvId ? (
          <>
            {/* Header Chat */}
            <div className="z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-white p-3 shadow-sm font-semibold sm:gap-3 sm:p-4">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:space-x-3">
                <button
                  type="button"
                  onClick={() => setShowChatWindow(false)}
                  className="lg:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-lg text-gray-700 shadow-sm transition hover:bg-gray-100"
                  aria-label="Regresar a la bandeja"
                >
                  ←
                </button>
                <div className="relative h-9 w-9 shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-bold text-blue-600">
                    {selectedUserName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                    <PlatformBadge platform={selectedContact?.platform} size="sm" />
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{selectedUserName}</span>
                  <span className="hidden truncate text-[10px] font-normal text-gray-400 sm:inline">
                    ID: {selectedConvId}
                  </span>
                </div>
              </div>
              {showMobileQuoteCta ? (
                <button
                  type="button"
                  onClick={() => setQuoteDrawerOpen(true)}
                  className="lg:hidden inline-flex min-h-11 max-w-[min(100%,220px)] shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2 text-[10px] font-semibold text-amber-950 shadow-sm transition active:scale-[0.98]"
                >
                  <span className="text-base leading-none" aria-hidden>
                    🛠️
                  </span>
                  <span className="truncate">
                    {quotePanelPendingApproval ? (
                      <span className="animate-pulse">
                        Ver Cotización de IA (Pendiente)
                      </span>
                    ) : (
                      'Ver Cotización de IA'
                    )}
                  </span>
                </button>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 shadow-sm">
                  <span
                    className="text-[11px] font-medium text-slate-700"
                    id="autopilot-label"
                  >
                    Autopilot
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-labelledby="autopilot-label"
                    aria-checked={
                      selectedContact?.isAutoPilotActive !== false
                    }
                    disabled={!apiBaseUrl || autoPilotToggleBusy}
                    title={
                      (selectedContact?.isAutoPilotActive !== false)
                        ? 'Respuestas IA automáticas activadas'
                        : 'Solo sugerencias en panel; sin respuesta automática'
                    }
                    onClick={handleAutoPilotToggle}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 disabled:opacity-50 ${
                      selectedContact?.isAutoPilotActive !== false
                        ? 'bg-indigo-600'
                        : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        selectedContact?.isAutoPilotActive !== false
                          ? 'translate-x-5'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteConversationClick()}
                  disabled={!selectedConvId || deleteConversationBusy}
                  title="Eliminar conversación y todo su historial"
                  aria-label="Eliminar conversación"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-lg transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-red-500 hover:text-red-700" aria-hidden>
                    🗑️
                  </span>
                </button>
                <span className={`flex shrink-0 items-center text-xs font-normal ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                  <span className={`mr-2 h-2 w-2 rounded-full ${isConnected ? 'animate-pulse bg-green-500' : 'bg-red-500'}`} />
                  {isConnected ? 'Online' : 'Desconectado'}
                </span>
              </div>
            </div>
            
            {/* Mensajes Chat */}
            <div className="flex-1 overflow-y-auto flex flex-col space-y-3 bg-[#e5ddd5] p-6">
              {messages.map((msg) => {
                const isOut =
                  String(msg.direction ?? '').toLowerCase() === 'outbound';
                return (
                <div
                  key={msg.id}
                  className={`flex w-full shrink-0 ${isOut ? 'justify-end' : 'justify-start'}`}
                >
                <div className={`p-3 rounded-2xl shadow-sm max-w-[80%] ${!isOut ? 'bg-white text-gray-800 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>
                  {isImage(msg.content) ? (
                    <img src={msg.content} alt="Adjunto" className="rounded-lg max-h-72 object-cover cursor-pointer hover:opacity-95 transition" onClick={() => window.open(msg.content, '_blank')} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {msg.content}
                    </p>
                  )}
                  <div className={`text-[9px] mt-1 text-right opacity-60 ${!isOut ? 'text-gray-500' : 'text-indigo-100'}`}>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                </div>
                </div>
              );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* --- SECCIÓN DE ENTRADA PRO (Multimedia + IA) --- */}
            <div className="p-4 border-t bg-gray-50 mt-auto z-10">
              {clienteEsperandoAfuera ? (
                <button
                  type="button"
                  onClick={() => void handleConfirmarRecepcionCliente()}
                  disabled={arrivalAlarmBusy}
                  className="arrival-alarm-banner mb-3 w-full rounded-xl border-2 border-red-950 px-4 py-4 text-center text-sm font-extrabold uppercase tracking-wide text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-80 sm:text-base"
                  aria-live="assertive"
                >
                  {arrivalAlarmBusy ?
                    '⏳ Confirmando recepción…'
                  : '🚨 CLIENTE AFUERA - CLIC PARA CONFIRMAR RECEPCIÓN'}
                </button>
              ) : null}

              <QuickReplies
                suggestions={quickReplySuggestions}
                onPick={setReply}
                disabled={!!filePreviewUrl}
              />

              {/* --- 🌟 VISTA PREVIA DE LA IMAGEN (Thumbnail) 🌟 --- */}
              {filePreviewUrl && (
                <div className="mb-3 p-2 bg-white border border-gray-200 rounded-xl shadow-lg flex items-center space-x-3 relative animate-in fade-in slide-in-from-bottom-2">
                  <img 
                    src={filePreviewUrl} 
                    alt="Previsualización" 
                    className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Imagen seleccionada</p>
                    <p className="text-xs text-gray-500">Lista para enviar a Cloudinary</p>
                  </div>
                  {/* Botón ✕ para cancelar */}
                  <button 
                    onClick={onClearFile}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs hover:bg-gray-600 shadow-md transition"
                    title="Cancelar imagen"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Barra de Entrada */}
              <div className="flex space-x-2 items-center">
                
                {/* Botón Clip 📎 (Hidden Input Trigger) */}
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 hover:scale-105 active:scale-95 shadow-sm"
                  title="Adjuntar imagen"
                >
                  📎
                </button>
                {/* INPUT HIDDEN REAL */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    onFileSelect(e.target.files[0]);
                    e.target.value = null; // Reset para poder elegir la misma imagen dos veces
                  }} 
                />

                {/* Botón IA ✨ */}
                {!filePreviewUrl && (
                    <button onClick={onGetAiSuggestion} disabled={isAiLoading} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md border ${isAiLoading ? 'bg-gray-100 border-gray-200' : 'bg-white border-purple-200 text-purple-600 hover:bg-purple-50 hover:scale-110 active:scale-95'}`}>
                    {isAiLoading ? <span className="animate-spin">⏳</span> : '✨'}
                    </button>
                )}

                {/* Input de Texto (Deshabilitado si hay imagen para simplificar) */}
                <input 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !filePreviewUrl && onSendMessage()}
                  id="chat-reply-input"
                  disabled={!!filePreviewUrl || isSending}
                  className={`flex-1 border border-gray-200 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400 transition-all bg-white shadow-inner ${filePreviewUrl ? 'bg-gray-100 text-gray-400 italic' : ''}`} 
                  placeholder={filePreviewUrl ? "Imagen lista. Haz clic en Enviar ->" : `Responder a ${selectedUserName}...`} 
                />
                
                {/* Botón Enviar 🚀 */}
                <button 
                  onClick={onSendMessage} 
                  disabled={isSending}
                  className={`bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-indigo-700 shadow-md active:scale-95 transition-all flex items-center space-x-2 ${isSending ? 'opacity-70 bg-gray-500' : ''}`}
                >
                  {isSending ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <span>Enviar</span>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-gray-50 text-center text-gray-400">
            <div><div className="mb-4 text-8xl opacity-10">💬</div><p className="text-xl font-semibold text-gray-400">Bandeja de Entrada</p><p className="text-sm opacity-60">Selecciona un chat para empezar a gestionar</p></div>
          </div>
        )}
      </div>

      {/* 4. Panel de Cotización — escritorio */}
      <aside className="hidden min-h-0 flex-col border-l border-gray-200 bg-slate-50 shadow-inner lg:col-span-3 lg:flex">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-gray-900">
            Panel de Cotización
          </h2>
          <p className="mt-0.5 text-[10px] text-gray-500">
            Borrador generado por IA · requiere tu validación
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          {renderDraftQuotePanelBody()}
        </div>
      </aside>

      {/* Panel de Cotización — móvil (bottom drawer) */}
      {quoteDrawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Cotización de IA"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            aria-label="Cerrar cotización"
            onClick={() => setQuoteDrawerOpen(false)}
          />
          <div className="relative flex h-[min(92dvh,900px)] max-h-[92dvh] w-full min-h-0 flex-col rounded-t-2xl border border-gray-200 bg-slate-50 shadow-2xl">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold tracking-tight text-gray-900">
                    Cotización de IA
                  </h2>
                  <p className="mt-0.5 text-[10px] text-gray-500">
                    Revisa, edita y envía al cliente
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuoteDrawerOpen(false)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-lg text-gray-600"
                  aria-label="Cerrar panel"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto overscroll-y-contain touch-pan-y px-4 pb-32 space-y-4 [-webkit-overflow-scrolling:touch]">
                {renderDraftQuotePanelScrollContent()}
              </div>
              {hasPanelQuote && selectedConvId ? (
                <div className="sticky bottom-0 z-10 shrink-0 border-t border-gray-200 bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
                  {renderQuoteActionButtons()}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {renderQuoteEvidenceLightbox()}
      </div>
    </div>
  );
}

export default ChatView;
