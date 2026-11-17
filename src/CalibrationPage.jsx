import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Library, RefreshCw } from 'lucide-react';
import {
  calibrationDetailPath,
  calibrationEvidencePath,
  calibrationListPath,
  confirmCalibrationSeverity,
  fetchCalibrationDocument,
  loadCalibrationEvidencePhoto,
  loadCalibrationPhoto,
} from './calibrationApi.js';
import { declaredAmount, galleryMove, groupRepairLines, listAmount, sumDeclared } from './calibrationView.js';
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
const SEVERITY_SCALE = 'severity-v1';
const SEVERITY_LEVELS = [
  ['leve', 'Leve'],
  ['medio_leve', 'Medio-leve'],
  ['medio', 'Medio'],
  ['medio_fuerte', 'Medio-fuerte'],
  ['fuerte', 'Fuerte'],
];

function severityLabel(level) {
  return SEVERITY_LEVELS.find(([code]) => code === level)?.[1] ?? 'Desconocido';
}

function severityState(annotation) {
  if (!annotation) return 'Sin clasificación';
  if (annotation.status === 'validated' && annotation.provenance === 'authenticated_owner') return 'Validado';
  if (annotation.status === 'unknown' && annotation.provenance === 'insufficient_evidence') return 'Desconocido';
  if (annotation.status === 'proposed' && annotation.provenance === 'human_declaration' && annotation.inferenceMethod == null) return 'Pendiente de validación';
  if (annotation.status === 'proposed' && annotation.provenance === 'visual_inference' && annotation.inferenceMethod === 'visual_assessment') return 'Propuesta IA';
  return 'Sin clasificación';
}

function scaleLabel(annotation) {
  return annotation?.scaleVersion === SEVERITY_SCALE ? ` · ${SEVERITY_SCALE}` : '';
}

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
const EVIDENCE = {
  photographs: 'Con fotografías',
  text: 'Solo texto',
  pending: 'Archivo pendiente',
  not_provided: 'Sin fotografías',
};
const LINKED_EVIDENCE = {
  verified: 'Fotografía archivada',
  privacy_pending: 'Evidencia pendiente de privacidad',
  link_pending: 'Evidencia pendiente de vinculación',
};
const EVIDENCE_FILTERS = [
  ['', 'Todos'],
  ['photographs', 'Con fotografías'],
  ['text', 'Solo texto'],
  ['pending', 'Archivo pendiente'],
];
const WORK = {
  bodywork: 'Hojalatería',
  disassembly: 'Desarmado',
  interior_frames: 'Marcos interiores',
};
const LABOR = {
  mount_and_paint: 'Montaje y pintura',
  paint: 'Pintura',
  repair: 'Reparación',
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
  const [tab, setTab] = useState('repairs');
  const [query, setQuery] = useState('');
  const [evidence, setEvidence] = useState('');
  const [service, setService] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const trimmedQuery = query.trim();
  const detailTab = tab === 'paint' ? 'commercial' : calibrationContract(selectedId);
  const summaryQuery = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'summary'),
    enabled,
    queryFn: () => fetchCalibrationDocument('/api/calibration/summary'),
  });
  const repairList = useInfiniteQuery({
    queryKey: workshopKey(scope, 'calibration', 'repair-work', trimmedQuery, evidence),
    enabled: enabled && tab === 'repairs',
    initialPageParam: '',
    queryFn: ({ pageParam }) => fetchCalibrationDocument(calibrationListPath('repair-work', {
      q: trimmedQuery,
      evidence,
      cursor: pageParam,
    })),
    getNextPageParam: (last) => (last?.status === 'ok' ? last.data?.nextCursor || undefined : undefined),
  });
  const paintList = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'opportunities', trimmedQuery, service),
    enabled: enabled && tab === 'paint',
    queryFn: () => fetchCalibrationDocument(calibrationListPath('opportunities', {
      q: trimmedQuery,
      service,
    })),
  });
  const detailQuery = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'detail', detailTab, selectedId),
    enabled: enabled && Boolean(selectedId),
    queryFn: () => fetchCalibrationDocument(calibrationDetailPath(detailTab, selectedId)),
  });
  const listQuery = tab === 'paint' ? paintList : repairList;
  const authRejected = rejected
    || isAuthRejection(summaryQuery.error)
    || isAuthRejection(listQuery.error)
    || isAuthRejection(detailQuery.error);
  const summary = authRejected ? null : summaryQuery.data;
  const list = authRejected ? null : (tab === 'paint' ? paintList.data : repairPages(repairList.data));
  const detail = authRejected || !selectedId ? null : detailQuery.data;
  const listFetching = tab === 'paint'
    ? paintList.isFetching
    : repairList.isFetching && !repairList.isFetchingNextPage;
  const refreshing = (summary?.status === 'ok' && summaryQuery.isFetching)
    || (list?.status === 'ok' && listFetching)
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
                  Consulta privada de reparaciones y pintura integral.
                </p>
              </div>
            </div>
            <div className="lg:hidden">
              <ThemeToggle placement="header" />
            </div>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6">
          <StatusNotice
            status={authRejected ? 'forbidden' : summary?.status}
            pending={!summary && (summaryQuery.isPending || !enabled)}
            failed={!summary && summaryQuery.isError && !authRejected}
          />
          {!authRejected && summary?.status !== 'missing' ? (
            <>
              {summary?.status === 'ok' ? (
                <CalibrationStats data={summary.data} />
              ) : null}
              <div className="mt-5 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end">
                <div className="flex max-w-full flex-wrap gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-gray-800" role="tablist" aria-label="Tipo de registro">
                  <TabButton active={tab === 'repairs'} onClick={() => { setTab('repairs'); clearSelection(); }}>Reparaciones</TabButton>
                  <TabButton active={tab === 'paint'} onClick={() => { setTab('paint'); clearSelection(); }}>Pintura integral</TabButton>
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
                {tab === 'repairs' ? (
                  <Filter label="Evidencia" value={evidence} onChange={(value) => { setEvidence(value); clearSelection(); }} options={EVIDENCE_FILTERS} />
                ) : (
                  <Filter label="Servicio" value={service} onChange={(value) => { setService(value); clearSelection(); }} options={[['', 'Todos'], ...Object.entries(SERVICES)]} />
                )}
              </div>
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.2fr)]">
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <ListState
                    state={list}
                    pending={!list && (listQuery.isLoading || listQuery.isPending)}
                    failed={!list && listQuery.isError && !authRejected}
                    tab={tab}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                    hasMore={tab === 'repairs' && repairList.hasNextPage}
                    loadingMore={repairList.isFetchingNextPage}
                    onMore={() => { repairList.fetchNextPage(); }}
                  />
                </section>
                <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <Detail
                    state={detail}
                    pending={Boolean(selectedId) && detailQuery.isPending}
                    failed={Boolean(selectedId) && !detail && detailQuery.isError && !authRejected}
                    tab={detailTab}
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

