import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { API_BASE_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { DAMAGE_LEVEL_KEYS, applyPriceMatrixFlatRows } from './autofix-pricing.js';

function coerceNum(v, fallback = 0) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

export default function CatalogPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seedMsg, setSeedMsg] = useState('');
  const [newRow, setNewRow] = useState({
    pieza: '',
    severidad: 'DM',
    precio: '',
    diasEntrega: '4',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
      applyPriceMatrixFlatRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el catálogo');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCell = async (id, patch) => {
    const r = await fetch(`${API_BASE_URL}/price-matrix/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(t || `Error ${r.status}`);
    }
    await load();
  };

  const handleBlurPrecio = async (row, e) => {
    const v = coerceNum(e.target.value, row.precio);
    if (v === row.precio) return;
    try {
      await saveCell(row.id, { precio: v });
    } catch (err) {
      setError(err?.message ?? 'Error al guardar');
      void load();
    }
  };

  const handleBlurDias = async (row, e) => {
    const v = Math.max(0, Math.round(coerceNum(e.target.value, row.diasEntrega)));
    if (v === row.diasEntrega) return;
    try {
      await saveCell(row.id, { diasEntrega: v });
    } catch (err) {
      setError(err?.message ?? 'Error al guardar');
      void load();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const pieza = String(newRow.pieza).trim();
    const precio = coerceNum(newRow.precio, NaN);
    const diasEntrega = Math.max(0, Math.round(coerceNum(newRow.diasEntrega, 4)));
    if (!pieza) {
      setError('Indica el nombre de la pieza o servicio.');
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setError('Precio inválido.');
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieza,
          severidad: newRow.severidad,
          precio,
          diasEntrega,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(t || `Error ${r.status}`);
      }
      setNewRow({ pieza: '', severidad: 'DM', precio: '', diasEntrega: '4' });
      await load();
    } catch (err) {
      setError(err?.message ?? 'Error al crear fila');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta fila del catálogo?')) return;
    setError('');
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix/${id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 204) {
        const t = await r.text().catch(() => '');
        throw new Error(t || `Error ${r.status}`);
      }
      await load();
    } catch (err) {
      setError(err?.message ?? 'Error al eliminar');
    }
  };

  const handleSeed = async () => {
    setSeedMsg('');
    setError('');
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix/seed-if-empty`, {
        method: 'POST',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message ?? `Error ${r.status}`);
      setSeedMsg(
        j.inserted > 0
          ? `Se insertaron ${j.inserted} filas iniciales.`
          : 'La tabla ya tenía datos; no se insertó nada.',
      );
      await load();
    } catch (err) {
      setError(err?.message ?? 'Error al sembrar');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
              Administración
            </p>
            <h1 className="text-xl font-bold text-gray-900">Catálogo de precios</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Matriz pieza × severidad (MXN) y días de entrega de referencia. Los cambios se usan de
              inmediato en nuevas cotizaciones.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              <NavLink to="/admin/ai-settings" className="text-indigo-600 underline">
                Volver a IA y variables
              </NavLink>
            </p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-8">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}
          {seedMsg ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              {seedMsg}
            </div>
          ) : null}

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={() => void handleSeed()}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100"
            >
              Sembrar matriz inicial (solo si está vacía)
            </button>
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Agregar pieza / servicio</h2>
            <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[180px]">
                <span className="text-xs font-semibold text-gray-600">Pieza</span>
                <input
                  value={newRow.pieza}
                  onChange={(e) => setNewRow((p) => ({ ...p, pieza: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. Parachoques"
                />
              </label>
              <label className="block w-32">
                <span className="text-xs font-semibold text-gray-600">Severidad</span>
                <select
                  value={newRow.severidad}
                  onChange={(e) => setNewRow((p) => ({ ...p, severidad: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                >
                  {DAMAGE_LEVEL_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-28">
                <span className="text-xs font-semibold text-gray-600">Precio MXN</span>
                <input
                  value={newRow.precio}
                  onChange={(e) => setNewRow((p) => ({ ...p, precio: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </label>
              <label className="block w-28">
                <span className="text-xs font-semibold text-gray-600">Días entrega</span>
                <input
                  value={newRow.diasEntrega}
                  onChange={(e) => setNewRow((p) => ({ ...p, diasEntrega: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700"
              >
                Agregar
              </button>
            </form>
          </section>

          <section className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Tabla de catálogo</h2>
              <p className="text-sm text-gray-500">
                {loading ? 'Cargando…' : `${rows.length} filas`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Pieza</th>
                    <th className="px-4 py-3">Severidad</th>
                    <th className="px-4 py-3">Precio (MXN)</th>
                    <th className="px-4 py-3">Días entrega</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-2 font-medium text-gray-900">{row.pieza}</td>
                      <td className="px-4 py-2 text-gray-700">{row.severidad}</td>
                      <td className="px-4 py-2">
                        <input
                          key={`${row.id}-p-${row.precio}`}
                          type="text"
                          defaultValue={String(Math.round(row.precio))}
                          className="w-28 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                          onBlur={(e) => void handleBlurPrecio(row, e)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          key={`${row.id}-d-${row.diasEntrega}`}
                          type="text"
                          defaultValue={String(row.diasEntrega ?? 4)}
                          className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
                          onBlur={(e) => void handleBlurDias(row, e)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
