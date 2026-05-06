import React from 'react';

/** Normaliza texto de IA en varias opciones clicables para el compositor */
function shortenLabel(text, max = 72) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Chips de respuestas rápidas; `onPick` debe enlazarse al setReply de App.
 */
export default function QuickReplies({ suggestions, onPick, disabled }) {
  if (!suggestions?.length || disabled) return null;

  return (
    <div className="mb-3 rounded-xl border border-purple-100 bg-purple-50/90 p-3 shadow-sm">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-purple-600">
        ✨ Sugerencias de IA · clic para insertar en el mensaje
      </p>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        {suggestions.map((text, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(text)}
            className="shrink-0 max-w-[min(100%,18rem)] rounded-full border border-purple-200 bg-white px-3 py-1.5 text-left text-[13px] font-medium leading-snug text-gray-800 shadow-sm transition hover:border-purple-300 hover:bg-purple-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            {shortenLabel(text)}
          </button>
        ))}
      </div>
    </div>
  );
}
