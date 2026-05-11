import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';

const emptyForm = {
  visionPrompt: '',
  chatAppointmentPrompt: '',
  businessMapsUrl: '',
  businessPhone: '',
  businessHours: '',
};

export default function AiSettingsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedOk, setSavedOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedOk(false);
    try {
      const r = await fetch(`${API_BASE_URL}/ai-config`);
      if (!r.ok) throw new Error(`No se pudo cargar la configuración (${r.status})`);
      const data = await r.json();
      setForm({
        visionPrompt: String(data.visionPrompt ?? ''),
        chatAppointmentPrompt: String(data.chatAppointmentPrompt ?? ''),
        businessMapsUrl: String(data.businessMapsUrl ?? ''),
        businessPhone: String(data.businessPhone ?? ''),
        businessHours: String(data.businessHours ?? ''),
      });
    } catch (e) {
      setError(e?.message ?? 'Error de red');
      setForm(emptyForm);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedOk(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const r = await fetch(`${API_BASE_URL}/ai-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(t || `Error al guardar (${r.status})`);
      }
      setSavedOk(true);
    } catch (err) {
      setError(err?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              Administración
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              IA y variables de negocio
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Prompts del modelo y datos que usa el taller en cotizaciones y citas.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8">
        {loading ? (
          <p className="text-center text-gray-500">Cargando configuración…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            ) : null}
            {savedOk ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
              >
                Cambios guardados correctamente.
              </div>
            ) : null}

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Prompt de visión (daños en fotos)
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Instrucciones del sistema para el análisis pericial del lote de imágenes (JSON{' '}
                <code className="rounded bg-gray-100 px-1 text-xs">items</code>).
              </p>
              <label className="mt-4 block">
                <span className="sr-only">Prompt de visión</span>
                <textarea
                  value={form.visionPrompt}
                  onChange={(e) => update('visionPrompt', e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="mt-2 w-full resize-y rounded-xl border border-gray-300 bg-gray-50/50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Describe cómo debe analizar la IA las fotos de golpes…"
                />
              </label>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Prompt de chat y citas
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Tono, reglas de agendamiento y uso de la herramienta{' '}
                <code className="rounded bg-gray-100 px-1 text-xs">createAppointment</code>.
              </p>
              <label className="mt-4 block">
                <span className="sr-only">Prompt de chat</span>
                <textarea
                  value={form.chatAppointmentPrompt}
                  onChange={(e) => update('chatAppointmentPrompt', e.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="mt-2 w-full resize-y rounded-xl border border-gray-300 bg-gray-50/50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 shadow-inner outline-none ring-indigo-500/0 transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Personalidad del asistente y políticas de citas…"
                />
              </label>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Variables de negocio
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Datos que puedes reutilizar en mensajes al cliente (maps, contacto, horario).
              </p>
              <div className="mt-6 grid gap-6 sm:grid-cols-1">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Dirección / Google Maps (URL)
                  </span>
                  <input
                    type="url"
                    value={form.businessMapsUrl}
                    onChange={(e) => update('businessMapsUrl', e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
                    placeholder="https://maps.app.goo.gl/…"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Teléfono del taller
                  </span>
                  <input
                    type="text"
                    value={form.businessPhone}
                    onChange={(e) => update('businessPhone', e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
                    placeholder="+52 …"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Horarios de atención
                  </span>
                  <textarea
                    value={form.businessHours}
                    onChange={(e) => update('businessHours', e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25"
                    placeholder="Ej. Lun–Vie 9:00–18:00, Sáb 9:00–14:00"
                  />
                </label>
              </div>
            </section>

            <div className="sticky bottom-0 flex flex-col items-stretch gap-3 border-t border-gray-200 bg-gray-50/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => load()}
                disabled={loading || saving}
                className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
              >
                Descartar cambios
              </button>
              <button
                type="submit"
                disabled={saving || loading}
                className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </main>
      </div>
    </div>
  );
}
