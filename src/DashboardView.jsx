import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import { fetchHotLeads, fetchKpis } from './apiClient.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const DATE_FMT = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatMxn(value) {
  const n = Number(value);
  return MXN.format(Number.isFinite(n) ? n : 0);
}

function formatQuoteDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return DATE_FMT.format(d);
}

function formatRoi(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0×';
  return `${n.toLocaleString('es-MX', {
    maximumFractionDigits: 1,
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
  })}×`;
}

function stepRate(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev <= 0) return null;
  return Math.round((cur / prev) * 1000) / 10;
}

function formatStepPct(rate) {
  if (rate == null) return '—';
  return `${rate.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}

const EMPTY_KPIS = {
  leadsAtendidos: 0,
  cotizaciones: 0,
  citas: 0,
  llegaron: 0,
  trabajosVendidos: 0,
  ventasGeneradas: 0,
  roiPegazuz: 0,
};

const FUNNEL_STEPS = [
  { key: 'leadsAtendidos', label: 'Leads atendidos', hint: 'Conversaciones del taller' },
  { key: 'cotizaciones', label: 'Cotizaciones', hint: 'Precio enviado' },
  { key: 'citas', label: 'Citas agendadas', hint: 'Turnos confirmados' },
  { key: 'llegaron', label: 'Llegaron al taller', hint: 'Clientes que asistieron' },
  { key: 'trabajosVendidos', label: 'Trabajos vendidos', hint: 'En taller o completados' },
];

export default function DashboardView() {
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [hotLeads, setHotLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, leads] = await Promise.all([
        fetchKpis(),
        fetchHotLeads(10),
      ]);
      setKpis({
        leadsAtendidos: Number(kpiData?.leadsAtendidos) || 0,
        cotizaciones: Number(kpiData?.cotizaciones) || 0,
        citas: Number(kpiData?.citas) || 0,
        llegaron: Number(kpiData?.llegaron) || 0,
        trabajosVendidos: Number(kpiData?.trabajosVendidos) || 0,
        ventasGeneradas: Number(kpiData?.ventasGeneradas) || 0,
        roiPegazuz: Number(kpiData?.roiPegazuz) || 0,
      });
      setHotLeads(Array.isArray(leads) ? leads : []);
    } catch (e) {
      setError(e?.message ?? 'No se pudieron cargar las métricas');
      setKpis(EMPTY_KPIS);
      setHotLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const funnel = useMemo(
    () =>
      FUNNEL_STEPS.map((step, index) => {
        const value = kpis[step.key] ?? 0;
        const prevValue =
          index === 0 ? null : (kpis[FUNNEL_STEPS[index - 1].key] ?? 0);
        return {
          ...step,
          value,
          rate: index === 0 ? null : stepRate(value, prevValue),
        };
      }),
    [kpis],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white px-6 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 hidden h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 sm:inline-flex">
              <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Embudo de conversión, ventas y prospectos de mayor valor.
              </p>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-8">
          {error ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
              <button
                type="button"
                onClick={() => void load()}
                className="ml-3 font-medium underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-gray-900 bg-gray-900 px-6 py-6 text-white shadow-sm sm:px-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
              Impacto financiero
            </p>
            <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-gray-400">Ventas generadas</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                  {loading ? '…' : formatMxn(kpis.ventasGeneradas)}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  ROI Pegazuz
                </p>
                <span className="inline-flex items-center rounded-full bg-emerald-400 px-3.5 py-1.5 text-lg font-bold tabular-nums text-gray-950">
                  {loading ? '…' : formatRoi(kpis.roiPegazuz)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Retorno generado sobre el costo de la plataforma.
            </p>
          </section>

          <section className="mt-8">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Embudo de conversión
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Del primer contacto al trabajo vendido. El porcentaje es el paso
                respecto a la etapa anterior.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {funnel.map((step, index) => (
                <article
                  key={step.key}
                  className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  {index > 0 ? (
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 xl:mb-2">
                      <ChevronRight
                        className="hidden h-3.5 w-3.5 text-gray-300 xl:inline"
                        strokeWidth={2}
                      />
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 tabular-nums text-gray-600">
                        {loading ? '…' : formatStepPct(step.rate)}
                      </span>
                      <span className="text-gray-400">del paso anterior</span>
                    </div>
                  ) : (
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400 xl:mb-2">
                      Inicio
                    </p>
                  )}
                  <p className="text-xs font-medium text-gray-500">{step.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-gray-900">
                    {loading ? '…' : step.value.toLocaleString('es-MX')}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">{step.hint}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Prospectos de alto valor
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Conversaciones cotizadas, ordenadas por monto.
              </p>
            </div>

            {loading ? (
              <p className="px-5 py-10 text-center text-sm text-gray-500">
                Cargando prospectos…
              </p>
            ) : hotLeads.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-500">
                No hay prospectos pendientes por ahora.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Cliente</th>
                      <th className="px-5 py-3">Fecha de cotización</th>
                      <th className="px-5 py-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hotLeads.map((lead) => (
                      <tr
                        key={lead.conversationId}
                        className="bg-white transition hover:bg-sky-50/60"
                      >
                        <td className="px-5 py-3 font-medium text-gray-900">
                          <Link
                            to={`/?conversation=${encodeURIComponent(lead.conversationId)}`}
                            className="hover:text-sky-700 hover:underline"
                          >
                            {lead.contactName?.trim() || 'Cliente'}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-gray-600">
                          {formatQuoteDate(lead.lastEventAt)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatMxn(lead.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
