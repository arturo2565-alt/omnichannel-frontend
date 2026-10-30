import { useMemo, useState } from 'react';
import { applyCrmSelection, foldSearch, sortOperations } from './crmCatalog.js';
import { formatCents } from './crmMoney.js';

const PIEZA_PRESETS = [
  { id: 'reparar', label: 'Reparar', category: 'piezas', operations: ['reparar'] },
  { id: 'pintar', label: 'Pintar', category: 'piezas', operations: ['pintar'] },
  {
    id: 'reparar-pintar',
    label: 'Reparar + Pintar',
    category: 'piezas',
    operations: ['reparar', 'pintar'],
  },
  { id: 'montar', label: 'Montar', category: 'montaje', operations: ['montar'] },
  {
    id: 'montar-pintar',
    label: 'Montar + Pintar',
    category: 'montaje',
    operations: ['montar', 'pintar'],
  },
];

const MONTAJE_PRESETS = [
  { id: 'montar', label: 'Montar', category: 'montaje', operations: ['montar'] },
  { id: 'pintar', label: 'Pintar', category: 'montaje', operations: ['pintar'] },
  {
    id: 'montar-pintar',
    label: 'Montar + Pintar',
    category: 'montaje',
    operations: ['montar', 'pintar'],
  },
];

function samePreset(line, preset) {
  if (line.category !== preset.category) return false;
  const current = sortOperations(line.operations).join('+');
  const next = sortOperations(preset.operations).join('+');
  return current === next;
}

function displayHint(line) {
  if (line.incompatible) return line.hint;
  if (line.category === 'personalizado') return '';
  if (!line.pieceCode) return line.hint;
  if (line.category !== 'integrales' && !line.operations?.length) return line.hint;
  if (line.tariffKind === 'manual') {
    return 'Sin tarifa automática. Captura el precio manualmente.';
  }
  return line.hint;
}

export function CrmServiceEditor({ line, offer, fieldClass, prepared, onChange, onRemove }) {
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState(line.category || 'personalizado');
  const categories = offer?.categories ?? [
    { id: 'personalizado', label: 'Servicios personalizados', operations: [] },
  ];
  const pieces = useMemo(() => {
    const needle = foldSearch(query);
    return (offer?.pieces || []).filter((piece) => {
      if (!(piece.categories || []).includes(browse)) return false;
      if (!needle) return true;
      return foldSearch(`${piece.label} ${piece.code} ${piece.catalogPieza}`).includes(needle);
    });
  }, [offer, browse, query]);
  const selectedPiece = (offer?.pieces || []).find((piece) => piece.code === line.pieceCode);
  const presets =
    browse === 'piezas' ? PIEZA_PRESETS : browse === 'montaje' ? MONTAJE_PRESETS : [];
  const hint = displayHint(line);

  const selectCategory = (id) => {
    setBrowse(id);
    setQuery('');
    onChange(applyCrmSelection(line, offer, { category: id, pieceCode: '', operations: [] }));
  };
  const selectPiece = (code) => {
    onChange(
      applyCrmSelection(line, offer, {
        category: browse,
        pieceCode: code,
        operations: [],
      }),
    );
  };
  const selectPreset = (preset) => {
    onChange(
      applyCrmSelection(line, offer, {
        category: preset.category,
        operations: preset.operations,
      }),
    );
  };

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Servicio</h3>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          Quitar
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-medium text-gray-500">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={browse === item.id}
                onClick={() => selectCategory(item.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  browse === item.id
                    ? 'border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100'
                    : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {browse === 'personalizado' ? (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-gray-500">Servicio</span>
            <input
              list="crm-service-names"
              value={line.name}
              onChange={(event) =>
                onChange({ ...line, name: event.target.value, nameTouched: true })
              }
              className={fieldClass}
              placeholder="Nombre del servicio"
            />
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-gray-500">
                {browse === 'integrales' ? 'Servicio' : 'Pieza o servicio'}
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={fieldClass}
                placeholder="Buscar por nombre"
                aria-label="Buscar pieza"
              />
            </label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-1 dark:border-gray-700">
              {pieces.length === 0 ? (
                <p className="px-2 py-3 text-xs text-gray-500">No hay piezas con ese nombre.</p>
              ) : (
                pieces.map((piece) => (
                  <button
                    key={piece.code}
                    type="button"
                    aria-pressed={line.pieceCode === piece.code}
                    onClick={() => selectPiece(piece.code)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                      line.pieceCode === piece.code
                        ? 'bg-amber-100 font-medium text-amber-950 dark:bg-amber-900/40 dark:text-amber-100'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {piece.label}
                  </button>
                ))
              )}
            </div>
            {selectedPiece && !line.name ? (
              <p className="text-xs font-medium text-gray-800 dark:text-gray-100">
                {selectedPiece.label}
              </p>
            ) : null}
            {presets.length && line.pieceCode ? (
              <div>
                <p className="mb-1 text-[11px] font-medium text-gray-500">Operación</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={samePreset(line, preset)}
                      onClick={() => selectPreset(preset)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        samePreset(line, preset)
                          ? 'border-amber-500 bg-amber-500 text-white'
                          : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {line.name ? (
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{line.name}</p>
            ) : null}
          </>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">
              Cantidad
            </span>
            <input
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => onChange({ ...line, quantity: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">
              Precio unitario
            </span>
            <input
              inputMode="decimal"
              value={line.unitPrice}
              onChange={(event) =>
                onChange(applyCrmSelection(line, offer, { unitPrice: event.target.value }))
              }
              className={fieldClass}
              placeholder="0.00"
            />
          </label>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <p className="pb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Subtotal {prepared?.subtotalCents == null ? '—' : formatCents(prepared.subtotalCents)}
            </p>
          </div>
        </div>
        {hint ? (
          <p className={`text-xs ${line.incompatible ? 'font-medium text-red-600' : 'text-gray-500'}`}>
            {hint}
          </p>
        ) : null}
      </div>
    </article>
  );
}
