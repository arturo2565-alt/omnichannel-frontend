import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle.jsx';
import AgentSupervisionPanel from './AgentSupervisionPanel.jsx';
import { buildSupervisionModel } from './supervision-model.js';
import { SUPERVISION_PREVIEW_CASES } from './supervision-preview-fixtures.js';

/**
 * Inspección local del panel. No llama al API ni escribe conversaciones.
 * Vite la incluye solo en el servidor de desarrollo.
 */
export default function SupervisionPreviewPage() {
  const [params, setParams] = useSearchParams();
  const selected = SUPERVISION_PREVIEW_CASES.find((item) => item.id === params.get('caso'))
    ?? SUPERVISION_PREVIEW_CASES[0];
  const [frame, setFrame] = useState(params.get('marco') === 'movil' ? 'movil' : 'escritorio');
  const [autopilotOn, setAutopilotOn] = useState(selected.input.autopilotOn !== false);
  const [photo, setPhoto] = useState('');
  const model = useMemo(
    () => buildSupervisionModel({ ...selected.input, autopilotOn }),
    [selected, autopilotOn],
  );

  const choose = (caso) => {
    const next = new URLSearchParams(params);
    next.set('caso', caso);
    setParams(next, { replace: true });
    const found = SUPERVISION_PREVIEW_CASES.find((item) => item.id === caso);
    setAutopilotOn(found?.input.autopilotOn !== false);
  };

  return (
    <main className="min-h-screen bg-slate-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Vista local de inspección</p>
            <p className="text-xs text-amber-900 dark:text-amber-100">
              No es una conversación real. No consulta ni modifica staging.
            </p>
          </div>
          <ThemeToggle placement="header" />
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {SUPERVISION_PREVIEW_CASES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(item.id)}
              className={`min-h-10 rounded-full px-3 text-xs font-semibold ${
                item.id === selected.id
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFrame(frame === 'movil' ? 'escritorio' : 'movil')}
            className="min-h-10 rounded-full bg-white px-3 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700"
          >
            {frame === 'movil' ? 'Marco móvil' : 'Marco de escritorio'}
          </button>
        </div>
        <div className={frame === 'movil' ? 'mx-auto w-full max-w-[390px]' : 'ml-auto w-full max-w-[420px]'}>
          <div className="flex h-[760px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-slate-50 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <AgentSupervisionPanel
              model={model}
              onToggleAutonomy={() => setAutopilotOn((value) => !value)}
              onOpenEvidence={setPhoto}
            >
              <p className="rounded-lg bg-gray-50 px-2 py-2 text-[11px] text-gray-500 dark:bg-gray-800/80">
                Corregir cotización y enviar siguen en la bandeja real. Aquí no hay una cotización que guardar.
              </p>
            </AgentSupervisionPanel>
          </div>
        </div>
        {photo ? (
          <button type="button" className="text-xs underline" onClick={() => setPhoto('')}>
            Cerrar evidencia de inspección
          </button>
        ) : null}
      </div>
    </main>
  );
}
