import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetchOrigin } from './apiClient.js';
import { formatMx } from './catalog-pricing.js';

const CATEGORIAS = [
  { id: 'OPTICA', label: 'Óptica' },
  { id: 'COLISION', label: 'Colisión' },
  { id: 'ILUMINACION', label: 'Iluminación' },
  { id: 'PLASTICO', label: 'Plástico' },
];

function precioSugerido(costo, margen) {
  const base = Number(costo);
  const m = Number(margen);
  const safeBase = Number.isFinite(base) && base >= 0 ? base : 0;
  const safeMargen = Number.isFinite(m) ? m : 30;
  const raw = safeBase * (1 + safeMargen / 100);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
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

const EMPTY_FORM = {
  codigo: '',
  nombre: '',
  categoria: 'OPTICA',
  costoReferenciaBase: '',
  margenPorcentaje: '30',
};

export default function RefaccionesCatalogTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetchOrigin('/catalog/refacciones');
      if (!res.ok) throw new Error(await parseJsonError(res));
      const json = await res.json();
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el catálogo de refacciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const suggestedPreview = useMemo(
    () => precioSugerido(form.costoReferenciaBase, form.margenPorcentaje),
    [form.costoReferenciaBase, form.margenPorcentaje],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
    setError(null);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      codigo: row.codigo,
      nombre: row.nombre,
      categoria: row.categoria,
      costoReferenciaBase: String(row.costoReferenciaBase ?? ''),
      margenPorcentaje: String(row.margenPorcentaje ?? 30),
    });
    setModalOpen(true);
    setError(null);
  }

  async function submitForm(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const payload = {
        codigo: form.codigo,
        nombre: form.nombre,
        categoria: form.categoria,
        costoReferenciaBase: Number.parseInt(String(form.costoReferenciaBase), 10),
        margenPorcentaje: Number.parseInt(String(form.margenPorcentaje), 10),
      };
      if (!Number.isFinite(payload.costoReferenciaBase) || payload.costoReferenciaBase < 0) {
        throw new Error('Costo referencia debe ser un entero ≥ 0.');
      }
      if (!Number.isFinite(payload.margenPorcentaje)) {
        throw new Error('Margen debe ser un entero.');
      }
      const path = editingId
        ? `/catalog/refacciones/${editingId}`
        : '/catalog/refacciones';
      const res = await apiFetchOrigin(path, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await parseJsonError(res));
      setModalOpen(false);
      setOkMsg(editingId ? 'Refacción actualizada.' : 'Refacción agregada.');
      await load();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row) {
    if (!window.confirm(`¿Eliminar ${row.codigo} — ${row.nombre}?`)) return;
    setDeletingId(row.id);
    setError(null);
    setOkMsg(null);
    try {
      const res = await apiFetchOrigin(`/catalog/refacciones/${row.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await parseJsonError(res));
      setOkMsg('Refacción eliminada.');
      await load();
    } catch (err) {
      setError(err?.message || 'No se pudo eliminar.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Catálogo de Refacciones y Ópticas
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Precio sugerido al cliente = costo de referencia × (1 + margen / 100).
            Si no hay fila, el peritaje usa mercado MX (+30%, redondeo a $50).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Agregar Refacción
        </button>
      </div>

      {okMsg ? (
        <p className="text-sm font-medium text-emerald-700" role="status">
          {okMsg}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-center text-gray-500">Cargando refacciones…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-950">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nombre de la pieza</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Costo referencia (MXN)</th>
                <th className="px-4 py-3 text-right">Margen del taller (%)</th>
                <th className="px-4 py-3 text-right">Precio sugerido al cliente</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Aún no hay refacciones. Agrega faros, calaveras o plásticos.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const precio = Number.isFinite(Number(row.precioSugerido))
                    ? Number(row.precioSugerido)
                    : precioSugerido(row.costoReferenciaBase, row.margenPorcentaje);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-gray-50 last:border-0 dark:border-gray-800"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {row.codigo}
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                        {row.nombre}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          {row.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMx(row.costoReferenciaBase)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number.isFinite(Number(row.margenPorcentaje))
                          ? `${row.margenPorcentaje}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-800">
                        {formatMx(precio)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row)}
                            disabled={deletingId === row.id}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitForm}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {editingId ? 'Editar refacción' : 'Agregar Refacción'}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-1">
                <span className="text-sm font-semibold text-gray-700">Código</span>
                <input
                  required
                  value={form.codigo}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))
                  }
                  placeholder="FARO_IZQ"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="text-sm font-semibold text-gray-700">Categoría</span>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-semibold text-gray-700">
                  Nombre de la pieza
                </span>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Calavera Trasera Izquierda"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Costo referencia (MXN)
                </span>
                <input
                  required
                  type="number"
                  min={0}
                  step={1}
                  value={form.costoReferenciaBase}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, costoReferenciaBase: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Margen del taller (%)
                </span>
                <input
                  required
                  type="number"
                  min={0}
                  max={300}
                  step={1}
                  value={form.margenPorcentaje}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, margenPorcentaje: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Precio sugerido:{' '}
              <span className="font-bold text-emerald-800">
                {formatMx(suggestedPreview)}
              </span>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
