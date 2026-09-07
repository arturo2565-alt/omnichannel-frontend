import { Link } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  CalendarDays,
  MessageCircle,
  Phone,
  Search,
} from 'lucide-react';
import { apiFetchWebhook, transitionConversationStatus } from './apiClient.js';
import { API_ORIGIN_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';

const WORKSHOP_TZ = 'America/Mexico_City';

const RANGE_OPTIONS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Próximos 7 días' },
  { id: 'todas', label: 'Todas' },
];

const STATUS_FILTERS = [
  { id: 'confirmadas', label: 'Confirmadas' },
  { id: 'finalizadas', label: 'Finalizadas / Completadas' },
  { id: 'todas', label: 'Todas' },
];

const PATIO_ACTIONS = [
  { id: 'confirmada', label: 'Confirmada' },
  { id: 'en_taller', label: 'Atendido / En Taller' },
  { id: 'finalizada', label: 'Finalizada' },
  { id: 'no_asistio', label: 'No Asistió' },
];

function capitalizeEs(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ymdInTz(date, timeZone = WORKSHOP_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function addDaysYmd(ymd, days) {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymdInTz(dt, 'UTC');
}

function formatAgendaTime(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WORKSHOP_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const period = (
    parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  ).toUpperCase();
  return `${hour}:${minute} ${period}`.trim();
}

function formatDayTitle(ymd, todayYmd, tomorrowYmd, yesterdayYmd) {
  const dt = parseYmd(ymd);
  const weekday = capitalizeEs(
    new Intl.DateTimeFormat('es-MX', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(dt),
  );
  const datePart = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(dt);
  if (ymd === todayYmd) {
    return { kind: 'hoy', title: `Hoy — ${weekday} ${datePart}` };
  }
  if (ymd === tomorrowYmd) {
    return { kind: 'manana', title: `Mañana — ${weekday} ${datePart}` };
  }
  if (ymd === yesterdayYmd) {
    return { kind: 'ayer', title: `Ayer — ${weekday} ${datePart}` };
  }
  return { kind: 'otro', title: `${weekday}, ${datePart}` };
}

function displayClientName(name) {
  const s = String(name ?? '').trim();
  if (!s || s.toLowerCase() === 'cliente desconocido') return 'Cliente';
  return s;
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function telHref(phone) {
  const digits = digitsOnly(phone);
  return digits ? `tel:${digits}` : null;
}

function whatsappHref(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  let n = digits;
  if (n.startsWith('52') && n.length >= 12) {
    /* ya es MX con lada */
  } else if (n.length === 10) {
    n = `52${n}`;
  }
  return `https://wa.me/${n}`;
}

function patioValue(appointment) {
  const status = String(appointment.status ?? '').toLowerCase();
  const lead = String(appointment.leadStatus ?? '').toLowerCase();
  if (lead === 'no_asistio') return 'no_asistio';
  if (lead === 'en_taller') return 'en_taller';
  if (status === 'finalizada') return 'finalizada';
  if (lead === 'atendido') return 'en_taller';
  return 'confirmada';
}

function appointmentBadge(appointment) {
  const patio = patioValue(appointment);
  switch (patio) {
    case 'finalizada':
      return {
        label: 'Finalizada',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
      };
    case 'en_taller':
      return {
        label: 'En taller',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    case 'no_asistio':
      return {
        label: 'No asistió',
        className: 'bg-orange-50 text-orange-800 border-orange-200',
      };
    default:
      return {
        label:
          String(appointment.status ?? '') === 'pendiente'
            ? 'Pendiente'
            : 'Confirmada',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
  }
}

function matchesSearch(appointment, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    appointment.clientName,
    appointment.phone,
    appointment.vehicle,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

function inRange(ymd, range, todayYmd) {
  if (range === 'todas') return true;
  if (range === 'hoy') return ymd === todayYmd;
  const end = addDaysYmd(todayYmd, 6);
  return ymd >= todayYmd && ymd <= end;
}

function matchesStatusFilter(appointment, statusFilter) {
  const st = String(appointment.status ?? '').toLowerCase();
  if (statusFilter === 'finalizadas') return st === 'finalizada';
  if (statusFilter === 'confirmadas') return st !== 'finalizada';
  return true;
}

function PillGroup({ options, value, onChange, ariaLabel }) {
  return (
    <div
      className="inline-flex flex-wrap rounded-full border border-gray-200 bg-gray-50 p-0.5"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AppointmentRow({ appointment, busy, onPatioChange }) {
  const when = new Date(appointment.scheduledAt);
  const timeLabel = Number.isNaN(when.getTime())
    ? '—'
    : formatAgendaTime(when);
  const badge = appointmentBadge(appointment);
  const name = displayClientName(appointment.clientName);
  const phone = String(appointment.phone ?? '').trim();
  const callUrl = telHref(phone);
  const waUrl = whatsappHref(phone);
  const chatTo = appointment.conversationId
    ? `/?conversation=${encodeURIComponent(appointment.conversationId)}`
    : null;
  const patio = patioValue(appointment);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md lg:flex-row lg:items-center lg:gap-5">
      <div className="flex items-center gap-3 lg:w-36 lg:shrink-0 lg:flex-col lg:items-start lg:gap-1.5">
        <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">
          {timeLabel}
        </p>
        <span
          className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-gray-900">{name}</h3>
        <p className="mt-0.5 truncate text-sm text-gray-600">
          {appointment.vehicle ? (
            appointment.vehicle
          ) : (
            <span className="italic text-gray-400">Vehículo no indicado</span>
          )}
        </p>
        {appointment.quoteSummary ? (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {appointment.quoteSummary}
          </p>
        ) : (
          <p className="mt-1 text-xs italic text-gray-400">
            Sin resumen de cotización
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5 lg:w-48 lg:shrink-0">
        {callUrl ? (
          <a
            href={callUrl}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-800 hover:text-emerald-700"
          >
            <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="truncate">{phone}</span>
          </a>
        ) : (
          <span className="text-xs italic text-gray-400">Sin teléfono</span>
        )}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            WhatsApp
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:w-56 lg:shrink-0 lg:flex-col lg:items-stretch">
        {chatTo ? (
          <Link
            to={chatTo}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ver chat
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
            Sin chat
          </span>
        )}
        <label className="block min-w-0">
          <span className="sr-only">Estado de patio</span>
          <select
            value={patio}
            disabled={busy}
            onChange={(e) => onPatioChange(appointment, e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-900 shadow-sm disabled:opacity-60"
          >
            {PATIO_ACTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

export default function CalendarPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('semana');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [busyId, setBusyId] = useState(null);

  const todayYmdValue = ymdInTz(new Date());
  const tomorrowYmd = addDaysYmd(todayYmdValue, 1);
  const yesterdayYmd = addDaysYmd(todayYmdValue, -1);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [aptRes, convRes] = await Promise.all([
        apiFetchWebhook('/appointments'),
        apiFetchWebhook('/conversations'),
      ]);
      if (!aptRes.ok) throw new Error(`HTTP ${aptRes.status}`);
      const data = await aptRes.json();
      const appointments = Array.isArray(data) ? data : [];
      let leadByConv = new Map();
      if (convRes.ok) {
        const convs = await convRes.json();
        if (Array.isArray(convs)) {
          leadByConv = new Map(
            convs.map((c) => [c.id, c.status ?? null]),
          );
        }
      }
      setItems(
        appointments.map((a) => ({
          ...a,
          leadStatus: a.conversationId
            ? leadByConv.get(a.conversationId) ?? null
            : null,
        })),
      );
    } catch (e) {
      if (!silent) {
        setError(e?.message ?? 'Error al cargar citas');
        setItems([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = io(API_ORIGIN_URL, { transports: ['websocket'] });
    const onRefresh = () => {
      void load({ silent: true });
    };
    socket.on('appointmentCreated', onRefresh);
    socket.on('conversationLeadUpdated', onRefresh);
    return () => {
      socket.off('appointmentCreated', onRefresh);
      socket.off('conversationLeadUpdated', onRefresh);
      socket.disconnect();
    };
  }, [load]);

  const metrics = useMemo(() => {
    const weekEnd = addDaysYmd(todayYmdValue, 6);
    let todayCount = 0;
    let weekUpcoming = 0;
    for (const a of items) {
      const when = new Date(a.scheduledAt);
      if (Number.isNaN(when.getTime())) continue;
      const ymd = ymdInTz(when);
      if (ymd === todayYmdValue) todayCount += 1;
      else if (ymd > todayYmdValue && ymd <= weekEnd) weekUpcoming += 1;
    }
    return { todayCount, weekUpcoming };
  }, [items, todayYmdValue]);

  const grouped = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const ta = new Date(a.scheduledAt).getTime();
      const tb = new Date(b.scheduledAt).getTime();
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });

    const buckets = new Map();
    for (const a of sorted) {
      if (!matchesSearch(a, query)) continue;
      if (!matchesStatusFilter(a, statusFilter)) continue;
      const when = new Date(a.scheduledAt);
      if (Number.isNaN(when.getTime())) continue;
      const ymd = ymdInTz(when);
      if (!inRange(ymd, range, todayYmdValue)) continue;
      if (!buckets.has(ymd)) buckets.set(ymd, []);
      buckets.get(ymd).push(a);
    }

    return [...buckets.entries()].map(([ymd, appointments]) => ({
      ymd,
      appointments,
      ...formatDayTitle(ymd, todayYmdValue, tomorrowYmd, yesterdayYmd),
    }));
  }, [
    items,
    query,
    range,
    statusFilter,
    todayYmdValue,
    tomorrowYmd,
    yesterdayYmd,
  ]);

  const visibleCount = grouped.reduce(
    (n, g) => n + g.appointments.length,
    0,
  );

  const applyPatioAction = async (appointment, action) => {
    if (!action || action === patioValue(appointment) || busyId) return;
    setBusyId(appointment.id);
    try {
      if (action === 'confirmada' || action === 'finalizada') {
        const r = await apiFetchWebhook(`/appointments/${appointment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: action }),
        });
        if (!r.ok) throw new Error('patch');
        setItems((prev) =>
          prev.map((a) =>
            a.id === appointment.id
              ? {
                  ...a,
                  status: action,
                  leadStatus:
                    action === 'finalizada' ? 'atendido' : a.leadStatus,
                }
              : a,
          ),
        );
      } else if (
        (action === 'en_taller' || action === 'no_asistio') &&
        appointment.conversationId
      ) {
        const result = await transitionConversationStatus(
          appointment.conversationId,
          action,
        );
        setItems((prev) =>
          prev.map((a) =>
            a.id === appointment.id
              ? { ...a, leadStatus: result?.status ?? action }
              : a,
          ),
        );
      } else {
        throw new Error('Sin conversación vinculada');
      }
      await load({ silent: true });
    } catch {
      alert('No se pudo actualizar el estado');
      await load({ silent: true });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white px-4 py-4 shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Calendario de citas
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Agenda operativa del patio, agrupada por día.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[7.5rem] rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Citas hoy
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                  {loading ? '…' : metrics.todayCount}
                </p>
              </div>
              <div className="min-w-[7.5rem] rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Próximas en la semana
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-gray-900">
                  {loading ? '…' : metrics.weekUpcoming}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative block min-w-0 flex-1 xl:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente, teléfono o vehículo"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-sky-500/20 transition placeholder:text-gray-400 focus:border-sky-300 focus:bg-white focus:ring-4"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <PillGroup
                options={RANGE_OPTIONS}
                value={range}
                onChange={setRange}
                ariaLabel="Rango temporal"
              />
              <PillGroup
                options={STATUS_FILTERS}
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filtro de estado"
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {loading ? (
            <p className="py-16 text-center text-sm text-gray-500">
              Cargando agenda…
            </p>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
              <button
                type="button"
                onClick={() => void load()}
                className="ml-3 font-medium underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          ) : visibleCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <CalendarDays className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h2 className="mt-4 text-base font-semibold text-gray-900">
                No hay citas en este recorte
              </h2>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                {items.length === 0
                  ? 'Cuando el autopilot o el equipo agenden una visita, aparecerá aquí en orden cronológico.'
                  : 'Prueba otro rango, quita el filtro de estado o ajusta la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map((group) => (
                <section key={group.ymd}>
                  <header
                    className={`mb-3 flex items-center gap-3 ${
                      group.kind === 'hoy' ? 'text-indigo-800' : 'text-gray-800'
                    }`}
                  >
                    <span
                      className={`h-6 w-1 rounded-full ${
                        group.kind === 'hoy'
                          ? 'bg-indigo-500'
                          : group.kind === 'manana'
                            ? 'bg-sky-400'
                            : 'bg-gray-300'
                      }`}
                      aria-hidden
                    />
                    <h2 className="text-sm font-semibold tracking-tight">
                      {group.title}
                    </h2>
                    <span className="text-xs tabular-nums text-gray-400">
                      {group.appointments.length}
                    </span>
                  </header>
                  <div className="space-y-3">
                    {group.appointments.map((a) => (
                      <AppointmentRow
                        key={a.id}
                        appointment={a}
                        busy={busyId === a.id}
                        onPatioChange={applyPatioAction}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