export function CalibrationStats({ data }) {
  const repairs = data?.repairs ?? {};
  const paint = data?.paint ?? {};
  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Reparaciones"
        value={repairs.recordCount}
        hint={`${repairs.caseCount ?? 0} expedientes · ${repairs.opportunityCount ?? 0} oportunidades`}
        truncated={repairs.truncated}
      />
      <Stat
        label="Pintura integral"
        value={paint.opportunityCount}
        hint={`${paint.quoteCount ?? 0} cotizaciones`}
        truncated={paint.truncated}
      />
      <Stat
        label="Evidencia archivada"
        value={data?.evidence?.photoCount}
        hint="fotografías verificadas"
        truncated={data?.evidence?.truncated}
      />
      <Stat
        label="Pendientes"
        value={data?.pending?.caseCount}
        hint="expedientes"
        truncated={data?.pending?.truncated}
      />
    </section>
  );
}

function Stat({ label, value, hint, truncated = false }) {
  return (
    <article className="min-w-0 rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? 0}</p>
      <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        {hint}{truncated ? ' · recorrido parcial' : ''}
      </p>
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
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${active ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500'}`}
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

function ListState({ state, pending, failed, tab, onSelect, selectedId, hasMore = false, loadingMore = false, onMore }) {
  if (failed || (state && state.status !== 'ok')) {
    return <p className="p-4 text-sm text-gray-500">No se pudo cargar el listado.</p>;
  }
  if (pending || !state) return <p className="p-4 text-sm text-gray-500">Buscando registros…</p>;
  const items = state.data?.items ?? [];
  const truncated = Boolean(state.data?.truncated);
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        {truncated
          ? 'Ningún registro del recorrido coincide. El archivo continúa fuera de esta consulta.'
          : 'No hay registros con este filtro.'}
      </p>
    );
  }
  return (
    <div>
      {truncated ? (
        <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          El recorrido no incluye todo el archivo. Puede haber registros fuera de esta consulta.
        </p>
      ) : null}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item) => {
          const id = tab === 'paint' ? item.headQuoteId : item.id;
          const kind = tab === 'paint' ? 'commercial' : (item.contract === 'visual' ? 'visual' : 'repair');
          const title = vehicle(item) || id;
          const amount = listAmount(item, kind);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={`flex w-full min-w-0 items-center justify-between gap-3 px-4 py-2.5 text-left ${selectedId === id ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold">{title}</span>
                    <CatalogMark record={item} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {id}
                    {tab === 'repairs' ? ` · ${EVIDENCE[item.evidence] ?? 'Sin fotografías'}` : ''}
                    {amount == null ? '' : ` · ${money.format(amount)}`}
                  </span>
                </span>
                <Integrity value={item.integrity} />
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <button
          type="button"
          onClick={onMore}
          disabled={loadingMore}
          className="w-full border-t border-gray-100 px-4 py-3 text-sm font-medium text-sky-800 disabled:opacity-60 dark:border-gray-800 dark:text-sky-200"
        >
          {loadingMore ? 'Cargando…' : 'Más registros'}
        </button>
      ) : null}
    </div>
  );
}

function repairPages(data) {
  const pages = data?.pages ?? [];
  if (pages.length === 0) return null;
  const ready = pages.filter((page) => page?.status === 'ok');
  if (ready.length === 0) return pages[0];
  return {
    status: 'ok',
    data: {
      items: ready.flatMap((page) => page.data?.items ?? []),
      truncated: ready.some((page) => page.data?.truncated),
    },
  };
}

function calibrationContract(id) {
  return /^AF-\d{6}$/.test(id) ? 'visual' : 'repair';
}

function Detail({ state, pending, failed, tab }) {
  if (failed || (state && state.status !== 'ok' && state.status !== 'missing')) {
    return <p className="text-sm text-gray-500">No se pudo abrir el detalle.</p>;
  }
  if (!state && !pending) return <p className="text-sm text-gray-500">Selecciona un registro para ver el detalle.</p>;
  if (pending || !state) return <p className="text-sm text-gray-500">Cargando el detalle…</p>;
  if (state.status === 'missing') return <p className="text-sm text-gray-500">No encontramos ese registro.</p>;
  return tab === 'visual'
    ? <VisualDetail record={state.data} />
    : tab === 'repair'
      ? <RepairDetail record={state.data} />
      : <CommercialDetail record={state.data} />;
}

export function VisualDetail({ record }) {
  const verified = (record.photos ?? []).filter((photo) => photo.verified).map((photo) => photo.id);
  const [galleryId, setGalleryId] = useState(null);
  const open = galleryId && verified.includes(galleryId) ? galleryId : null;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{vehicle(record) || record.id}</h2>
        <p className="mt-1 text-sm text-gray-500">{record.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MetaChip>{ARCHIVE[record.archiveStatus] ?? record.archiveStatus}</MetaChip>
          <Integrity value={record.integrity} />
        </div>
      </header>
      <article className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-800 dark:bg-gray-950/50">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Total cotizado</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{money.format(record.quotedTotalMxn || 0)}</p>
      </article>
      <section>
        <h3 className="text-sm font-semibold">Piezas y tratamientos</h3>
        {record.lines?.length ? (
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {record.lines.map((line) => (
              <li key={line.lineId ?? line.part} className="flex min-w-0 flex-col gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{line.part}</span>
                    <span className="block text-xs text-gray-500">{TREATMENTS[line.treatment] ?? line.treatment}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money.format(line.priceMxn)}</span>
                </span>
                <SeverityNote subjectId={record.id} lineId={line.lineId} annotation={line.severityAnnotation} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-gray-500">Sin piezas registradas.</p>}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Fotografías</h3>
        {record.photos?.length ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {record.photos.map((photo) => (
              <figure key={photo.id} className="min-w-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                {photo.verified ? (
                  <button type="button" className="block w-full" onClick={() => setGalleryId(photo.id)} aria-label={`Ampliar ${photo.id}`}>
                    <CalibrationPhoto caseId={record.id} photoId={photo.id} />
                  </button>
                ) : (
                  <div className="flex h-28 items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
                    No disponible
                  </div>
                )}
                <figcaption className="truncate px-2 py-1 text-[11px] text-gray-500">{photo.id}</figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-gray-500">Este expediente no tiene fotografías.</p>}
      </section>
      {open ? (
        <PhotoGallery
          caseId={record.id}
          photoId={open}
          onClose={() => setGalleryId(null)}
          onStep={(step) => setGalleryId(galleryMove(verified, open, step))}
          hasPrevious={verified.indexOf(open) > 0}
          hasNext={verified.indexOf(open) < verified.length - 1}
        />
      ) : null}
    </div>
  );
}

function PhotoGallery({ caseId, photoId, onClose, onStep, hasPrevious, hasNext }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasPrevious) onStep(-1);
      if (event.key === 'ArrowRight' && hasNext) onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasNext, hasPrevious, onClose, onStep]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-3" role="dialog" aria-modal="true" aria-label="Fotografía ampliada">
      <button type="button" className="absolute inset-0" aria-label="Cerrar fotografía" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-3xl min-w-0 flex-col gap-3">
        <CalibrationPhoto caseId={caseId} photoId={photoId} frame="stage" />
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-900 disabled:opacity-40" disabled={!hasPrevious} onClick={() => onStep(-1)}>Anterior</button>
          <p className="truncate text-xs text-white">{photoId}</p>
          <button type="button" className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-900 disabled:opacity-40" disabled={!hasNext} onClick={() => onStep(1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}

function CalibrationPhoto({ caseId, photoId, frame = 'thumb' }) {
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
  const frameClass = frame === 'stage'
    ? 'max-h-[70vh] w-full rounded-xl bg-black object-contain'
    : 'h-28 w-full object-cover';
  if (src) return <img src={src} alt="" className={frameClass} />;
  return (
    <div className={`flex items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 ${frame === 'stage' ? 'h-64 w-full rounded-xl' : 'h-28'}`}>
      {photoQuery.isPending ? 'Cargando…' : 'No disponible'}
    </div>
  );
}

function EvidencePhoto({ kind, quoteId, evidenceId, frame = 'thumb' }) {
  const queryClient = useQueryClient();
  const { user, taller } = useAuth();
  const { rejected } = useSessionCacheStatus();
  const scope = sessionScope(user, taller);
  const photoKey = workshopKey(scope, 'calibration', 'evidence-photo', quoteId, evidenceId);
  const photoQuery = useQuery({
    queryKey: photoKey,
    enabled: hasSessionScope(scope) && !rejected,
    staleTime: Infinity,
    queryFn: async () => {
      const previous = queryClient.getQueryData(photoKey);
      const url = await loadCalibrationEvidencePhoto(kind, quoteId, evidenceId);
      return retainPhotoUrl(queryClient, previous, url);
    },
  });
  const src = !rejected && isSessionObjectUrl(photoQuery.data) ? photoQuery.data : '';
  const frameClass = frame === 'stage'
    ? 'max-h-[70vh] w-full rounded-xl bg-black object-contain'
    : 'h-28 w-full object-cover';
  if (src) return <img src={src} alt="" className={frameClass} />;
  return (
    <div className={`flex items-center justify-center bg-gray-50 text-xs text-gray-500 dark:bg-gray-800 ${frame === 'stage' ? 'h-64 w-full rounded-xl' : 'h-28'}`}>
      {photoQuery.isFetching ? 'Cargando…' : 'No disponible'}
    </div>
  );
}

function LinkedEvidence({ kind, quoteId }) {
  const { user, taller } = useAuth();
  const { rejected } = useSessionCacheStatus();
  const scope = sessionScope(user, taller);
  const evidenceQuery = useQuery({
    queryKey: workshopKey(scope, 'calibration', 'evidence', kind, quoteId),
    enabled: hasSessionScope(scope) && !rejected && Boolean(quoteId),
    queryFn: () => fetchCalibrationDocument(calibrationEvidencePath(kind, quoteId)),
  });
  const items = evidenceQuery.data?.status === 'ok' ? (evidenceQuery.data.data?.items ?? []) : [];
  const verified = items.filter((item) => item.state === 'verified');
  const pending = items.filter((item) => item.state === 'privacy_pending' || item.state === 'link_pending');
  const [galleryId, setGalleryId] = useState(null);
  const open = galleryId && verified.some((item) => item.id === galleryId) ? galleryId : null;
  const empty = kind === 'commercial' ? 'Cotización sin fotografías' : 'Sin fotografías';
  return (
    <section>
      <h3 className="text-sm font-semibold">Fotografías vinculadas</h3>
      {evidenceQuery.isError ? <p className="mt-2 text-sm text-gray-500">No se pudo consultar la evidencia.</p> : null}
      {!evidenceQuery.isError && items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{evidenceQuery.isFetching ? 'Cargando…' : empty}</p>
      ) : null}
      {verified.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {verified.map((item) => (
            <figure key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <button type="button" className="block w-full" onClick={() => setGalleryId(item.id)} aria-label={`Ampliar ${item.id}`}>
                <EvidencePhoto kind={kind} quoteId={quoteId} evidenceId={item.id} />
              </button>
              <figcaption className="truncate px-2 py-1 text-[11px] text-gray-500">{LINKED_EVIDENCE.verified}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {pending.length ? (
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
          {pending.map((item) => (
            <li key={item.id}>{LINKED_EVIDENCE[item.state] ?? item.state}</li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-3" role="dialog" aria-modal="true" aria-label="Fotografía vinculada">
          <button type="button" className="absolute inset-0" aria-label="Cerrar fotografía" onClick={() => setGalleryId(null)} />
          <div className="relative z-10 w-full max-w-3xl min-w-0">
            <EvidencePhoto kind={kind} quoteId={quoteId} evidenceId={open} frame="stage" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RepairDetail({ record }) {
  const revisions = record.revisions ?? [];
  const active = revisions.find((item) => item.id === record.headQuoteId) ?? revisions[revisions.length - 1] ?? null;
  const quoteId = active?.id ?? record.headQuoteId;
  const [openIds, setOpenIds] = useState(() => new Set());
  const toggleRevision = (id) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const groups = groupRepairLines(active?.lines);
  const contracted = sumDeclared(active?.lines, 'contractedMxn', 'contractedValidation');
  const collected = sumDeclared(active?.lines, 'collectedMxn', 'collectedValidation');
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="break-all text-2xl font-semibold tracking-tight">{quoteId}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {vehicle(active ?? record) || 'Vehículo incompleto'}
          <CatalogMark record={active ?? record} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MetaChip>Evidencia textual</MetaChip>
          <Integrity value={record.integrity} />
          <MetaChip>{active?.revision ? `Revisión ${active.revision}` : 'Sin revisión'}</MetaChip>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <article className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/50">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Total cotizado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{active?.quotedTotalMxn == null ? 'No proporcionado' : money.format(active.quotedTotalMxn)}</p>
        </article>
        {contracted == null ? null : <PriceCard label="Contratado" value={contracted} validation="human_confirmed" />}
        {collected == null ? null : <PriceCard label="Cobrado" value={collected} validation="human_confirmed" />}
      </div>
      <LinkedEvidence kind="repair" quoteId={quoteId} />
      <RepairLines title="Refacciones" subjectId={quoteId} lines={groups.parts} />
      <RepairLines title="Mano de obra" subjectId={quoteId} lines={groups.labor} />
      <section>
        <h3 className="text-sm font-semibold">Condiciones</h3>
        {active?.conditions?.length ? (
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            {active.conditions.map((condition) => <li key={condition} className="break-words">{condition}</li>)}
          </ul>
        ) : <p className="mt-2 text-sm text-gray-400">Sin condiciones declaradas.</p>}
      </section>
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Historial de revisiones</h3>
          <p className="text-xs text-gray-400">{revisionCount(revisions.length)}</p>
        </div>
        {revisions.length ? (
          <ol className="mt-2 space-y-2">
            {revisions.map((revision) => (
              <RepairRevision
                key={revision.id}
                revision={revision}
                active={revision.id === quoteId}
                expanded={openIds.has(revision.id)}
                onToggle={() => toggleRevision(revision.id)}
              />
            ))}
          </ol>
        ) : <p className="mt-2 text-sm text-gray-400">Sin revisiones.</p>}
      </section>
    </div>
  );
}

function RepairRevision({ revision, active, expanded, onToggle }) {
  const panelId = `rq-revision-${revision.id}`;
  const groups = groupRepairLines(revision.lines);
  return (
    <li className={`rounded-xl border p-3 ${active ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950/30'}`}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onToggle();
        }}
        className="flex w-full min-w-0 items-start justify-between gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{revision.id}</span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            Revisión {revision.revision ?? '—'}
            {vehicle(revision) ? ` · ${vehicle(revision)}` : ''}
            <CatalogMark record={revision} />
          </span>
          <span className="mt-1 block text-sm font-medium tabular-nums">
            Cotizado {revision.quotedTotalMxn == null ? 'No proporcionado' : money.format(revision.quotedTotalMxn)}
          </span>
        </span>
        {active ? <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-100">Activa</span> : null}
      </button>
      <div id={panelId} hidden={!expanded}>
        <RepairLines title="Refacciones" subjectId={revision.id} lines={groups.parts} compact />
        <RepairLines title="Mano de obra" subjectId={revision.id} lines={groups.labor} compact />
        <div className="mt-3">
          <h3 className="text-sm font-semibold">Condiciones</h3>
          {revision.conditions?.length ? (
            <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
              {revision.conditions.map((condition) => <li key={condition} className="break-words">{condition}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-gray-400">Sin condiciones declaradas.</p>}
        </div>
      </div>
    </li>
  );
}

function SeverityNote({ subjectId, lineId, annotation, compact = false }) {
  const client = useQueryClient();
  const [level, setLevel] = useState(annotation?.status === 'validated' ? annotation.level ?? '' : '');
  const save = useMutation({
    mutationFn: (next) => confirmCalibrationSeverity({ subjectId, lineId, level: next }),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey.includes('calibration') && query.queryKey.includes('detail'),
      });
    },
  });
  const history = Array.isArray(annotation?.history) ? annotation.history : [];
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Severidad: {annotation ? severityLabel(annotation.level) : 'Sin clasificación'}
        {' · '}
        {severityState(annotation)}
        {scaleLabel(annotation)}
      </p>
      {history.length > 0 ? (
        <p className="text-[11px] leading-4 text-gray-400">
          Historial: {history.map((item) => `${severityLabel(item.level)} · ${severityState(item)}`).join(' · ')}
        </p>
      ) : null}
      {compact || !subjectId || !lineId ? null : (
        <form
          className="flex w-full min-w-0 flex-col gap-2 min-[390px]:flex-row min-[390px]:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (level) save.mutate(level);
          }}
        >
          <label className="sr-only" htmlFor={`severity-${subjectId}-${lineId}`}>Nivel de daño</label>
          <select
            id={`severity-${subjectId}-${lineId}`}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            <option value="">Elegir nivel</option>
            {SEVERITY_LEVELS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <button
            type="submit"
            disabled={!level || save.isPending}
            className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirmar
          </button>
        </form>
      )}
      {save.isError ? <p className="text-xs text-amber-700 dark:text-amber-300">La confirmación no se registró.</p> : null}
    </div>
  );
}

function RepairLines({ title, subjectId, lines, compact = false }) {
  if (!lines?.length) return null;
  return (
    <section className={compact ? 'mt-3' : ''}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        {lines.map((line) => {
          const contracted = declaredAmount(line.contractedMxn, line.contractedValidation);
          const collected = declaredAmount(line.collectedMxn, line.collectedValidation);
          return (
            <li key={line.lineId ?? `${line.role}-${line.part}`} className="flex min-w-0 flex-col gap-2 py-2 text-sm">
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{line.part}</span>
                  <span className="block text-xs text-gray-500">{line.role === 'labor' ? (LABOR[line.labor] ?? line.labor) : 'Refacción'}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  <span className="block text-sm font-medium">{money.format(line.quotedMxn)}</span>
                  {contracted == null ? null : <span className="block text-gray-500">Contratado {money.format(contracted)}</span>}
                  {collected == null ? null : <span className="block text-gray-500">Cobrado {money.format(collected)}</span>}
                </span>
              </span>
              {line.severityZone ? (
                <SeverityNote subjectId={subjectId} lineId={line.lineId} annotation={line.severityAnnotation} compact={compact || !line.severityAnchor} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
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
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {vehicle(active ?? record) || 'Vehículo incompleto'}
          <CatalogMark record={active ?? record} />
        </p>
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
      <LinkedEvidence kind="commercial" quoteId={quoteId} />
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
                        <CatalogMark record={revision} />
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
  return record?.presentation?.label || [record?.make, record?.model, record?.year].filter(Boolean).join(' ');
}

function CatalogMark({ record }) {
  if (record?.presentation?.provenance !== 'catalog_inferred') return null;
  return <span className="shrink-0 text-[11px] font-normal text-gray-400">Catálogo</span>;
}
