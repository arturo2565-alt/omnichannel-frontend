import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';

const emptyForm = {
  visionPrompt: '',
  chatAppointmentPrompt: '',
  businessMapsUrl: '',
  businessPhone: '',
  businessHours: '',
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('No se pudo leer la imagen'));
    fr.readAsDataURL(file);
  });
}

function formatPlaygroundMoney(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

/** Misma lógica que en `ChatView.jsx` para importes editables. */
function parsePrecioInput(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const initialPlaygroundMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Simulador conectado a la IA del backend. Usa los prompts del formulario (aunque no los hayas guardado). Nada de esto se guarda en conversaciones reales.',
  },
];

function AiPlaygroundSidebar({ testAiResponse, disabled }) {
  const [messages, setMessages] = useState(initialPlaygroundMessages);
  const [draft, setDraft] = useState('');
  const [mockDraftQuote, setMockDraftQuote] = useState(null);
  const [phoneScreen, setPhoneScreen] = useState('chat');
  const [quoteLineEdits, setQuoteLineEdits] = useState([]);
  const [playgroundBusy, setPlaygroundBusy] = useState(false);
  const fileInputRef = useRef(null);
  const blobUrlsRef = useRef([]);
  const listEndRef = useRef(null);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, playgroundBusy, mockDraftQuote, phoneScreen]);

  useEffect(() => {
    if (!mockDraftQuote) {
      setQuoteLineEdits([]);
      setPhoneScreen('chat');
      return;
    }
    const lines = mockDraftQuote.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      setQuoteLineEdits([]);
      return;
    }
    setQuoteLineEdits(
      lines.map((line, idx) => ({
        id: `ql-${idx}-${String(line.priceItemId ?? idx)}`,
        priceItemId: line.priceItemId,
        description: line.description,
        quantity: Number(line.quantity) > 0 ? Number(line.quantity) : 1,
        unitPriceInput: String(Math.round(Number(line.unitPrice) || 0)),
      })),
    );
  }, [mockDraftQuote]);

  const playgroundQuoteTotal = useMemo(
    () =>
      quoteLineEdits.reduce((acc, row) => {
        const u = parsePrecioInput(row.unitPriceInput);
        const q = row.quantity;
        return acc + (Number.isFinite(u) ? u * q : 0);
      }, 0),
    [quoteLineEdits],
  );

  const runPlayground = async (payload) => {
    if (disabled) return;
    setPlaygroundBusy(true);
    setMockDraftQuote(null);
    try {
      const data = await testAiResponse(payload);
      setMockDraftQuote(data.mockDraftQuote ?? null);
      setMessages((prev) => [
        ...prev,
        {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          text: data.assistantMessage ?? '(Sin respuesta)',
          isError: false,
        },
      ]);
    } catch (err) {
      setMockDraftQuote(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: err?.message ?? 'Error al llamar a la IA',
          isError: true,
        },
      ]);
    } finally {
      setPlaygroundBusy(false);
    }
  };

  const handlePickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type?.startsWith('image/')) return;
    if (disabled) return;
    const url = URL.createObjectURL(file);
    blobUrlsRef.current.push(url);
    setMessages((prev) => [
      ...prev,
      {
        id: `img-${Date.now()}`,
        role: 'user',
        imageUrl: url,
        imageName: file.name,
      },
    ]);
    try {
      const imageBase64 = await fileToDataUrl(file);
      await runPlayground({ imageBase64 });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: err?.message ?? 'Error al procesar la imagen',
          isError: true,
        },
      ]);
    }
  };

  const sendDraft = async () => {
    const text = draft.trim();
    if (!text) return;
    if (disabled) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: `txt-${Date.now()}`, role: 'user', text }]);
    await runPlayground({ userText: text });
  };

  const busy = disabled || playgroundBusy;

  return (
    <aside className="flex w-[min(100%,440px)] shrink-0 flex-col border-l border-gray-200 bg-gradient-to-b from-gray-50 to-white">
      <div className="shrink-0 border-b border-gray-200/80 bg-white/90 px-5 py-4 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
          Vista previa
        </p>
        <h2 className="text-lg font-bold tracking-tight text-gray-900">AI Playground</h2>
        <p className="mt-1 text-xs text-gray-500">
          Llama a <code className="rounded bg-gray-100 px-1">/ai-playground/test</code> con los prompts del
          formulario. Cotizaciones de prueba solo en estado local.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-6">
        <div
          className="relative flex flex-col rounded-[2.75rem] bg-zinc-900 p-[11px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset] ring-1 ring-white/10"
          style={{ width: 375 + 22 }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[14px] z-20 h-[28px] w-[120px] -translate-x-1/2 rounded-full bg-black"
          />
          <div className="relative flex h-[812px] w-[375px] flex-col overflow-hidden rounded-[2.1rem] bg-zinc-950 shadow-inner ring-1 ring-black/40">
            <div className="relative z-10 flex shrink-0 items-end justify-between bg-zinc-950 px-6 pb-1 pt-10 text-[11px] font-medium tabular-nums text-white/90">
              <span>9:41</span>
              <div className="flex items-center gap-1.5 pr-0.5">
                <span className="opacity-80">5G</span>
                <span className="inline-block h-2.5 w-6 rounded-sm border border-white/40 p-[1px]">
                  <span className="block h-full w-4/5 rounded-[1px] bg-emerald-400" />
                </span>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-zinc-900 to-zinc-950">
              {phoneScreen === 'quote' && mockDraftQuote ? (
                <>
                  <div className="shrink-0 border-b border-white/10 bg-zinc-900/95 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setPhoneScreen('chat')}
                      className="mb-1 flex items-center gap-0.5 text-[11px] font-medium text-indigo-300 transition hover:text-white"
                    >
                      <svg
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Volver al chat
                    </button>
                    <p className="text-[13px] font-bold text-white">Panel de Cotización</p>
                    <p className="text-[9px] text-white/50">Borrador de prueba · misma lógica que el panel admin</p>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 p-2">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">
                        Pendiente de aprobación
                      </span>
                      <span className="max-w-[200px] truncate text-[9px] font-medium text-slate-600">
                        {mockDraftQuote.reference}
                      </span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                      <table className="w-full table-fixed border-collapse text-left">
                        <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100 text-[8px] font-semibold uppercase text-slate-600">
                          <tr>
                            <th className="px-1.5 py-1.5">Concepto</th>
                            <th className="w-[72px] px-1 py-1.5 text-right">P. unit.</th>
                            <th className="w-[64px] px-1 py-1.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quoteLineEdits.map((row) => {
                            const unit = parsePrecioInput(row.unitPriceInput);
                            const lineTotal = (Number.isFinite(unit) ? unit : 0) * row.quantity;
                            return (
                              <tr key={row.id} className="border-t border-slate-100 align-top">
                                <td className="px-1.5 py-1.5 text-[9px] leading-snug text-slate-800">
                                  <span className="line-clamp-3" title={row.description}>
                                    {row.description}
                                  </span>
                                </td>
                                <td className="px-1 py-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={row.unitPriceInput}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setQuoteLineEdits((prev) =>
                                        prev.map((r) =>
                                          r.id === row.id ? { ...r, unitPriceInput: v } : r,
                                        ),
                                      );
                                    }}
                                    className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-[9px] text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300"
                                  />
                                </td>
                                <td className="whitespace-nowrap px-1 py-1.5 text-right text-[9px] font-semibold text-slate-800">
                                  {formatPlaygroundMoney(lineTotal)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-1.5 shrink-0 rounded-lg border-2 border-emerald-400/70 bg-emerald-50 px-2 py-2 text-right shadow-sm">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-emerald-900">
                        Gran total
                      </p>
                      <p className="text-lg font-bold tabular-nums text-emerald-950">
                        {formatPlaygroundMoney(playgroundQuoteTotal)}
                      </p>
                      <p className="text-[8px] text-emerald-800/90">Suma de precios unitarios × cantidad</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="shrink-0 border-b border-white/5 bg-zinc-900/80 px-4 py-2.5 text-center backdrop-blur">
                    <p className="text-[13px] font-semibold text-white">Asistente IA</p>
                    <p className="text-[10px] text-white/45">Prueba · sin persistir en BD</p>
                  </div>

                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
                            m.role === 'user'
                              ? 'rounded-br-md bg-indigo-600 text-white'
                              : m.isError
                                ? 'rounded-bl-md border border-red-400/40 bg-red-950/50 text-red-100'
                                : 'rounded-bl-md border border-white/10 bg-white/10 text-white/95'
                          }`}
                        >
                          {m.imageUrl ? (
                            <div className="space-y-1.5">
                              <img
                                src={m.imageUrl}
                                alt={m.imageName || 'Imagen'}
                                className="max-h-[200px] w-full max-w-[240px] rounded-xl object-cover"
                              />
                              {m.imageName ? (
                                <p className="truncate text-[10px] font-medium text-white/75">
                                  {m.imageName}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {playgroundBusy ? (
                      <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/60">
                          Consultando IA…
                        </div>
                      </div>
                    ) : null}
                    <div ref={listEndRef} />
                  </div>

                  {mockDraftQuote ? (
                    <div className="shrink-0 border-t border-amber-500/40 bg-gradient-to-r from-amber-950/80 to-amber-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-amber-100">Presupuesto generado</p>
                            <p className="truncate text-[9px] text-amber-200/80">{mockDraftQuote.reference}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPhoneScreen('quote')}
                          className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-950 shadow transition hover:bg-amber-300"
                        >
                          Ver Presupuesto
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="shrink-0 border-t border-white/10 bg-zinc-900/95 p-2.5 backdrop-blur">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePickImage}
                      disabled={busy}
                    />
                    <div className="mb-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15 disabled:opacity-40"
                      >
                        <svg
                          className="h-4 w-4 opacity-90"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        Subir Imagen
                      </button>
                    </div>
                    <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-zinc-800/80 px-2 py-1.5">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void sendDraft();
                          }
                        }}
                        rows={1}
                        disabled={busy}
                        placeholder={disabled ? 'Cargando…' : 'Mensaje…'}
                        className="max-h-24 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-white placeholder:text-white/35 outline-none disabled:opacity-40"
                      />
                      <button
                        type="button"
                        onClick={() => void sendDraft()}
                        disabled={busy}
                        className="mb-0.5 shrink-0 rounded-xl bg-indigo-500 px-3 py-2 text-[12px] font-bold text-white shadow-md transition hover:bg-indigo-400 disabled:opacity-40"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

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

  const testAiResponse = useCallback(
    async ({ userText, imageBase64 }) => {
      const body = {
        visionPrompt: form.visionPrompt,
        chatAppointmentPrompt: form.chatAppointmentPrompt,
        userText:
          userText != null && String(userText).trim() !== '' ? String(userText).trim() : undefined,
        imageBase64:
          imageBase64 != null && String(imageBase64).trim() !== ''
            ? String(imageBase64).trim()
            : undefined,
      };
      if (!body.userText && !body.imageBase64) {
        throw new Error('Falta mensaje o imagen');
      }
      const r = await fetch(`${API_BASE_URL}/ai-playground/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const raw = await r.text().catch(() => '');
        let msg = raw?.trim() || `Error ${r.status}`;
        try {
          const j = JSON.parse(raw);
          if (j?.message != null) {
            msg = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
          }
        } catch {
          /* texto plano */
        }
        if (msg.length > 320) msg = `${msg.slice(0, 320)}…`;
        throw new Error(msg);
      }
      return r.json();
    },
    [form.visionPrompt, form.chatAppointmentPrompt],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <OmnichannelLeftRail />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
        <AiPlaygroundSidebar testAiResponse={testAiResponse} disabled={loading} />
      </div>
    </div>
  );
}
