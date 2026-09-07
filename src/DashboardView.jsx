import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
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

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}

const EMPTY_KPIS = {
  pipelineActivo: 0,
  valorEnPatio: 0,
  tasaConversion: 0,
  leadsNuevos: 0,
};

function KpiCard({ label, value, hint }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </article>
  );
}

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
        pipelineActivo: Number(kpiData?.pipelineActivo) || 0,
        valorEnPatio: Number(kpiData?.valorEnPatio) || 0,
        tasaConversion: Number(kpiData?.tasaConversion) || 0,
        leadsNuevos: Number(kpiData?.leadsNuevos) || 0,
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
                Pipeline, conversión y prospectos de mayor valor.
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

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Pipeline activo"
              value={loading ? '…' : formatMxn(kpis.pipelineActivo)}
              hint="Cotizado y aún sin agendar"
            />
            <KpiCard
              label="Valor en patio"
              value={loading ? '…' : formatMxn(kpis.valorEnPatio)}
              hint="Leads en taller"
            />
            <KpiCard
              label="Tasa de conversión"
              value={loading ? '…' : formatPct(kpis.tasaConversion)}
              hint="Agendados / nuevos (30 días)"
            />
            <KpiCard
              label="Leads nuevos"
              value={loading ? '…' : String(kpis.leadsNuevos)}
              hint="Pendientes de cotizar"
            />
          </section>

          <section className="mt-8 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Prospectos de alto valor
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Conversaciones en cotizado, ordenadas por monto.
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
