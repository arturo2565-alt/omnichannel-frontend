import { NavLink } from 'react-router-dom';
import { Calendar, Settings2, MessageCircle, Table2 } from 'lucide-react';

const railBtn =
  'flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition hover:scale-105 border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

/** Rail izquierdo oscuro: filtros de canal (opcional) + navegación con estado activo */
export function OmnichannelLeftRail({ platformSlot }) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center bg-gray-900 py-4 shadow-xl z-10">
      {platformSlot ? (
        <>
          <div className="flex flex-col items-center space-y-4">{platformSlot}</div>
          <div className="my-3 h-px w-10 shrink-0 bg-gray-700" aria-hidden />
        </>
      ) : null}

      <nav
        className="flex flex-col items-center space-y-4"
        aria-label="Navegación"
      >
        <NavLink
          to="/"
          end
          title="Bandeja"
          className={({ isActive }) =>
            `${railBtn} ${
              isActive
                ? 'scale-105 bg-gray-700 text-white ring-2 ring-white ring-offset-2 ring-offset-gray-900 border-gray-500'
                : 'border-gray-600 bg-gray-800/90 text-gray-200 hover:bg-gray-700'
            }`
          }
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
        </NavLink>
        <NavLink
          to="/calendar"
          title="Citas"
          className={({ isActive }) =>
            `${railBtn} ${
              isActive
                ? 'scale-105 bg-indigo-600 text-white ring-2 ring-white ring-offset-2 ring-offset-gray-900 border-indigo-400'
                : 'border-gray-600 bg-gray-800/90 text-gray-200 hover:bg-gray-700'
            }`
          }
        >
          <Calendar className="h-5 w-5" strokeWidth={2} aria-hidden />
        </NavLink>
        <NavLink
          to="/admin/ai-settings"
          title="IA y negocio"
          className={({ isActive }) =>
            `${railBtn} ${
              isActive
                ? 'scale-105 bg-violet-600 text-white ring-2 ring-white ring-offset-2 ring-offset-gray-900 border-violet-400'
                : 'border-gray-600 bg-gray-800/90 text-gray-200 hover:bg-gray-700'
            }`
          }
        >
          <Settings2 className="h-5 w-5" strokeWidth={2} aria-hidden />
        </NavLink>
        <NavLink
          to="/admin/catalog"
          title="Catálogo de precios"
          className={({ isActive }) =>
            `${railBtn} ${
              isActive
                ? 'scale-105 bg-emerald-600 text-white ring-2 ring-white ring-offset-2 ring-offset-gray-900 border-emerald-400'
                : 'border-gray-600 bg-gray-800/90 text-gray-200 hover:bg-gray-700'
            }`
          }
        >
          <Table2 className="h-5 w-5" strokeWidth={2} aria-hidden />
        </NavLink>
      </nav>
    </div>
  );
}
