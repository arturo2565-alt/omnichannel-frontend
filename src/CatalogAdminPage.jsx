import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_ORIGIN_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { DAMAGE_LEVEL_KEYS } from './autofix-pricing.js';

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
  const [rows, setRows] = useState([]);
  const [baseline, setBaseline] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    servicio: '',
    severidad: 'DM',
    precio: '0',
    diasEntrega: '4',
    isInstantService: false,
  });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [importLegacySubmitting, setImportLegacySubmitting] = useState(false);
  const [instantSeedSubmitting, setInstantSeedSubmitting] = useState(false);
  const [seedMessage, setSeedMessage] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setSaveOk(false);
    setLoading(true);
    try {
      const r = await fetch(`${API_ORIGIN_URL}/catalog/price-matrix`);
      if (!r.ok) throw new Error(await parseJsonError(r));
      const data = await r.json();
      const list = Array.isArray(data?.rows) ? data.rows : [];
      setRows(list);
      const m = new Map();
      for (const row of list) {
        m.set(row.id, {
          precio: row.precio,
          diasEntrega: row.diasEntrega,
          isInstantService: !!row.isInstantService,
        });
      }
      setBaseline(m);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el catálogo');
      setRows([]);
      setBaseline(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyUpdates = useMemo(() => {
    const out = [];
    for (const r of rows) {
      const b = baseline.get(r.id);
      if (!b) continue;
      if (
        b.precio !== r.precio ||
        b.diasEntrega !== r.diasEntrega ||
        !!b.isInstantService !== !!r.isInstantService
      ) {
        out.push({
          id: r.id,
          precio: r.precio,
          diasEntrega: r.diasEntrega,
          isInstantService: !!r.isInstantService,
        });
      }
    }
    return out;
  }, [rows, baseline]);

  const hasDirty = dirtyUpdates.length > 0;

  const updateCell = useCallback((id, field, rawValue) => {
    if (field === 'precio' || field === 'diasEntrega') {
      const n = parsePositiveInt(rawValue);
      if (Number.isNaN(n)) return;
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: n } : row)),
      );
      return;
    }
    if (field === 'isInstantService') {
      const v = Boolean(rawValue);
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, isInstantService: v } : row)),
      );
    }
  }, []);

  const handleSave = async () => {
    if (!hasDirty || saving) return;
    setSaving(true);
    setError(null);
    setSaveOk(false);
    setSeedMessage(null);
    try {
      const r = await fetch(`${API_ORIGIN_URL}/catalog/price-matrix`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: dirtyUpdates }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      const data = await r.json();
      const list = Array.isArray(data?.rows) ? data.rows : [];
      setRows(list);
      const m = new Map();
      for (const row of list) {
        m.set(row.id, {
          precio: row.precio,
          diasEntrega: row.diasEntrega,
          isInstantService: !!row.isInstantService,
        });
      }
      setBaseline(m);
      setSaveOk(true);
    } catch (e) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const servicio = addForm.servicio.trim();
    const severidad = addForm.severidad.trim();
    const precio = parsePositiveInt(addForm.precio);
    const diasEntrega = parsePositiveInt(addForm.diasEntrega);
    if (!servicio) {
      setError('Indica el nombre del servicio.');
      return;
    }
    if (Number.isNaN(precio) || Number.isNaN(diasEntrega)) {
      setError('Precio y días de entrega deben ser números enteros ≥ 0.');
      return;
    }
    setAddSubmitting(true);
    setError(null);
    setSeedMessage(null);
    try {
      const r = await fetch(`${API_ORIGIN_URL}/catalog/price-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio,
          severidad,
          precio,
          diasEntrega,
          isInstantService: addForm.isInstantService,
        }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      setAddOpen(false);
      setAddForm({
        servicio: '',
        severidad: 'DM',
        precio: '0',
        diasEntrega: '4',
        isInstantService: false,
      });
      await load();
    } catch (err) {
      setError(err?.message ?? 'No se pudo crear la fila');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleImportLegacyJs = async () => {
    setImportLegacySubmitting(true);
    setError(null);
    setSaveOk(false);
    setSeedMessage(null);
    try {
      const r = await fetch(`${API_ORIGIN_URL}/catalog/import-legacy-js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diasEntrega: 3 }),
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      await load();
    } catch (err) {
      setError(err?.message ?? 'No se pudo importar la matriz');
    } finally {
      setImportLegacySubmitting(false);
    }
  };

  const handleImportInstantQuote = async () => {
    setInstantSeedSubmitting(true);
    setError(null);
    setSaveOk(false);
    setSeedMessage(null);
    try {
      const r = await fetch(`${API_ORIGIN_URL}/catalog/seed-instant-quote-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error(await parseJsonError(r));
      const data = await r.json();
      const n = data?.upserted ?? 0;
      const total = data?.totalInDb ?? '';
      setSeedMessage(
        `InstantQuote: ${n} fila(s) actualizadas o insertadas. Total en catálogo: ${total}.`,
      );
      await load();
    } catch (err) {
      setError(err?.message ?? 'No se pudo cargar InstantQuote');
    } finally {
      setInstantSeedSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Administración
            </p>
            <h1 className="text-xl font-bold text-gray-900">Catálogo · matriz de precios</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Servicios y niveles de severidad. Edita precio, días e InstantQuote en línea. «Cargar
              InstantQuote» inserta baños de pintura por tamaño y Estética Automotriz, y sincroniza
              banderas (Cerámico, baños, estética = sí; hojalatería = no).
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleImportLegacyJs()}
                disabled={importLegacySubmitting}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
              >
                {importLegacySubmitting ? 'Importando…' : 'Importar desde archivo JS'}
              </button>
              <button
                type="button"
                onClick={() => void handleImportInstantQuote()}
                disabled={instantSeedSubmitting}
                className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-950 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
              >
                {instantSeedSubmitting ? 'Cargando…' : 'Cargar InstantQuote (baños + estética)'}
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100"
              >
                Agregar servicio
              </button>
              <button
                type="button"
                disabled={!hasDirty || saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {hasDirty ? (
                <span className="text-xs font-medium text-amber-700">
                  {dirtyUpdates.length} fila(s) modificada(s)
                </span>
              ) : null}
              {saveOk ? (
                <span className="text-xs font-medium text-emerald-700" role="status">
                  Cambios guardados.
                </span>
              ) : null}
              {seedMessage ? (
                <span className="text-xs font-medium text-sky-800" role="status">
                  {seedMessage}
                </span>
              ) : null}
            </div>
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

          {loading ? (
            <p className="text-center text-gray-500">Cargando matriz…</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Servicio
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Severidad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Precio (MXN)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Días entrega
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      InstantQuote
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => {
                    const b = baseline.get(row.id);
                    const rowDirty =
                      b &&
                      (b.precio !== row.precio ||
                        b.diasEntrega !== row.diasEntrega ||
                        !!b.isInstantService !== !!row.isInstantService);
                    return (
                      <tr
                        key={row.id}
                        className={rowDirty ? 'bg-amber-50/60' : 'hover:bg-gray-50/80'}
                      >
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                          {row.servicio ?? row.pieza}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                          {row.severidad}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                            value={row.precio}
                            onChange={(ev) => updateCell(row.id, 'precio', ev.target.value)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                            value={row.diasEntrega}
                            onChange={(ev) => updateCell(row.id, 'diasEntrega', ev.target.value)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                              checked={!!row.isInstantService}
                              onChange={(ev) =>
                                updateCell(row.id, 'isInstantService', ev.target.checked)
                              }
                            />
                            <span>{row.isInstantService ? 'Sí' : 'No'}</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-gray-500">No hay filas en la matriz.</p>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-service-title"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-service-title" className="text-lg font-bold text-gray-900">
              Agregar servicio
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Una fila = servicio + severidad + precio. Si la combinación ya existe, el servidor
              rechazará el duplicado.
            </p>
            <form className="mt-4 space-y-4" onSubmit={handleAdd}>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Servicio</span>
                <input
                  type="text"
                  value={addForm.servicio}
                  onChange={(e) => setAddForm((f) => ({ ...f, servicio: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                  placeholder="Ej. Guardafango delantero"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Severidad o tamaño (texto libre)
                </span>
                <input
                  type="text"
                  list="catalog-severidad-hints"
                  value={addForm.severidad}
                  onChange={(e) => setAddForm((f) => ({ ...f, severidad: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                  placeholder="DM, N/A, Chico, Mediano Premium…"
                />
                <datalist id="catalog-severidad-hints">
                  {DAMAGE_LEVEL_KEYS.map((k) => (
                    <option key={k} value={k} />
                  ))}
                  <option value="Chico" />
                  <option value="Chico Premium" />
                  <option value="Mediano" />
                  <option value="Mediano Premium" />
                  <option value="Grande" />
                  <option value="Grande Premium" />
                  <option value="XL" />
                  <option value="XL Premium" />
                </datalist>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  checked={addForm.isInstantService}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, isInstantService: e.target.checked }))
                  }
                />
                <span className="text-sm font-semibold text-gray-700">InstantQuote</span>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Precio (MXN)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={addForm.precio}
                  onChange={(e) => setAddForm((f) => ({ ...f, precio: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Días de entrega</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={addForm.diasEntrega}
                  onChange={(e) => setAddForm((f) => ({ ...f, diasEntrega: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                  required
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {addSubmitting ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
