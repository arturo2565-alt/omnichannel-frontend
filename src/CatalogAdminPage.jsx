import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { DAMAGE_LEVEL_KEYS, loadPriceMatrixFromBackend } from './autofix-pricing.js';

function formatMx(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(x);
}

export default function CatalogAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({
    pieza: '',
    severidad: 'DM',
    precio: '',
    diasEntrega: '4',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix`);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(t || `Error ${r.status}`);
      }
      const data = await r.json();
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchCell = async (id, body) => {
    setSavingId(id);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/price-matrix/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(t || `Error ${r.status}`);
      }
      const updated = await r.json();
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)));
      await loadPriceMatrixFromBackend();
    } catch (e) {
      setError(e?.message ?? 'Error al guardar');
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const pieza = String(newRow.pieza ?? '').trim();
    if (!pieza) {
      setError('Indica el nombre de la pieza o servicio.');
      return;
    }
    const precio = Math.round(Number(String(newRow.precio).replace(/,/g, '')));
    if (!Number.isFinite(precio) || precio < 0) {
      setError('Precio inválido.');
      return;
    }
    const diasEntrega = Math.round(Number(newRow.diasEntrega));
    if (!Number.isFinite(diasEntrega) || diasEntrega < 0 || diasEntrega > 365) {
      setError('Días de entrega: usa un entero entre 0 y 365.');
      return;
    }
    setAdding(true);
    setError(null);
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
      await load();
      await loadPriceMatrixFromBackend();
      setNewRow({ pieza: '', severidad: 'DM', precio: '', diasEntrega: '4' });
    } catch (e) {
      setError(e?.message ?? 'No se pudo crear la fila');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              Administración
            </p>
            <h1 className="text-xl font-bold text-gray-900">Catálogo de precios y tiempos</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Matriz pieza × severidad (MXN y días hábiles aproximados). Los cambios aplican al cotizador y al
              playground tras guardar.
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

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-lg font-bold text-gray-900">Agregar pieza / servicio</h2>
              <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Pieza</span>
                  <input
                    value={newRow.pieza}
                    onChange={(e) => setNewRow((p) => ({ ...p, pieza: e.target.value }))}
                    className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Ej. Bumper delantero"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Severidad</span>
                  <select
                    value={newRow.severidad}
                    onChange={(e) => setNewRow((p) => ({ ...p, severidad: e.target.value }))}
                    className="mt-1 block w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {DAMAGE_LEVEL_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Precio (MXN)</span>
                  <input
                    type="number"
                    min={0}
                    value={newRow.precio}
                    onChange={(e) => setNewRow((p) => ({ ...p, precio: e.target.value }))}
                    className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Días entrega</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={newRow.diasEntrega}
                    onChange={(e) => setNewRow((p) => ({ ...p, diasEntrega: e.target.value }))}
                    className="mt-1 block w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={adding}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adding ? 'Guardando…' : 'Agregar nueva pieza/servicio'}
                </button>
              </form>
            </div>
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-bold text-gray-900">Tabla de catálogo</h2>
              <p className="text-xs text-gray-500">
                {rows.length} filas · edita y pulsa Enter o sal del campo para guardar
              </p>
            </div>
            {loading ? (
              <p className="p-8 text-center text-gray-500">Cargando…</p>
            ) : rows.length === 0 ? (
              <div className="space-y-2 p-8 text-center text-sm text-amber-800">
                <p>No hay filas en la base de datos.</p>
                <p className="text-gray-600">
                  En el backend, ejecuta{' '}
                  <code className="rounded bg-gray-100 px-1 text-xs">
                    npm run seed:price-matrix
                  </code>{' '}
                  con <code className="rounded bg-gray-100 px-1 text-xs">DATABASE_URL</code> para
                  importar la matriz que antes estaba en código. Hasta entonces el servidor usa la
                  misma matriz solo en memoria.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-3">Pieza</th>
                      <th className="px-4 py-3">Severidad</th>
                      <th className="px-4 py-3">Precio</th>
                      <th className="px-4 py-3">Días entrega</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <EditableRow
                        key={row.id}
                        row={row}
                        disabled={savingId === row.id}
                        onSave={(patch) => patchCell(row.id, patch)}
                        formatMx={formatMx}
                      />
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

function EditableRow({ row, disabled, onSave, formatMx }) {
  const [precio, setPrecio] = useState(String(row.precio ?? ''));
  const [dias, setDias] = useState(String(row.diasEntrega ?? ''));

  useEffect(() => {
    setPrecio(String(row.precio ?? ''));
    setDias(String(row.diasEntrega ?? ''));
  }, [row.precio, row.diasEntrega, row.id]);

  const flush = () => {
    const p = Math.round(Number(String(precio).replace(/,/g, '')));
    const d = Math.round(Number(dias));
    const patch = {};
    if (Number.isFinite(p) && p >= 0 && p !== row.precio) patch.precio = p;
    if (Number.isFinite(d) && d >= 0 && d <= 365 && d !== row.diasEntrega) patch.diasEntrega = d;
    if (Object.keys(patch).length) onSave(patch);
  };

  return (
    <tr className="hover:bg-gray-50/80">
      <td className="px-4 py-2 font-medium text-gray-900">{row.pieza}</td>
      <td className="px-4 py-2 text-gray-700">{row.severidad}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          className="w-28 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
          value={precio}
          disabled={disabled}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
          }}
        />
        <span className="ml-2 text-xs text-gray-400">{formatMx(precio)}</span>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          max={365}
          className="w-20 rounded border border-gray-200 px-2 py-1 font-mono text-sm"
          value={dias}
          disabled={disabled}
          onChange={(e) => setDias(e.target.value)}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
          }}
        />
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">{disabled ? 'Guardando…' : '—'}</td>
    </tr>
  );
}
