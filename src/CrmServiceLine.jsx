import { useMemo, useState } from 'react';
import { applyCrmSelection, foldSearch } from './crmCatalog.js';
import { formatCents } from './crmMoney.js';

const OPERATION_LABELS = {
  reparar: 'Reparar',
  pintar: 'Pintar',
  montar: 'Montar',
};

export function CrmServiceEditor({ line, offer, fieldClass, prepared, onChange }) {
  const [query, setQuery] = useState('');
  const categories = offer?.categories ?? [
    { id: 'personalizado', label: 'Servicios personalizados', operations: [] },
  ];
  const category = categories.find((item) => item.id === line.category) ?? categories[0];
  const pieces = useMemo(() => {
    const needle = foldSearch(query);
    return (offer?.pieces || []).filter((piece) => {
      if (!(piece.categories || []).includes(line.category)) return false;
      if (!needle) return true;
      return foldSearch(`${piece.label} ${piece.code} ${piece.catalogPieza}`).includes(needle);
    });
  }, [offer, line.category, query]);

  const selectCategory = (id) => {
    setQuery('');
    onChange(applyCrmSelection(line, offer, { category: id, pieceCode: '', operations: [] }));
  };
  const selectPiece = (code) => {
    onChange(applyCrmSelection(line, offer, { pieceCode: code, operations: [] }));
  };
  const toggleOperation = (operation) => {
    const operations = line.operations.includes(operation)
      ? line.operations.filter((item) => item !== operation)
      : [...line.operations, operation];
    onChange(applyCrmSelection(line, offer, { operations }));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={line.category === item.id}
            onClick={() => selectCategory(item.id)}
            className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
              line.category === item.id
                ? 'border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100'
                : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {line.category === 'personalizado' ? (
        <input
          list="crm-service-names"
          value={line.name}
          onChange={(event) => onChange({ ...line, name: event.target.value, nameTouched: true })}
          className={fieldClass}
          placeholder="Nombre del servicio"
        />
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={fieldClass}
            placeholder="Buscar pieza"
            aria-label="Buscar pieza"
          />
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {pieces.length === 0 ? (
              <p className="text-xs text-gray-500">No hay piezas con ese nombre.</p>
            ) : (
              pieces.map((piece) => (
                <button
                  key={piece.code}
                  type="button"
                  aria-pressed={line.pieceCode === piece.code}
                  onClick={() => selectPiece(piece.code)}
                  className={`block w-full rounded-lg border px-2 py-1 text-left text-xs ${
                    line.pieceCode === piece.code
                      ? 'border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
                      : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200'
                  }`}
                >
                  {piece.label}
                </button>
              ))
            )}
          </div>
          {category?.operations?.length ? (
            <div className="flex flex-wrap gap-1">
              {category.operations.map((operation) => (
                <button
                  key={operation}
                  type="button"
                  aria-pressed={line.operations.includes(operation)}
                  onClick={() => toggleOperation(operation)}
                  className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                    line.operations.includes(operation)
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                  }`}
                >
                  {OPERATION_LABELS[operation]}
                </button>
              ))}
            </div>
          ) : null}
          {line.name ? <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{line.name}</p> : null}
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">Cantidad</span>
          <input
            inputMode="decimal"
            value={line.quantity}
            onChange={(event) => onChange({ ...line, quantity: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">Precio unitario</span>
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
      </div>
      {line.hint ? (
        <p className={`text-xs ${line.incompatible ? 'font-medium text-red-600' : 'text-gray-500'}`}>
          {line.hint}
        </p>
      ) : null}
      <p className="text-xs text-gray-500">
        Subtotal {prepared?.subtotalCents == null ? '—' : formatCents(prepared.subtotalCents)}
      </p>
    </div>
  );
}
