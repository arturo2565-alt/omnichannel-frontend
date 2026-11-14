import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Library, RefreshCw } from 'lucide-react';
import {
  calibrationDetailPath,
  calibrationListPath,
  fetchCalibrationDocument,
  loadCalibrationPhoto,
} from './calibrationApi.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { useAuth } from './AuthContext.jsx';
import { useSessionCacheStatus } from './sessionCacheStatus.js';
import {
  CALIBRATION_SLOW_DELAY_MS,
  CALIBRATION_SYNC_DELAY_MS,
  calibrationRefreshIndicator,
  hasSessionScope,
  isAuthRejection,
  isSessionObjectUrl,
  retainPhotoUrl,
  sessionScope,
  workshopKey,
} from './sessionQuery.js';

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
  const { user, taller } = useAuth();
  const { rejected } = useSessionCacheStatus();
  const scope = sessionScope(user, taller);
  const enabled = hasSessionScope(scope) && !rejected;
  const [tab, setTab] = useState('visual');
  const [query, setQuery] = useState('');
  const [archive, setArchive] = useState('');
  const [service, setService] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const trimmedQuery = query.trim();
  const summaryQuery = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'summary'),
    enabled,
    queryFn: () => fetchCalibrationDocument('/api/calibration/summary'),
  });
  const listQuery = useQuery({
    queryKey: workshopKey(
      scope,
      'calibration',
      tab === 'visual' ? 'cases' : 'opportunities',
      trimmedQuery,
      tab === 'visual' ? archive : service,
    ),
    enabled,
    queryFn: () => fetchCalibrationDocument(calibrationListPath(
      tab === 'visual' ? 'cases' : 'opportunities',
      { q: trimmedQuery, archive, service },
    )),
  });
  const detailQuery = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'detail', tab, selectedId),
    enabled: enabled && Boolean(selectedId),
    queryFn: () => fetchCalibrationDocument(calibrationDetailPath(tab, selectedId)),
  });
  const authRejected = rejected
    || isAuthRejection(summaryQuery.error)
    || isAuthRejection(listQuery.error)
    || isAuthRejection(detailQuery.error);
  const summary = authRejected ? null : summaryQuery.data;
  const list = authRejected ? null : listQuery.data;
  const detail = authRejected || !selectedId ? null : detailQuery.data;
  const refreshing = (summary?.status === 'ok' && summaryQuery.isFetching)
    || (list?.status === 'ok' && listQuery.isFetching)
    || (detail?.status === 'ok' && detailQuery.isFetching);
  const refreshFailed = (summary?.status === 'ok' && summaryQuery.isError)
    || (list?.status === 'ok' && listQuery.isError)
    || (detail?.status === 'ok' && detailQuery.isError);
  const elapsedMs = useCalibrationElapsed(refreshing);
  const refreshMode = calibrationRefreshIndicator({
    hasData: summary?.status === 'ok' || list?.status === 'ok' || detail?.status === 'ok',
    isFetching: refreshing,
    isError: refreshFailed,
    authRejected,
    elapsedMs,
  });
  const clearSelection = () => setSelectedId('');

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
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">Centro de Calibración</h1>
                  <CalibrationRefreshMark mode={refreshMode} />
                </div>
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
          <StatusNotice
            status={authRejected ? 'forbidden' : summary?.status}
            pending={!summary && (summaryQuery.isPending || !enabled)}
            failed={!summary && summaryQuery.isError && !authRejected}
          />
          {!authRejected && summary?.status !== 'missing' ? (
            <>
              {summary?.status === 'ok' ? (
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Stat label="Expedientes" value={summary.data.visual.caseCount} />
                  <Stat label="Archivados" value={summary.data.visual.archivedCount} />
                  <Stat label="Pendientes" value={summary.data.visual.pendingCount} />
                  <Stat label="Oportunidades" value={summary.data.commercial.opportunityCount} />
                  <Stat label="Cotizaciones" value={summary.data.commercial.quoteCount} />
                </section>
              ) : null}
              <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-800" role="tablist" aria-label="Tipo de registro">
                  <TabButton active={tab === 'visual'} onClick={() => { setTab('visual'); clearSelection(); }}>Expedientes</TabButton>
                  <TabButton active={tab === 'commercial'} onClick={() => { setTab('commercial'); clearSelection(); }}>Comercial</TabButton>
                </div>
                <label className="min-w-0 flex-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Buscar
                  <input
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); clearSelection(); }}
                    placeholder="Identificador, marca o modelo"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                {tab === 'visual' ? (
                  <Filter label="Archivo" value={archive} onChange={(value) => { setArchive(value); clearSelection(); }} options={[['', 'Todos'], ...Object.entries(ARCHIVE)]} />
                ) : (
                  <Filter label="Servicio" value={service} onChange={(value) => { setService(value); clearSelection(); }} options={[['', 'Todos'], ...Object.entries(SERVICES)]} />
                )}
              </div>
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.2fr)]">
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <ListState
                    state={list}
                    pending={!list && listQuery.isPending}
                    failed={!list && listQuery.isError && !authRejected}
                    tab={tab}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                  />
                </section>
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <Detail
                    state={detail}
                    pending={Boolean(selectedId) && detailQuery.isPending}
                    failed={Boolean(selectedId) && !detail && detailQuery.isError && !authRejected}
                    tab={tab}
                  />
                </section>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function useCalibrationElapsed(active) {
  const [previousActive, setPreviousActive] = useState(active);
  const [elapsedMs, setElapsedMs] = useState(0);
  if (active !== previousActive) {
    setPreviousActive(active);
    setElapsedMs(0);
  }
  useEffect(() => {
    if (!active) return undefined;
    const started = Date.now();
    const timers = [CALIBRATION_SYNC_DELAY_MS, CALIBRATION_SLOW_DELAY_MS].map((delay) => (
      setTimeout(() => setElapsedMs(Math.max(delay, Date.now() - started)), delay)
    ));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [active]);
  return active ? elapsedMs : 0;
}

function CalibrationRefreshMark({ mode }) {
  const label = {
    syncing: 'Actualizando',
    slow: 'La actualización está tardando',
    stale: 'Puede estar desactualizada',
  }[mode] ?? '';
  const warning = mode === 'slow' || mode === 'stale';
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-live="polite">
      {mode === 'syncing' || mode === 'slow' ? (
        <RefreshCw
          className={`h-3.5 w-3.5 animate-spin ${warning ? 'text-amber-700 dark:text-amber-300' : 'text-gray-400'}`}
          aria-hidden
        />
      ) : null}
      {mode === 'stale' ? (
        <CircleAlert className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden />
      ) : null}
      <span className="sr-only">{label}</span>
      {warning ? (
        <span className="pointer-events-none absolute left-5 top-1/2 hidden -translate-y-1/2 whitespace-nowrap text-xs font-medium text-amber-700 sm:block dark:text-amber-300" aria-hidden>
          {label}
        </span>
      ) : null}
    </span>
  );
}

