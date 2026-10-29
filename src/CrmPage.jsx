import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Plus, Users } from 'lucide-react';
import {
  createCrmAppointment,
  expireAuthSession,
  fetchCrmAppointments,
  fetchCrmSuggestions,
  patchCrmVisit,
  saveCrmCommercial,
  saveCrmContract,
} from './apiClient.js';
import {
  blankServiceLine,
  formatCents,
  formatHundredths,
  lineSubtotalCents,
  parseDecimalToScaled,
} from './crmMoney.js';
import { getAuthTallerId } from './authStorage.js';
import { connectWorkshopSocket } from './realtimeSocket.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const WORKSHOP_TZ = 'America/Mexico_City';

const ORIGINS = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'google', label: 'Google' },
  { id: 'recomendacion', label: 'Recomendación' },
  { id: 'recurrente', label: 'Cliente recurrente' },
  { id: 'otro', label: 'Otro' },
  { id: 'desconocido', label: 'Desconocido' },
];

const VISITS = [
  { id: 'agendada', label: 'Agendada' },
  { id: 'realizada', label: 'Realizada' },
  { id: 'cancelada', label: 'Cancelada' },
  { id: 'no_asistio', label: 'No asistió' },
];

const TIME_CHIPS = ['09:00', '11:00', '13:00', '16:00'];

const FREQUENT_SERVICES = [
  'Baño de pintura',
  'Pintura de salpicadera',
  'Hojalatería',
  'Pulido',
  'Cerámico',
];

const ATTRIBUTION_LABELS = {
  manual: 'Declarado en el CRM',
  verified: 'Verificado por integración',
  unknown: 'Sin anuncio',
};

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function formatMxn(value) {
  const n = Number(value);
  return Number.isFinite(n) ? MXN.format(n) : '—';
}

function quoteLabel(row) {
  if (row.quotedTotalCents != null) return formatCents(row.quotedTotalCents);
  if (row.quotedAmount == null) return 'Sin cotizar';
  return formatMxn(row.quotedAmount);
}

function serviceLabel(row) {
  const names = Array.isArray(row.lines) ? row.lines.map((line) => line.name).filter(Boolean) : [];
  if (names.length > 1) return `${names[0]} +${names.length - 1}`;
  if (names.length === 1) return names[0];
  return row.serviceRequested || '';
}

