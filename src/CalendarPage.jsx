import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { apiFetchWebhook } from './apiClient.js';
import { API_ORIGIN_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';

const STATUS_LABEL = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  finalizada: 'Finalizada',
};

function statusBadgeClass(status) {
  switch (status) {
    case 'confirmada':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'finalizada':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    default:
      return 'bg-amber-50 text-amber-900 border-amber-200';
  }
}

export default function CalendarPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetchWebhook('/appointments');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message ?? 'Error al cargar citas');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = io(API_ORIGIN_URL, { transports: ['websocket'] });
    const onAppointment = () => {
      void load();
    };
    socket.on('appointmentCreated', onAppointment);
    socket.on('conversationLeadUpdated', (payload) => {
      if (String(payload?.status ?? '').toLowerCase() === 'agendado') {
        void load();
      }
    });
    return () => {
      socket.off('appointmentCreated', onAppointment);
      socket.disconnect();
    };
  }, [load]);

  const patchStatus = async (id, status) => {
    try {
      const r = await apiFetchWebhook(`/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error('patch');
      await load();
    } catch {
      alert('No se pudo actualizar el estado');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white px-6 py-4 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Calendario de citas</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Citas registradas por la IA y el equipo.
          </p>
        </header>

      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-8">
        {loading ? (
          <p className="text-center text-gray-500">Cargando citas…</p>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500">
            No hay citas registradas todavía.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => {
              const when = new Date(a.scheduledAt);
              const timeStr = when.toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              const chatTo =
                a.conversationId != null
                  ? `/?conversation=${encodeURIComponent(a.conversationId)}`
                  : null;
              const canCall =
                typeof a.phone === 'string' && a.phone.trim().length > 0;

              return (
                <article
                  key={a.id}
                  className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">
                      {a.clientName || 'Cliente'}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(a.status)}`}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Hora:</span>{' '}
                    {timeStr}
                  </p>
                  {a.vehicle ? (
                    <p className="mt-1 text-sm text-gray-600">
                      <span className="font-medium text-gray-700">
                        Vehículo:
                      </span>{' '}
                      {a.vehicle}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs italic text-gray-400">
                      Vehículo no indicado
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {canCall ? (
                      <a
                        href={`tel:${a.phone.trim()}`}
                        className="inline-flex items-center justify-center rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700"
                      >
                        Llamar
                      </a>
                    ) : (
                      <span
                        className="inline-flex cursor-not-allowed items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400"
                        title="Sin teléfono registrado"
                      >
                        Sin teléfono
                      </span>
                    )}
                    {chatTo ? (
                      <Link
                        to={chatTo}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        Ver chat
                      </Link>
                    ) : (
                      <span
                        className="inline-flex cursor-not-allowed items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400"
                        title="Sin conversación vinculada"
                      >
                        Sin chat
                      </span>
                    )}
                  </div>

                  <label className="mt-3 flex flex-col gap-1 text-[11px] text-gray-500">
                    Estado
                    <select
                      value={a.status}
                      onChange={(e) => patchStatus(a.id, e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="confirmada">Confirmada</option>
                      <option value="finalizada">Finalizada</option>
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