function StatusNotice({ status, pending, failed }) {
  if (status === 'forbidden') {
    return <Notice>Tu usuario no tiene autorización para consultar la calibración.</Notice>;
  }
  if (pending) return <p className="mb-3 text-sm text-gray-500">Cargando la consulta…</p>;
  if (status === 'missing') {
    return <Notice>La consulta todavía no está conectada en este entorno.</Notice>;
  }
  if (failed) return <Notice>No se pudo consultar la calibración.</Notice>;
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

function ListState({ state, pending, failed, tab, onSelect, selectedId }) {
  if (failed || (state && state.status !== 'ok')) {
    return <p className="p-4 text-sm text-gray-500">No se pudo cargar el listado.</p>;
  }
  if (pending || !state) return <p className="p-4 text-sm text-gray-500">Buscando registros…</p>;
  const items = state.data?.items ?? [];
  if (items.length === 0) return <p className="p-4 text-sm text-gray-500">No hay registros con este filtro.</p>;
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {items.map((item) => {
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

function Detail({ state, pending, failed, tab }) {
  if (failed || (state && state.status !== 'ok' && state.status !== 'missing')) {
    return <p className="text-sm text-gray-500">No se pudo abrir el detalle.</p>;
  }
  if (!state && !pending) return <p className="text-sm text-gray-500">Selecciona un registro para ver el detalle.</p>;
  if (pending || !state) return <p className="text-sm text-gray-500">Cargando el detalle…</p>;
  if (state.status === 'missing') return <p className="text-sm text-gray-500">No encontramos ese registro.</p>;
  return tab === 'visual' ? <VisualDetail record={state.data} /> : <CommercialDetail record={state.data} />;
}

function VisualDetail({ record }) {
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
              {photo.verified ? (
                <CalibrationPhoto caseId={record.id} photoId={photo.id} />
              ) : (
                <div className="flex h-28 items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
                  No disponible
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

function CalibrationPhoto({ caseId, photoId }) {
  const queryClient = useQueryClient();
  const { user, taller } = useAuth();
  const { rejected } = useSessionCacheStatus();
  const scope = sessionScope(user, taller);
  const photoKey = workshopKey(scope, 'calibration', 'photo', caseId, photoId);
  const photoQuery = useQuery({
    queryKey: photoKey,
    enabled: hasSessionScope(scope) && !rejected,
    staleTime: Infinity,
    queryFn: async () => {
      const previous = queryClient.getQueryData(photoKey);
      const url = await loadCalibrationPhoto(caseId, photoId);
      return retainPhotoUrl(queryClient, previous, url);
    },
  });
  const src = !rejected && isSessionObjectUrl(photoQuery.data) ? photoQuery.data : '';
  if (src) return <img src={src} alt="" className="h-28 w-full object-cover" />;
  return (
    <div className="flex h-28 items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
      {photoQuery.isPending ? 'Cargando…' : 'No disponible'}
    </div>
  );
}

export function CommercialDetail({ record }) {
  const revisions = record.revisions ?? [];
  const active = revisions.find((item) => item.id === record.headQuoteId) ?? revisions[revisions.length - 1] ?? null;
  const quoteId = active?.id ?? record.headQuoteId;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{quoteId}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{vehicle(active ?? record) || 'Vehículo incompleto'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MetaChip>{SERVICES[record.service] ?? 'Servicio no registrado'}</MetaChip>
          <Integrity value={record.integrity} />
          <MetaChip>{active?.revision ? `Revisión ${active.revision}` : 'Sin revisión'}</MetaChip>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <PriceCard label="Cotizado" value={active?.quotedMxn} validation={active?.quotedValidation} />
        <PriceCard label="Contratado" value={active?.contractedMxn} validation={active?.contractedValidation} />
        <PriceCard label="Cobrado" value={active?.collectedMxn} validation={active?.collectedValidation} />
      </div>
      <section>
        <h3 className="text-sm font-semibold">Alcance</h3>
        <ScopeList items={active?.workScope} />
      </section>
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Historial de revisiones</h3>
          <p className="text-xs text-gray-400">{revisionCount(revisions.length)}</p>
        </div>
        {revisions.length ? (
          <ol className="mt-2 space-y-2">
            {revisions.map((revision) => {
              const current = revision.id === quoteId;
              return (
                <li
                  key={revision.id}
                  className={`rounded-xl border p-3 ${current ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950/30'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{revision.id}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Revisión {revision.revision ?? '—'}
                        {vehicle(revision) ? ` · ${vehicle(revision)}` : ''}
                      </p>
                    </div>
                    {current ? (
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-100">
                        Activa
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <RevisionPrice label="Cotizado" value={revision.quotedMxn} validation={revision.quotedValidation} />
                    <RevisionPrice label="Contratado" value={revision.contractedMxn} validation={revision.contractedValidation} />
                    <RevisionPrice label="Cobrado" value={revision.collectedMxn} validation={revision.collectedValidation} />
                  </dl>
                  {(revision.workScope ?? []).length ? <ScopeList items={revision.workScope} compact /> : null}
                </li>
              );
            })}
          </ol>
        ) : <p className="mt-2 text-sm text-gray-400">Sin revisiones.</p>}
      </section>
    </div>
  );
}

function MetaChip({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
      {children}
    </span>
  );
}

function PriceCard({ label, value, validation }) {
  const missing = validation === 'not_provided' || value == null;
  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/50">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-sm tabular-nums ${missing ? 'font-medium text-gray-400 dark:text-gray-500' : 'font-semibold'}`}>
        {price(value, validation)}
      </p>
    </article>
  );
}

function RevisionPrice({ label, value, validation }) {
  const missing = validation === 'not_provided' || value == null;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={`mt-0.5 text-xs tabular-nums ${missing ? 'text-gray-400 dark:text-gray-500' : 'font-medium'}`}>
        {price(value, validation)}
      </dd>
    </div>
  );
}

function ScopeList({ items, compact = false }) {
  const labels = (items ?? []).map((item) => WORK[item] ?? item);
  if (labels.length === 0) {
    return <p className={`${compact ? 'mt-3' : 'mt-2'} text-sm text-gray-400 dark:text-gray-500`}>Sin trabajos adicionales</p>;
  }
  return (
    <ul className={`${compact ? 'mt-3' : 'mt-2'} flex flex-wrap gap-2`}>
      {labels.map((label) => (
        <li key={label} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {label}
        </li>
      ))}
    </ul>
  );
}

function revisionCount(count) {
  if (count === 1) return '1 revisión';
  return `${count} revisiones`;
}

function Integrity({ value }) {
  const complete = value === 'complete';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${complete ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}>
      {complete ? 'Íntegro' : 'Incompleto'}
    </span>
  );
}

function vehicle(record) {
  return [record.make, record.model, record.year].filter(Boolean).join(' ');
}