function ymdInTz(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function weekdaySun0(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function defaultDateYmd(now = new Date()) {
  let ymd = ymdInTz(now);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: WORKSHOP_TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  const dow = weekdaySun0(ymd);
  const closed =
    dow === 0 || (dow === 6 && hour >= 14) || (dow >= 1 && dow <= 5 && hour >= 18);
  if (!closed) return ymd;
  ymd = addDays(ymd, 1);
  while (weekdaySun0(ymd) === 0) ymd = addDays(ymd, 1);
  return ymd;
}

function newRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `crm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function originLabel(id) {
  return ORIGINS.find((item) => item.id === id)?.label ?? 'Desconocido';
}

function vehicleLabel(row) {
  const parts = [row.vehicleMake, row.vehicleModel, row.vehicleYear]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  if (parts.length) return parts.join(' ');
  return String(row.vehicle ?? '').trim();
}

function whenLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: WORKSHOP_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-amber-500/20 placeholder:text-gray-400 focus:border-amber-300 focus:ring-4 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

function ManualAppointmentForm({ requestId, appointment, busy, error, onSubmit, onClose }) {
  const editing = Boolean(appointment?.id);
  const [clientName, setClientName] = useState(appointment?.clientName ?? '');
  const [phone, setPhone] = useState(appointment?.phone ?? '');
  const [vehicleMake, setVehicleMake] = useState(appointment?.vehicleMake ?? '');
  const [vehicleModel, setVehicleModel] = useState(appointment?.vehicleModel ?? '');
  const [vehicleYear, setVehicleYear] = useState(
    appointment?.vehicleYear == null ? '' : String(appointment.vehicleYear),
  );
  const [lines, setLines] = useState(() =>
    appointment?.lines?.length
      ? appointment.lines.map((line) => ({
          id: line.id,
          name: line.name,
          quantity: formatHundredths(line.quantityHundredths),
          unitPrice: formatHundredths(line.unitPriceCents),
        }))
      : [blankServiceLine()],
  );
  const [linesDirty, setLinesDirty] = useState(!editing);
  const [origin, setOrigin] = useState(appointment?.origin || 'desconocido');
  const [campaignName, setCampaignName] = useState(appointment?.campaignName ?? '');
  const [adName, setAdName] = useState(appointment?.adName ?? '');
  const [adExternalId, setAdExternalId] = useState(appointment?.adExternalId ?? '');
  const [date, setDate] = useState(() => defaultDateYmd());
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [localError, setLocalError] = useState('');
  const [suggestions, setSuggestions] = useState({ campaigns: [], ads: [], services: [] });

  useEffect(() => {
    let active = true;
    fetchCrmSuggestions()
      .then((data) => {
        if (!active) return;
        setSuggestions({
          campaigns: data?.campaigns ?? [],
          ads: data?.ads ?? [],
          services: data?.services ?? [],
        });
      })
      .catch(() => {
        if (active) setSuggestions({ campaigns: [], ads: [], services: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const serviceOptions = [...new Set([...FREQUENT_SERVICES, ...suggestions.services])];
  const prepared = lines.map((line) => {
    const empty = !line.name.trim() && !String(line.unitPrice).trim();
    const quantityHundredths = parseDecimalToScaled(line.quantity || '1');
    const unitPriceCents = parseDecimalToScaled(line.unitPrice);
    const subtotalCents =
      quantityHundredths != null && unitPriceCents != null
        ? lineSubtotalCents(quantityHundredths, unitPriceCents)
        : null;
    return { ...line, empty, quantityHundredths, unitPriceCents, subtotalCents };
  });
  const activeLines = prepared.filter((line) => !line.empty);
  const totalCents =
    activeLines.length > 0 && activeLines.every((line) => line.subtotalCents != null)
      ? activeLines.reduce((sum, line) => sum + line.subtotalCents, 0)
      : null;

  const updateLine = (id, patch) => {
    setLinesDirty(true);
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError('');
        if (activeLines.some((line) => !line.name.trim() || line.subtotalCents == null)) {
          setLocalError('Cada servicio necesita nombre, cantidad y precio.');
          return;
        }
        const payloadLines = activeLines.map((line) => ({
          id: line.id,
          name: line.name.trim(),
          quantityHundredths: line.quantityHundredths,
          unitPriceCents: line.unitPriceCents,
        }));
        const attribution = {
          origin,
          campaignName: campaignName.trim(),
          adName: adName.trim(),
          adExternalId: adExternalId.trim(),
        };
        if (editing) {
          onSubmit({
            ...attribution,
            ...(linesDirty ? { lines: payloadLines } : {}),
          });
          return;
        }
        onSubmit({
          clientRequestId: requestId,
          clientName,
          phone,
          vehicleMake,
          vehicleModel,
          vehicleYear: vehicleYear.trim() ? Number(vehicleYear) : undefined,
          origin,
          notes,
          scheduledAtIso: `${date}T${String(time || '10:00').slice(0, 5)}:00`,
          ...attribution,
          lines: payloadLines,
        });
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {editing ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {appointment.clientName}
            {appointment.phone ? ` · ${appointment.phone}` : ''}
          </p>
        ) : null}
        {editing ? null : (
        <>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Nombre del cliente
          </span>
          <input
            required
            autoFocus
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={fieldClass}
            placeholder="Ana López"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Teléfono
          </span>
          <input
            required
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldClass}
            placeholder="55 1234 5678"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Marca
            </span>
            <input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Modelo
            </span>
            <input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Año
            </span>
            <input
              inputMode="numeric"
              value={vehicleYear}
              onChange={(e) => setVehicleYear(e.target.value)}
              className={fieldClass}
              placeholder="2019"
            />
          </label>
        </div>
        </>
        )}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Servicios</span>
            <button
              type="button"
              onClick={() => {
                setLinesDirty(true);
                setLines((current) => [...current, blankServiceLine()]);
              }}
              className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:text-amber-200"
            >
              Agregar servicio
            </button>
          </div>
          {editing && !appointment?.lines?.length && appointment?.serviceRequested ? (
            <p className="text-xs text-gray-500">
              Esta cita ya tiene «{appointment.serviceRequested}». Agregar un servicio lo sustituye al guardar.
            </p>
          ) : null}
          {lines.map((line, index) => {
            const row = prepared.find((item) => item.id === line.id);
            return (
              <div key={line.id} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">Servicio {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLinesDirty(true);
                      setLines((current) =>
                        current.length === 1 ? [blankServiceLine()] : current.filter((item) => item.id !== line.id),
                      );
                    }}
                    className="text-xs font-medium text-gray-500"
                  >
                    Quitar
                  </button>
                </div>
                <input
                  list="crm-service-names"
                  value={line.name}
                  onChange={(e) => updateLine(line.id, { name: e.target.value })}
                  className={fieldClass}
                  placeholder="Nombre del servicio"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">Cantidad</span>
                    <input
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">Precio unitario</span>
                    <input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                      className={fieldClass}
                      placeholder="0.00"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Subtotal {row?.subtotalCents == null ? '—' : formatCents(row.subtotalCents)}
                </p>
              </div>
            );
          })}
          <datalist id="crm-service-names">
            {serviceOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Total cotizado {totalCents == null ? '—' : formatCents(totalCents)}
          </p>
          <p className="text-xs text-gray-500">No se registra como venta.</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Origen
          </span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldClass}>
            {ORIGINS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Campaña</span>
            <input
              list="crm-campaign-names"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className={fieldClass}
              placeholder="Opcional"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Anuncio</span>
            <input
              list="crm-ad-names"
              value={adName}
              onChange={(e) => setAdName(e.target.value)}
              className={fieldClass}
              placeholder="Opcional"
            />
          </label>
        </div>
        <datalist id="crm-campaign-names">
          {suggestions.campaigns.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <datalist id="crm-ad-names">
          {suggestions.ads.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Id del anuncio
          </span>
          <input
            value={adExternalId}
            onChange={(e) => setAdExternalId(e.target.value)}
            className={fieldClass}
            placeholder="Opcional, para una integración futura"
          />
          <span className="mt-1 block text-xs text-gray-500">
            {ATTRIBUTION_LABELS[appointment?.attributionKind] || 'Sin anuncio hasta que lo escribas.'}
          </span>
        </label>
        {editing ? null : (
        <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Fecha
            </span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Hora
            </span>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setTime(chip)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                time === chip
                  ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Lun–vie 9:00–18:00, sáb 9:00–14:00, hora del centro de México.
        </p>
        </>
        )}
        {editing ? null : (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Observaciones
          </span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
          />
        </label>
        )}
        {localError || error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {localError || error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar cita'}
        </button>
      </div>
    </form>
  );
}

function CrmAppointmentCard({ row, onVisit, onContract, onEdit }) {
  const [visit, setVisit] = useState(row.visitStatus || 'agendada');
  const [amount, setAmount] = useState(
    row.contractedAmount == null ? '' : String(row.contractedAmount),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blocked = visit === 'cancelada' || visit === 'no_asistio';
  const vehicle = vehicleLabel(row);

  useEffect(() => {
    setVisit(row.visitStatus || 'agendada');
    setAmount(row.contractedAmount == null ? '' : String(row.contractedAmount));
  }, [row.visitStatus, row.contractedAmount, row.id]);

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">
            {row.clientName}
          </h3>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
            {whenLabel(row.scheduledAt)}
            {row.phone ? ` · ${row.phone}` : ''}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {vehicle || 'Vehículo no indicado'}
            {serviceLabel(row) ? ` · ${serviceLabel(row)}` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {originLabel(row.origin)}
            {row.campaignName ? ` · ${row.campaignName}` : ''}
            {row.adName ? ` · ${row.adName}` : ''}
            {row.attributionKind === 'manual' ? ' · declarado' : ''}
            {row.attributionKind === 'verified' ? ' · verificado' : ''}
          </p>
        </div>
        <label className="block sm:w-44">
          <span className="sr-only">Resultado de la visita</span>
          <select
            value={visit}
            disabled={busy}
            onChange={async (event) => {
              const next = event.target.value;
              setVisit(next);
              setBusy(true);
              setError('');
              try {
                await onVisit(row.id, next);
              } catch (err) {
                setVisit(row.visitStatus || 'agendada');
                setError(err?.message || 'No se pudo actualizar');
              } finally {
                setBusy(false);
              }
            }}
            className={fieldClass}
          >
            {VISITS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 dark:border-gray-700 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Cotizado
          </p>
          <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
            {quoteLabel(row)}
          </p>
          <p className="text-xs text-gray-400">No cuenta como venta.</p>
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            try {
              await onContract(row.id, Number(amount));
            } catch (err) {
              setError(err?.message || 'No se pudo guardar el contratado');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Trabajo contratado
            </span>
            <input
              inputMode="decimal"
              value={amount}
              disabled={blocked || busy}
              onChange={(e) => setAmount(e.target.value)}
              className={fieldClass}
              placeholder="Importe real"
            />
          </label>
          <button
            type="submit"
            disabled={blocked || busy || !String(amount).trim()}
            className="w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          >
            Guardar contratado
          </button>
        </form>
      </div>
      {Array.isArray(row.lines) && row.lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          {row.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span className="truncate">
                {line.name} · {formatHundredths(line.quantityHundredths)} × {formatCents(line.unitPriceCents)}
              </span>
              <span className="shrink-0">{formatCents(line.subtotalCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={() => onEdit(row)}
        className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300"
      >
        Editar servicios
      </button>
      {row.notes ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{row.notes}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </article>
  );
}

export default function CrmPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await fetchCrmAppointments();
      setItems(rows);
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el CRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = connectWorkshopSocket({
      onUnauthorized: () => expireAuthSession(),
    });
    if (!socket) return undefined;
    const onRefresh = (payload) => {
      if (payload?.source && payload.source !== 'manual') return;
      const tallerId = getAuthTallerId();
      if (!payload?.tallerId || payload.tallerId !== tallerId) return;
      void load();
    };
    socket.on('appointmentCreated', onRefresh);
    socket.on('appointmentUpdated', onRefresh);
    return () => {
      socket.off('appointmentCreated', onRefresh);
      socket.off('appointmentUpdated', onRefresh);
      socket.disconnect();
    };
  }, [load]);

  const openForm = () => {
    requestIdRef.current = newRequestId();
    setEditing(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setFormError('');
    setFormOpen(true);
  };

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      ),
    [items],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 pb-16 dark:bg-gray-950 lg:pb-0">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 hidden h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 sm:inline-flex">
                <Users className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">CRM</h1>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Prospectos y citas capturados a mano. Aparecen en el calendario.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="lg:hidden">
                <ThemeToggle placement="header" />
              </div>
              <button
                type="button"
                onClick={openForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
              >
                <Plus className="h-4 w-4" />
                Nueva cita
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
              <button type="button" onClick={() => void load()} className="ml-3 font-medium underline">
                Reintentar
              </button>
            </div>
          ) : null}
          {loading ? (
            <p className="py-16 text-center text-sm text-gray-500">Cargando prospectos…</p>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <CalendarDays className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                Todavía no hay citas manuales
              </h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Registra nombre, teléfono y horario. El turno queda en la agenda del taller.
              </p>
              <button
                type="button"
                onClick={openForm}
                className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Nueva cita
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((row) => (
                <CrmAppointmentCard
                  key={row.id}
                  row={row}
                  onVisit={async (id, visitStatus) => {
                    await patchCrmVisit(id, visitStatus);
                    await load();
                  }}
                  onContract={async (id, contractedAmount) => {
                    await saveCrmContract(id, contractedAmount);
                    await load();
                  }}
                  onEdit={openEdit}
                />
              ))}
              <p className="pt-2 text-center text-sm text-gray-500">
                <Link to="/calendar" className="font-medium text-amber-700 hover:underline dark:text-amber-300">
                  Ver en el calendario
                </Link>
              </p>
            </div>
          )}
        </main>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-900 sm:h-[min(40rem,92dvh)] sm:max-w-lg sm:rounded-2xl sm:shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {editing ? 'Editar servicios' : 'Nueva cita'}
              </h2>
            </div>
            <ManualAppointmentForm
              key={editing?.id || requestIdRef.current}
              requestId={requestIdRef.current}
              appointment={editing}
              busy={saving}
              error={formError}
              onClose={() => {
                if (!saving) setFormOpen(false);
              }}
              onSubmit={async (payload) => {
                setSaving(true);
                setFormError('');
                try {
                  if (editing?.id) await saveCrmCommercial(editing.id, payload);
                  else await createCrmAppointment(payload);
                  setFormOpen(false);
                  await load();
                } catch (err) {
                  setFormError(err?.message || 'No se pudo guardar la cita');
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
