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
              <details className="group rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Corregir cotización
                </summary>
                <div className="mt-2 hidden flex-col gap-2 group-open:flex">
                  <p className="text-[11px] text-gray-500">
                    Esta vista no guarda ni envía. Los botones aparecen solo al abrir la corrección.
                  </p>
                  <button type="button" className="min-h-12 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100">
                    Guardar Cambios
                  </button>
                  <button type="button" className="min-h-12 rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white">
                    Enviar Cotización Final
                  </button>
                </div>
              </details>
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
