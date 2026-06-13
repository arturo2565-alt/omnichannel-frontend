import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetchOrigin } from './apiClient.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import {
  computeIntegralPrice,
  computePiecePrice,
  DAMAGE_MAGNITUDES,
  DAMAGE_MAGNITUDE_LABELS,
  formatMx,
  INTEGRAL_PREVIEW_SCENARIOS,
  mergeRules,
  PREVIEW_SCENARIOS,
  SIZE_TIER_LABELS,
} from './catalog-pricing.js';

const TABS = [
  { id: 'rules', label: 'Reglas globales' },
  { id: 'pieces', label: 'Piezas (base)' },
  { id: 'integral', label: 'Servicios integrales' },
  { id: 'simulator', label: 'Simulador' },
];

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

async function parseJsonError(res) {
  const raw = await res.text().catch(() => '');
  let msg = raw?.trim() || `Error ${res.status}`;
  try {
    const j = JSON.parse(raw);
    if (j?.message != null) {
      msg = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
    }
  } catch {
    /* plain */
  }
  if (msg.length > 360) msg = `${msg.slice(0, 360)}…`;
  return msg;
}

export default function CatalogAdminPage() {
  const [tab, setTab] = useState('rules');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);

  const [rules, setRules] = useState(() => mergeRules(null));
  const [rulesBaseline, setRulesBaseline] = useState(() => mergeRules(null));

  const [pieceBases, setPieceBases] = useState([]);
  const [pieceBaseline, setPieceBaseline] = useState(() => new Map());

  const [integralBases, setIntegralBases] = useState([]);
  const [integralBaseline, setIntegralBaseline] = useState(() => new Map());

  const [savingRules, setSavingRules] = useState(false);
  const [savingPieces, setSavingPieces] = useState(false);
  const [savingIntegral, setSavingIntegral] = useState(false);
  const [integralSeedSubmitting, setIntegralSeedSubmitting] = useState(false);
  const [seedMessage, setSeedMessage] = useState(null);

  const [simPiece, setSimPiece] = useState('');
  const [simBase, setSimBase] = useState(2900);
  const [simSize, setSimSize] = useState('Mediano');
  const [simPremium, setSimPremium] = useState(false);
  const [simSeverity, setSimSeverity] = useState('LEVE');

  const load = useCallback(async () => {
    setError(null);
    setSaveOk(false);
    setLoading(true);
    try {
      const viewRes = await apiFetchOrigin('/catalog/catalog-view');
      if (!viewRes.ok) throw new Error(await parseJsonError(viewRes));
      const view = await viewRes.json();

      const mergedRules = mergeRules(view.rules);
      setRules(mergedRules);
      setRulesBaseline(mergedRules);

      const bases = Array.isArray(view.pieceBases) ? view.pieceBases : [];
      setPieceBases(bases.map((p) => ({ ...p, basePrice: p.basePrice ?? 0 })));
      const pbMap = new Map();
      for (const p of bases) {
        pbMap.set(p.servicio, { basePrice: p.basePrice, diasEntrega: p.diasEntrega });
      }
      setPieceBaseline(pbMap);

      const integrals = Array.isArray(view.integralBases) ? view.integralBases : [];
      setIntegralBases(
        integrals.map((p) => ({ ...p, basePrice: p.basePrice ?? 0 })),
      );
      const ibMap = new Map();
      for (const p of integrals) {
        ibMap.set(p.servicio, { basePrice: p.basePrice, diasEntrega: p.diasEntrega });
      }
      setIntegralBaseline(ibMap);

      if (bases.length && !simPiece) {
        setSimPiece(bases[0].servicio);
        setSimBase(bases[0].basePrice ?? 2900);
      }
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, [simPiece]);

  useEffect(() => {
    void load();
  }, [load]);

  const rulesDirty = useMemo(
    () => JSON.stringify(rules) !== JSON.stringify(rulesBaseline),
    [rules, rulesBaseline],
  );

  const piecesDirty = useMemo(() => {
    for (const p of pieceBases) {
      const b = pieceBaseline.get(p.servicio);
      if (!b) return true;
      if (b.basePrice !== p.basePrice || b.diasEntrega !== p.diasEntrega) return true;
    }
    return false;
  }, [pieceBases, pieceBaseline]);

  const integralDirty = useMemo(() => {
    for (const p of integralBases) {
      const b = integralBaseline.get(p.servicio);
      if (!b) return true;
      if (b.basePrice !== p.basePrice || b.diasEntrega !== p.diasEntrega) return true;
    }
    return false;
  }, [integralBases, integralBaseline]);

  const handleSaveRules = async () => {
    setSavingRules(true);
    setError(null);
    try {
      const r = await apiFetchOrigin('/catalog/pricing-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      const data = await r.json();
      const merged = mergeRules(data.rules);
      setRules(merged);
      setRulesBaseline(merged);
      setSaveOk(true);
    } catch (e) {
      setError(e?.message ?? 'Error al guardar reglas');
    } finally {
      setSavingRules(false);
    }
  };

  const handleSavePieces = async () => {
    setSavingPieces(true);
    setError(null);
    try {
      const updates = pieceBases.map((p) => ({
        servicio: p.servicio,
        basePrice: p.basePrice,
        diasEntrega: p.diasEntrega,
        matrixRowId: p.matrixRowId,
      }));
      const r = await apiFetchOrigin('/catalog/piece-bases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      await load();
      setSaveOk(true);
    } catch (e) {
      setError(e?.message ?? 'Error al guardar piezas');
    } finally {
      setSavingPieces(false);
    }
  };

  const handleSaveIntegral = async () => {
    setSavingIntegral(true);
    setError(null);
    try {
      const updates = integralBases.map((p) => ({
        servicio: p.servicio,
        basePrice: p.basePrice,
        diasEntrega: p.diasEntrega,
        matrixRowId: p.matrixRowId,
      }));
      const r = await apiFetchOrigin('/catalog/integral-bases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      await load();
      setSaveOk(true);
    } catch (e) {
      setError(e?.message ?? 'Error al guardar servicios integrales');
    } finally {
      setSavingIntegral(false);
    }
  };

  const handleSeedIntegralServices = async () => {
    setIntegralSeedSubmitting(true);
    setError(null);
    try {
      const r = await apiFetchOrigin('/catalog/seed-instant-quote-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      const data = await r.json();
      setSeedMessage(
        `Servicios integrales: ${data?.upserted ?? 0} fila(s). Total en BD: ${data?.totalInDb ?? ''}.`,
      );
      await load();
    } catch (err) {
      setError(err?.message ?? 'No se pudo cargar el seed');
    } finally {
      setIntegralSeedSubmitting(false);
    }
  };

  const simResult = useMemo(
    () =>
      computePiecePrice({
        basePrice: simBase,
        sizeTier: simSize,
        isPremium: simPremium,
        damageMagnitude: simSeverity,
        rules,
      }),
    [simBase, simSize, simPremium, simSeverity, rules],
  );

  const simBreakdown = useMemo(() => {
    const r = mergeRules(rules);
    const base = Math.max(0, Math.round(Number(simBase) || 0));
    const afterSize = Math.round(base * (r.sizeTierFactors[simSize] ?? 1));
    const afterPrem = simPremium
      ? Math.round(afterSize * r.premiumFactor)
      : afterSize;
    const afterSev = Math.round(afterPrem * (r.severityFactors[simSeverity] ?? 1));
    return { base, afterSize, afterPrem, afterSev };
  }, [simBase, simSize, simPremium, simSeverity, rules]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Administración
            </p>
            <h1 className="text-xl font-bold text-gray-900">Catálogo de precios</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Base por pieza o servicio integral + multiplicadores (tamaño, premium; severidad solo
              en piezas).
            </p>
            <nav className="mt-4 flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    tab === t.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 overflow-auto px-4 py-6">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}
          {saveOk ? (
            <p className="mb-4 text-sm font-medium text-emerald-700" role="status">
              Cambios guardados.
            </p>
          ) : null}
          {seedMessage ? (
            <p className="mb-4 text-sm text-sky-800">{seedMessage}</p>
          ) : null}

          {loading ? (
            <p className="text-center text-gray-500">Cargando catálogo…</p>
          ) : tab === 'rules' ? (
            <section className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Tamaño de vehículo</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Multiplicador sobre precio base compacto estándar.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(SIZE_TIER_LABELS).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-sm font-semibold text-gray-700">{label}</span>
                      <input
                        type="number"
                        min={0.5}
                        max={3}
                        step={0.001}
                        value={rules.sizeTierFactors[key]}
                        onChange={(e) =>
                          setRules((prev) => ({
                            ...prev,
                            sizeTierFactors: {
                              ...prev.sizeTierFactors,
                              [key]: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Marca premium</h2>
                <label className="mt-3 block max-w-xs">
                  <span className="text-sm font-semibold text-gray-700">Factor premium (×)</span>
                  <input
                    type="number"
                    min={1}
                    max={2}
                    step={0.01}
                    value={rules.premiumFactor}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        premiumFactor: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Magnitud del daño</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Cuatro niveles. Leve = repintado express; muy fuerte = golpe profundo.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {DAMAGE_MAGNITUDES.map((mag) => (
                    <label key={mag} className="block">
                      <span className="text-sm font-semibold text-gray-700">
                        {DAMAGE_MAGNITUDE_LABELS[mag]}
                      </span>
                      <input
                        type="number"
                        min={mag === 'LEVE' ? 1 : 0.5}
                        max={3}
                        step={0.01}
                        disabled={mag === 'LEVE'}
                        value={rules.severityFactors[mag]}
                        onChange={(e) =>
                          setRules((prev) => ({
                            ...prev,
                            severityFactors: {
                              ...prev.severityFactors,
                              [mag]: Number(e.target.value),
                            },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={!rulesDirty || savingRules}
                  onClick={() => void handleSaveRules()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingRules ? 'Guardando…' : 'Guardar reglas'}
                </button>
              </div>
            </section>
          ) : tab === 'pieces' ? (
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Una fila = precio base (Compacto · Leve · estándar). Las columnas preview usan
                  las reglas globales.
                </p>
                <button
                  type="button"
                  disabled={!piecesDirty || savingPieces}
                  onClick={() => void handleSavePieces()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingPieces ? 'Guardando…' : 'Guardar bases'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Pieza</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">
                        Base MXN
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Días</th>
                      {PREVIEW_SCENARIOS.map((s) => (
                        <th
                          key={s.key}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-500"
                        >
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pieceBases.map((p) => (
                      <tr key={p.servicio} className="hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{p.servicio}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-24 rounded border border-gray-300 px-2 py-1"
                            value={p.basePrice}
                            onChange={(e) => {
                              const n = parsePositiveInt(e.target.value);
                              if (Number.isNaN(n)) return;
                              setPieceBases((prev) =>
                                prev.map((x) =>
                                  x.servicio === p.servicio ? { ...x, basePrice: n } : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded border border-gray-300 px-2 py-1"
                            value={p.diasEntrega}
                            onChange={(e) => {
                              const n = parsePositiveInt(e.target.value);
                              if (Number.isNaN(n)) return;
                              setPieceBases((prev) =>
                                prev.map((x) =>
                                  x.servicio === p.servicio ? { ...x, diasEntrega: n } : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        {PREVIEW_SCENARIOS.map((s) => (
                          <td
                            key={s.key}
                            className="whitespace-nowrap px-3 py-2 text-gray-700"
                          >
                            {formatMx(
                              computePiecePrice({
                                basePrice: p.basePrice,
                                sizeTier: s.sizeTier,
                                isPremium: s.isPremium,
                                damageMagnitude: s.magnitude,
                                rules,
                              }),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pieceBases.length === 0 ? (
                  <p className="px-4 py-8 text-center text-gray-500">
                    Sin piezas base en catálogo.
                  </p>
                ) : null}
              </div>
            </section>
          ) : tab === 'integral' ? (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Baño de pintura, estética y cerámico. Una base (Compacto · estándar); el motor
                  aplica tamaño y premium. Sin severidad de daño.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSeedIntegralServices()}
                    disabled={integralSeedSubmitting}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950"
                  >
                    {integralSeedSubmitting ? 'Cargando…' : 'Cargar seed'}
                  </button>
                  <button
                    type="button"
                    disabled={!integralDirty || savingIntegral}
                    onClick={() => void handleSaveIntegral()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingIntegral ? 'Guardando…' : 'Guardar bases'}
                  </button>
                </div>
              </div>
              {seedMessage ? (
                <p className="mb-3 text-sm text-sky-800">{seedMessage}</p>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Servicio</th>
                      <th className="px-3 py-2 text-left">Base (MXN)</th>
                      <th className="px-3 py-2 text-left">Días</th>
                      {INTEGRAL_PREVIEW_SCENARIOS.map((sc) => (
                        <th key={sc.key} className="px-3 py-2 text-left text-xs">
                          {sc.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {integralBases.map((row) => (
                      <tr key={row.servicio}>
                        <td className="px-3 py-2 font-medium">{row.servicio}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-28 rounded border px-2 py-1"
                            value={row.basePrice}
                            onChange={(e) => {
                              const n = parsePositiveInt(e.target.value);
                              if (Number.isNaN(n)) return;
                              setIntegralBases((prev) =>
                                prev.map((r) =>
                                  r.servicio === row.servicio ? { ...r, basePrice: n } : r,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded border px-2 py-1"
                            value={row.diasEntrega}
                            onChange={(e) => {
                              const n = parsePositiveInt(e.target.value);
                              if (Number.isNaN(n)) return;
                              setIntegralBases((prev) =>
                                prev.map((r) =>
                                  r.servicio === row.servicio ? { ...r, diasEntrega: n } : r,
                                ),
                              );
                            }}
                          />
                        </td>
                        {INTEGRAL_PREVIEW_SCENARIOS.map((sc) => (
                          <td key={sc.key} className="px-3 py-2 text-gray-700">
                            {formatMx(
                              computeIntegralPrice({
                                basePrice: row.basePrice,
                                sizeTier: sc.sizeTier,
                                isPremium: sc.isPremium,
                                rules,
                              }),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {integralBases.length === 0 ? (
                  <p className="px-4 py-8 text-center text-gray-500">
                    Sin servicios integrales. Usa &quot;Cargar seed&quot; para baño, estética y
                    cerámico.
                  </p>
                ) : null}
              </div>
            </section>
          ) : tab === 'simulator' ? (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">Simulador</h2>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Pieza</span>
                    <select
                      value={simPiece}
                      onChange={(e) => {
                        const svc = e.target.value;
                        setSimPiece(svc);
                        const hit = pieceBases.find((p) => p.servicio === svc);
                        if (hit) setSimBase(hit.basePrice);
                      }}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      {pieceBases.map((p) => (
                        <option key={p.servicio} value={p.servicio}>
                          {p.servicio}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Precio base</span>
                    <input
                      type="number"
                      min={0}
                      value={simBase}
                      onChange={(e) => setSimBase(parsePositiveInt(e.target.value) || 0)}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Tamaño</span>
                    <select
                      value={simSize}
                      onChange={(e) => setSimSize(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      {Object.keys(SIZE_TIER_LABELS).map((k) => (
                        <option key={k} value={k}>
                          {SIZE_TIER_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={simPremium}
                      onChange={(e) => setSimPremium(e.target.checked)}
                    />
                    <span className="text-sm font-semibold">Marca premium</span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-700">Severidad</span>
                    <select
                      value={simSeverity}
                      onChange={(e) => setSimSeverity(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      {DAMAGE_MAGNITUDES.map((m) => (
                        <option key={m} value={m}>
                          {DAMAGE_MAGNITUDE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
                <h3 className="font-bold text-emerald-900">Desglose</h3>
                <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                  <li>Base: {formatMx(simBreakdown.base)}</li>
                  <li>
                    × Tamaño ({simSize}): {formatMx(simBreakdown.afterSize)}
                  </li>
                  {simPremium ? (
                    <li>× Premium: {formatMx(simBreakdown.afterPrem)}</li>
                  ) : null}
                  <li>
                    × {DAMAGE_MAGNITUDE_LABELS[simSeverity]}: {formatMx(simBreakdown.afterSev)}
                  </li>
                  <li className="border-t border-emerald-200 pt-2 text-lg font-bold">
                    Total: {formatMx(simResult)}
                  </li>
                </ul>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
