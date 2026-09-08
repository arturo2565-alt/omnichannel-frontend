import { useEffect, useRef, useState } from 'react';
import { Clock, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeContext.jsx';

const OPTIONS = [
  { id: 'light', label: 'Claro', hint: 'Siempre claro', Icon: Sun },
  { id: 'dark', label: 'Oscuro', hint: 'Siempre oscuro', Icon: Moon },
  { id: 'auto', label: 'Auto', hint: 'Oscuro desde 6:00 PM', Icon: Clock },
];

function CurrentIcon({ preference, className }) {
  if (preference === 'dark') return <Moon className={className} strokeWidth={2} />;
  if (preference === 'light') return <Sun className={className} strokeWidth={2} />;
  return <Clock className={className} strokeWidth={2} />;
}

export function ThemeToggle({ placement = 'rail' }) {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (ev) => {
      if (!rootRef.current?.contains(ev.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isRail = placement === 'rail';
  const menuPos = isRail
    ? 'bottom-0 left-full z-50 ml-2'
    : 'right-0 top-full z-50 mt-1';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tema de la interfaz"
        title="Tema: Claro, Oscuro o Auto (6:00 PM)"
        onClick={() => setOpen((v) => !v)}
        className={
          isRail
            ? 'flex h-12 w-12 items-center justify-center rounded-full border border-gray-600 bg-gray-800/90 text-gray-200 shadow-lg transition hover:scale-105 hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
            : 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }
      >
        <CurrentIcon preference={preference} className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 ${menuPos}`}
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Tema
          </p>
          {OPTIONS.map((opt) => {
            const active = preference === opt.id;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setPreference(opt.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-indigo-50 font-semibold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="min-w-0">
                  <span className="block leading-tight">{opt.label}</span>
                  <span className="block text-[10px] font-normal text-gray-400">
                    {opt.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
