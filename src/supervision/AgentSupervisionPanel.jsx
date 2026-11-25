import { describePricingTrace, formatSupervisionMoney } from './supervision-model.js';

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-sm text-gray-800 dark:text-gray-100">{children}</div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value || '—'}</span>
    </p>
  );
}

function TraceLine({ line }) {
  const trace = line.trace;
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2 text-[11px] leading-5 dark:bg-gray-800/80">
      <p className="font-medium">{line.label}</p>
      {!trace ? (
        <p>Trazabilidad no disponible.</p>
      ) : !line.traceAgrees ? (
        <p>La traza no corresponde al importe autorizado.</p>
      ) : (
        <>
          <p>Código: {trace.physicalPanelKey || line.code || 'no consta'}</p>
          {describePricingTrace(trace).map((fact) => (
            <p key={`${line.id}-${fact.label}`}>
              {fact.label}: {fact.value}
            </p>
          ))}
        </>
      )}
      <p>Importe: {formatSupervisionMoney(line.amount)}</p>
    </div>
  );
}

export default function AgentSupervisionPanel({
  model,
  onToggleAutonomy,
  autonomyBusy = false,
  onOpenEvidence,
  embedded = false,
  children,
}) {
  if (!model) {
    return (
      <p className="p-4 text-center text-xs text-gray-500">
        Selecciona una conversación para supervisar al agente.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {embedded ? null : (
        <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Supervisión del agente
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Expediente, cotización y cita de esta conversación
          </p>
        </header>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Section title="Estado del agente">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              model.agent.autonomous
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
                : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100'
            }`}
          >
            {model.agent.mode}
          </span>
          <Row label="Conversación" value={model.agent.status} />
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {model.agent.operation}
          </p>
          {model.agent.blocked.length > 0 ? (
            <ul className="space-y-1 text-xs text-rose-800 dark:text-rose-200">
              {model.agent.blocked.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">Sin bloqueos registrados.</p>
          )}
        </Section>

        <Section title="Cliente y vehículo">
          <Row label="Nombre" value={model.client.name} />
          <Row label="Canal" value={model.client.channel} />
          {model.client.vehicles.length === 0 ? (
            <p className="text-xs text-gray-500">Vehículo desconocido.</p>
          ) : (
            model.client.vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-lg bg-gray-50 px-2 py-2 dark:bg-gray-800/80">
                <p className="text-sm font-medium">{vehicle.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' · ') || 'Sin marca, modelo o año'}
                  {' · '}
                  {vehicle.provenance}
                </p>
              </div>
            ))
          )}
        </Section>

        <Section title="Cotización">
          <Row label="Estado" value={model.quote.label} />
          <Row label={model.quote.amountCaption} value={model.quote.totalLabel} />
          {model.quote.liveTotalLabel ? (
            <Row label={model.quote.liveCaption} value={model.quote.liveTotalLabel} />
          ) : null}
          {model.quote.lines.length === 0 ? (
            <p className="text-xs text-gray-500">No hay partidas en el expediente.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {model.quote.lines.map((line) => (
                <li key={line.id} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{line.label}</span>
                  <span className="shrink-0 font-medium">{formatSupervisionMoney(line.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Evidencia">
          {model.evidence.length === 0 ? (
            <p className="text-xs text-gray-500">Sin fotografías vinculadas.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {model.evidence.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenEvidence?.(item.url)}
                  className="w-16 shrink-0 text-left"
                >
                  <img
                    src={item.url}
                    alt={item.panel || 'Evidencia'}
                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-gray-200 transition hover:ring-indigo-400 dark:ring-gray-700"
                  />
                  <span className="mt-1 block truncate text-[10px] text-gray-500">
                    {item.panel || 'Pieza'}
                    {item.severity ? ` · ${item.severity}` : ''}
                    {item.treatment ? ` · ${item.treatment}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <details className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Trazabilidad
          </summary>
          <div className="mt-2 space-y-2">
            {model.quote.lines.length === 0 ? (
              <p className="text-xs text-gray-500">No hay servicios que trazar.</p>
            ) : (
              model.quote.lines.map((line) => (
                <TraceLine key={`trace-${line.id}`} line={line} />
              ))
            )}
          </div>
        </details>

        <Section title="Agenda">
          {!model.appointment ? (
            <p className="text-xs text-gray-500">No hay una cita activa en esta conversación.</p>
          ) : (
            <>
              <Row label="Estado" value={model.appointment.status} />
              <Row label="Horario" value={model.appointment.when || 'Sin horario'} />
              <Row label="Nombre" value={model.appointment.name} />
              <Row label="Vehículo" value={model.appointment.vehicle} />
              {model.appointment.phone ? <Row label="Teléfono" value={model.appointment.phone} /> : null}
              {model.appointment.discrepancy ? (
                <p className="rounded-lg bg-rose-50 px-2 py-2 text-xs text-rose-900 dark:bg-rose-950/50 dark:text-rose-100">
                  {model.appointment.discrepancy}
                </p>
              ) : null}
              <a
                href="/calendar"
                className="inline-flex text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
              >
                Abrir calendario
              </a>
            </>
          )}
        </Section>

        <Section title="Intervención humana">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={autonomyBusy}
              onClick={onToggleAutonomy}
              className="min-h-10 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {autonomyBusy
                ? 'Actualizando…'
                : model.agent.autonomous
                  ? 'Tomar conversación'
                  : 'Retomar autonomía'}
            </button>
            {children}
          </div>
        </Section>
      </div>
    </div>
  );
}
