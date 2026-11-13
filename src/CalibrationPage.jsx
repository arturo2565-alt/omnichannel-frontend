import { useEffect, useState } from 'react';
import { Library } from 'lucide-react';
import { loadCalibration, loadCalibrationPhoto } from './calibrationApi.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

const SERVICES = {
  exterior_bath: 'Baño exterior',
  bath_with_bodywork: 'Baño con hojalatería',
  color_change: 'Cambio de color',
};
const TREATMENTS = {
  repair_paint: 'Reparar y pintar',
  paint: 'Pintar',
  replace_paint: 'Sustituir y pintar',
  replace: 'Sustituir',
  other: 'Otro',
  uncertain: 'Incierto',
};
const ARCHIVE = {
  archived_private: 'Archivado en privado',
  pending_private_archive: 'Archivo pendiente',
  not_provided: 'Sin fotografías',
};
const WORK = {
  bodywork: 'Hojalatería',
  disassembly: 'Desarmado',
  interior_frames: 'Marcos interiores',
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function price(value, validation) {
  if (validation === 'not_provided' || value == null) return 'No proporcionado';
  return money.format(value);
}

export default function CalibrationPage() {
  const [summaryState, setSummaryState] = useState({ status: 'loading', data: null });
  const [tab, setTab] = useState('visual');
  const [query, setQuery] = useState('');
  const [archive, setArchive] = useState('');
  const [service, setService] = useState('');
  const [listState, setListState] = useState({ status: 'loading', items: [] });
  const [selectedId, setSelectedId] = useState('');
  const [detailState, setDetailState] = useState({ status: 'idle', data: null });
  const [photos, setPhotos] = useState({});

  useEffect(() => {
    let active = true;
    setSummaryState({ status: 'loading', data: null });
    loadCalibration('/api/calibration/summary').then((result) => {
      if (active) setSummaryState(result.status === 'ok' ? { status: 'ready', data: result.data } : { status: result.status, data: null });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (summaryState.status !== 'ready') return undefined;
    let active = true;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (tab === 'visual' && archive) params.set('archive', archive);
    if (tab === 'commercial' && service) params.set('service', service);
    const suffix = params.toString();
    const path = tab === 'visual' ? '/api/calibration/cases' : '/api/calibration/opportunities';
    setListState({ status: 'loading', items: [] });
    setSelectedId('');
    setDetailState({ status: 'idle', data: null });
    loadCalibration(`${path}${suffix ? `?${suffix}` : ''}`).then((result) => {
      if (!active) return;
      setListState(result.status === 'ok'
        ? { status: 'ready', items: result.data.items ?? [] }
        : { status: result.status, items: [] });
    });
    return () => {
      active = false;
    };
  }, [summaryState.status, tab, query, archive, service]);

  useEffect(() => {
    if (!selectedId) {
      setDetailState({ status: 'idle', data: null });
      return undefined;
    }
    let active = true;
    const path = tab === 'visual'
      ? `/api/calibration/cases/${selectedId}`
      : `/api/calibration/quotes/${selectedId}`;
    setDetailState({ status: 'loading', data: null });
    loadCalibration(path).then((result) => {
      if (!active) return;
      setDetailState(result.status === 'ok' ? { status: 'ready', data: result.data } : { status: result.status, data: null });
    });
    return () => {
      active = false;
    };
  }, [selectedId, tab]);

  useEffect(() => {
    const detail = detailState.data;
    if (!detail?.photos) return undefined;
    let active = true;
    Promise.all(detail.photos.filter((photo) => photo.verified).map(async (photo) => {
      const url = await loadCalibrationPhoto(detail.id, photo.id);
      return [photo.id, url];
    })).then((entries) => {
      const created = entries.flatMap(([, url]) => (url ? [url] : []));
      if (!active) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setPhotos(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [detailState.data]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 pb-16 text-gray-900 dark:bg-gray-950 dark:text-gray-100 lg:pb-0">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 hidden h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:inline-flex">
                <Library className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h1 className="text-xl font-bold">Centro de Calibración</h1>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Consulta privada de expedientes visuales y cotizaciones comerciales.
                </p>
              </div>
            </div>
            <div className="lg:hidden">
              <ThemeToggle placement="header" />
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <StatusNotice status={summaryState.status} />
          {summaryState.status === 'ready' ? (
            <>
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Stat label="Expedientes" value={summaryState.data.visual.caseCount} />
                <Stat label="Archivados" value={summaryState.data.visual.archivedCount} />
                <Stat label="Pendientes" value={summaryState.data.visual.pendingCount} />
                <Stat label="Oportunidades" value={summaryState.data.commercial.opportunityCount} />
                <Stat label="Cotizaciones" value={summaryState.data.commercial.quoteCount} />
              </section>
              <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-800" role="tablist" aria-label="Tipo de registro">
                  <TabButton active={tab === 'visual'} onClick={() => { setTab('visual'); setSelectedId(''); }}>Expedientes</TabButton>
                  <TabButton active={tab === 'commercial'} onClick={() => { setTab('commercial'); setSelectedId(''); }}>Comercial</TabButton>
                </div>
                <label className="min-w-0 flex-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Buscar
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Identificador, marca o modelo"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                {tab === 'visual' ? (
                  <Filter label="Archivo" value={archive} onChange={setArchive} options={[['', 'Todos'], ...Object.entries(ARCHIVE)]} />
                ) : (
                  <Filter label="Servicio" value={service} onChange={setService} options={[['', 'Todos'], ...Object.entries(SERVICES)]} />
                )}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.2fr)]">
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <ListState state={listState} tab={tab} onSelect={setSelectedId} selectedId={selectedId} />
                </section>
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <Detail state={detailState} tab={tab} photos={photos} />
                </section>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function StatusNotice({ status }) {
  if (status === 'loading') return <p className="text-sm text-gray-500">Cargando la consulta…</p>;
  if (status === 'forbidden') {
    return <Notice>Tu usuario no tiene autorización para consultar la calibración.</Notice>;
  }
  if (status === 'missing') {
    return <Notice>La consulta todavía no está conectada en este entorno.</Notice>;
  }
  if (status === 'error') return <Notice>No se pudo consultar la calibración.</Notice>;
  return null;
}

function Notice({ children }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      {children}
    </p>
  );
}

function Stat({ label, value }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 0}</p>
    </article>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}
    >
      {children}
    </button>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        {options.map(([option, text]) => <option key={option || 'all'} value={option}>{text}</option>)}
      </select>
    </label>
  );
}

function ListState({ state, tab, onSelect, selectedId }) {
  if (state.status === 'loading') return <p className="p-4 text-sm text-gray-500">Buscando registros…</p>;
  if (state.status !== 'ready') return <p className="p-4 text-sm text-gray-500">No se pudo cargar el listado.</p>;
  if (state.items.length === 0) return <p className="p-4 text-sm text-gray-500">No hay registros con este filtro.</p>;
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {state.items.map((item) => {
        const id = tab === 'visual' ? item.id : item.headQuoteId;
        const title = tab === 'visual'
          ? vehicle(item) || item.id
          : vehicle(item) || item.headQuoteId;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${selectedId === id ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{id}</span>
              </span>
              <Integrity value={item.integrity} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Detail({ state, tab, photos }) {
  if (state.status === 'idle') return <p className="text-sm text-gray-500">Selecciona un registro para ver el detalle.</p>;
  if (state.status === 'loading') return <p className="text-sm text-gray-500">Cargando el detalle…</p>;
  if (state.status === 'missing') return <p className="text-sm text-gray-500">No encontramos ese registro.</p>;
  if (state.status !== 'ready') return <p className="text-sm text-gray-500">No se pudo abrir el detalle.</p>;
  return tab === 'visual' ? <VisualDetail record={state.data} photos={photos} /> : <CommercialDetail record={state.data} />;
}

function VisualDetail({ record, photos }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{vehicle(record) || record.id}</h2>
          <p className="text-xs text-gray-500">{record.id} · {ARCHIVE[record.archiveStatus] ?? record.archiveStatus}</p>
        </div>
        <Integrity value={record.integrity} />
      </div>
      <p className="mt-3 text-sm">Cotizado {money.format(record.quotedTotalMxn || 0)}</p>
      <h3 className="mt-4 text-sm font-semibold">Piezas y tratamientos</h3>
      {record.lines?.length ? (
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
          {record.lines.map((line) => (
            <li key={line.lineId ?? line.part} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{line.part}<span className="block text-xs text-gray-500">{TREATMENTS[line.treatment] ?? line.treatment}</span></span>
              <span className="tabular-nums">{money.format(line.priceMxn)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-gray-500">Sin piezas registradas.</p>}
      <h3 className="mt-4 text-sm font-semibold">Fotografías</h3>
      {record.photos?.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {record.photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              {photos[photo.id] ? (
                <img src={photos[photo.id]} alt="" className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
                  {photo.verified ? 'Cargando…' : 'No disponible'}
                </div>
              )}
              <figcaption className="px-2 py-1 text-[11px] text-gray-500">{photo.id}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="mt-2 text-sm text-gray-500">Este expediente no tiene fotografías.</p>}
    </div>
  );
}

function CommercialDetail({ record }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{record.headQuoteId}</h2>
          <p className="text-xs text-gray-500">{SERVICES[record.service] ?? 'Servicio no registrado'}</p>
        </div>
        <Integrity value={record.integrity} />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Historial de revisiones</h3>
      <ol className="mt-2 space-y-3">
        {(record.revisions ?? []).map((revision) => (
          <li key={revision.id} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-700">
            <p className="font-semibold">{revision.id} · revisión {revision.revision}</p>
            <p className="mt-1 text-gray-500">{vehicle(revision) || 'Vehículo incompleto'}</p>
            <p className="mt-2">Cotizado {price(revision.quotedMxn, revision.quotedValidation)}</p>
            <p>Contratado {price(revision.contractedMxn, revision.contractedValidation)}</p>
            <p>Cobrado {price(revision.collectedMxn, revision.collectedValidation)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {(revision.workScope ?? []).map((item) => WORK[item] ?? item).join(', ') || 'Sin trabajos adicionales'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Integrity({ value }) {
  const complete = value === 'complete';
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${complete ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}>
      {complete ? 'Íntegro' : 'Incompleto'}
    </span>
  );
}

function vehicle(record) {
  return [record.make, record.model, record.year].filter(Boolean).join(' ');
}
