import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from './apiConfig.js';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import {
  AUTO_FIX_BASE_PRICES,
  DAMAGE_LEVEL_KEYS,
  calculateEstimate,
  coerceDamageLevelCode,
  matchPiezaFromAnalysis,
} from './autofix-pricing.js';

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

/**
 * Solo data URL para OpenAI (`data:image/...;base64,...`). Rechaza blob: y rutas locales.
 * Debe llamarse justo antes de enviar el cuerpo a `/ai-playground/test`.
 */
function assertPlaygroundVisionDataUrl(dataUrl, label = 'imagen') {
  const s = String(dataUrl ?? '').trim();
  if (!s) {
    throw new Error(`La ${label} está vacía; no se puede enviar a visión.`);
  }
  if (/^blob:/i.test(s)) {
    throw new Error(
      `La ${label} no puede enviarse como blob URL. Convierte el archivo a base64 (data:image/...;base64,...) antes de llamar al API.`,
    );
  }
  if (!/^data:image\/[a-zA-Z0-9+.+-]+;base64,/i.test(s)) {
    throw new Error(
      `Formato inválido para visión (${label}): se esperaba data:image/<tipo>;base64,... y se recibió: ${s.slice(0, 80)}…`,
    );
  }
  return s;
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

/** Lista pieza + precio (MXN) para el aviso interno SISTEMA: al autorizar en el playground. */
function buildPlaygroundAuthorizedQuoteLinesForSystem(quoteLineEdits) {
  return quoteLineEdits
    .map((r) => {
      const p = parsePrecioInput(r.precioInput);
      const amt = Number.isFinite(p) ? p : 0;
      return `- ${r.pieza}: ${formatPlaygroundMoney(amt)}`;
    })
    .join('\n');
}

/**
 * Mensaje solo para el modelo (no se muestra en el chat del simulador): datos exactos del peritaje
 * y la petición de redacción natural al cliente.
 */
function buildPlaygroundSystemAuthorizationMessage(quoteLineEdits, draftReference) {
  const lines = buildPlaygroundAuthorizedQuoteLinesForSystem(quoteLineEdits);
  const total = quoteLineEdits.reduce((acc, r) => {
    const p = parsePrecioInput(r.precioInput);
    return acc + (Number.isFinite(p) ? p : 0);
  }, 0);
  const refLine = draftReference
    ? `Referencia interna del borrador: ${draftReference}`
    : 'Referencia interna del borrador: (sin código)';
  return [
    'SISTEMA: El agente ha autorizado la siguiente cotización:',
    lines,
    `Total: ${formatPlaygroundMoney(total)}`,
    refLine,
    '',
    'Por favor, preséntala al cliente de forma natural y amigable; menciona su vehículo si lo conoces por el contexto de la conversación.',
  ].join('\n');
}

const MATRIX_PIEZA_KEYS = new Set(AUTO_FIX_BASE_PRICES.map((r) => r.pieza));

function normalizePiezaForPlayground(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return AUTO_FIX_BASE_PRICES[0]?.pieza ?? 'Cofre';
  if (MATRIX_PIEZA_KEYS.has(t)) return t;
  const canon = matchPiezaFromAnalysis(t);
  if (canon && MATRIX_PIEZA_KEYS.has(canon)) return canon;
  return AUTO_FIX_BASE_PRICES[0]?.pieza ?? 'Cofre';
}

const PLAYGROUND_DEBOUNCE_MS = 20000;
const PLAYGROUND_HISTORY_MAX = 50;

function capConversationHistory(rows) {
  if (!Array.isArray(rows) || rows.length <= PLAYGROUND_HISTORY_MAX) return rows || [];
  return rows.slice(-PLAYGROUND_HISTORY_MAX);
}

const initialPlaygroundMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Simulador conectado a la IA del backend. Los mensajes se agrupan y se envían a los 20 s de inactividad (puedes seguir escribiendo). El historial de la sesión se mantiene en memoria para diálogos largos. Nada se guarda en la base de datos real.',
  },
];

function AiPlaygroundSidebar({ testAiResponse, testAiResumeAfterDraft, disabled }) {
  const [messages, setMessages] = useState(initialPlaygroundMessages);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [draft, setDraft] = useState('');
  const [mockDraft, setMockDraft] = useState(null);
  const [isDraftPending, setIsDraftPending] = useState(false);
  const [phoneTab, setPhoneTab] = useState('chat');
  const [quotePreviewDataUrl, setQuotePreviewDataUrl] = useState(null);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [quoteLineEdits, setQuoteLineEdits] = useState([]);
  const [editingQuoteRowId, setEditingQuoteRowId] = useState(null);
  /** idle | debounce (esperando más mensajes) | thinking (llamada en curso) */
  const [playgroundPhase, setPlaygroundPhase] = useState('idle');
  const [thinkingMode, setThinkingMode] = useState(null);
  const fileInputRef = useRef(null);
  const blobUrlsRef = useRef([]);
  const listEndRef = useRef(null);
  const pendingRef = useRef([]);
  const debounceTimerRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const playgroundLockedRef = useRef(false);

  const pendingResumeContextRef = useRef(null);
  /** Última cotización autorizada en el simulador (solo memoria local; no se muestra en UI). */
  const lastAuthorizedQuoteRef = useRef(null);

  const playgroundLocked = useMemo(
    () =>
      isDraftPending ||
      (!!mockDraft &&
        Array.isArray(mockDraft.lines) &&
        mockDraft.lines.length > 0),
    [mockDraft, isDraftPending],
  );

  useEffect(() => {
    playgroundLockedRef.current = playgroundLocked;
  }, [playgroundLocked]);

  useEffect(() => {
    conversationHistoryRef.current = conversationHistory;
  }, [conversationHistory]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, playgroundPhase, mockDraft, phoneTab, isDraftPending]);

  useEffect(() => {
    if (!mockDraft) {
      setQuoteLineEdits([]);
      setPhoneTab('chat');
      setIsDraftPending(false);
      setEditingQuoteRowId(null);
      setQuotePreviewDataUrl(null);
      pendingResumeContextRef.current = null;
      return;
    }
    const lines = mockDraft.lines ?? [];
    const inv = mockDraft.analysisBasis?.inventory;
    if (Array.isArray(inv) && inv.length > 0) {
      setQuoteLineEdits(
        inv.map((it, idx) => {
          const rawSev = String(it.severidad ?? 'DM');
          const code = DAMAGE_LEVEL_KEYS.includes(rawSev)
            ? rawSev
            : coerceDamageLevelCode(rawSev);
          const pieza = normalizePiezaForPlayground(it.pieza ?? '');
          let precio = calculateEstimate(pieza, code);
          const lineAt = lines[idx];
          if (
            lineAt &&
            Number.isFinite(Number(lineAt.subtotal)) &&
            inv.length === lines.length
          ) {
            precio = Number(lineAt.subtotal);
          }
          return {
            id: `ql-${idx}-${String(it.pieza ?? '').slice(0, 20)}`,
            pieza,
            severidad: code,
            precioInput: String(Math.round(precio)),
          };
        }),
      );
      return;
    }
    if (lines.length > 0) {
      setQuoteLineEdits(
        lines.map((line, idx) => {
          const m = /^matrix:([^:]+):(.+)$/.exec(String(line.priceItemId ?? ''));
          let pieza = m ? m[1] : matchPiezaFromAnalysis(line.description) || 'Cofre';
          let severidad = m ? m[2] : coerceDamageLevelCode(line.description);
          if (!DAMAGE_LEVEL_KEYS.includes(String(severidad))) {
            severidad = coerceDamageLevelCode(String(severidad));
          }
          pieza = normalizePiezaForPlayground(pieza);
          const precio = Number.isFinite(Number(line.subtotal))
            ? Number(line.subtotal)
            : calculateEstimate(pieza, severidad);
          return {
            id: `ql-${idx}-${String(line.priceItemId ?? idx)}`,
            pieza,
            severidad,
            precioInput: String(Math.round(precio)),
          };
        }),
      );
      return;
    }
    setQuoteLineEdits([]);
  }, [mockDraft]);

  const playgroundQuoteTotal = useMemo(
    () =>
      quoteLineEdits.reduce((acc, row) => {
        const p = parsePrecioInput(row.precioInput);
        return acc + (Number.isFinite(p) ? p : 0);
      }, 0),
    [quoteLineEdits],
  );

  const handleAuthorizeMockDraft = useCallback(async () => {
    if (!mockDraft) return;
    if (quoteLineEdits.length === 0) return;

    const systemAuthorizationSummary = buildPlaygroundSystemAuthorizationMessage(
      quoteLineEdits,
      mockDraft.reference,
    );
    lastAuthorizedQuoteRef.current = {
      reference: mockDraft.reference,
      authorizedAt: new Date().toISOString(),
      lines: quoteLineEdits.map((r) => ({
        pieza: r.pieza,
        severidad: r.severidad,
        precio: parsePrecioInput(r.precioInput),
        precioInput: r.precioInput,
      })),
      total: quoteLineEdits.reduce((acc, r) => {
        const p = parsePrecioInput(r.precioInput);
        return acc + (Number.isFinite(p) ? p : 0);
      }, 0),
    };

    const resumeCtx = pendingResumeContextRef.current;
    const historySnapshot = capConversationHistory(conversationHistoryRef.current);

    setPlaygroundPhase('thinking');
    try {
      if (typeof testAiResumeAfterDraft === 'function') {
        const resumeData = await testAiResumeAfterDraft({
          userBatchText: resumeCtx?.consolidatedText ?? '',
          authorizedQuoteSummary: systemAuthorizationSummary,
          visionItems: resumeCtx?.visionItems,
          history: historySnapshot,
        });
        const followUp = resumeData?.assistantMessage?.trim() || '(La IA no devolvió texto.)';
        setMessages((prev) => [
          ...prev,
          { id: `resume-${Date.now()}`, role: 'assistant', text: followUp, isError: false },
        ]);
        setConversationHistory((prev) =>
          capConversationHistory([...prev, { role: 'assistant', text: followUp }]),
        );
        setMockDraft(null);
        setIsDraftPending(false);
        setPhoneTab('chat');
        setEditingQuoteRowId(null);
        setImageLightboxOpen(false);
        pendingResumeContextRef.current = null;
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `auth-err-${Date.now()}`,
            role: 'assistant',
            text: 'No hay función de resume conectada; no se pudo generar la respuesta de la IA.',
            isError: true,
          },
        ]);
        setMockDraft(null);
        setIsDraftPending(false);
        setPhoneTab('chat');
        setEditingQuoteRowId(null);
        setImageLightboxOpen(false);
        pendingResumeContextRef.current = null;
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-resume-${Date.now()}`,
          role: 'assistant',
          text: e?.message ?? 'Error al generar la respuesta del asistente tras autorizar',
          isError: true,
        },
      ]);
    } finally {
      setPlaygroundPhase('idle');
      setThinkingMode(null);
    }
  }, [mockDraft, quoteLineEdits, testAiResumeAfterDraft]);

  const flushPlaygroundPending = useCallback(async () => {
    if (disabled) return;
    if (playgroundLockedRef.current) {
      pendingRef.current = [];
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setPlaygroundPhase('idle');
      setThinkingMode(null);
      return;
    }
    const queue = pendingRef.current;
    pendingRef.current = [];
    debounceTimerRef.current = null;
    if (queue.length === 0) {
      setPlaygroundPhase('idle');
      setThinkingMode(null);
      return;
    }

    setPlaygroundPhase('thinking');

    const parts = [];
    let lastImageFile = null;
    let n = 0;
    for (const item of queue) {
      if (item.kind === 'text') {
        n += 1;
        parts.push(`(${n}) ${item.text}`);
      } else if (item.kind === 'image') {
        n += 1;
        parts.push(`(${n}) [Imagen: ${item.name}]`);
        lastImageFile = item.file;
      }
    }
    const consolidatedText = parts.join('\n\n');

    let imageBase64;
    if (lastImageFile) {
      try {
        imageBase64 = assertPlaygroundVisionDataUrl(await fileToDataUrl(lastImageFile));
      } catch (e) {
        setPlaygroundPhase('idle');
        setThinkingMode(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: e?.message ?? 'No se pudo leer la imagen',
            isError: true,
          },
        ]);
        return;
      }
    }

    const historyPayload = capConversationHistory(conversationHistoryRef.current);

    if (!consolidatedText.trim() && !imageBase64) {
      setPlaygroundPhase('idle');
      setThinkingMode(null);
      return;
    }

    setThinkingMode(typeof imageBase64 === 'string' ? 'vision' : 'chat');

    try {
      const data = await testAiResponse({
        userText: consolidatedText.trim() || undefined,
        imageBase64: typeof imageBase64 === 'string' ? imageBase64 : undefined,
        history: historyPayload,
      });

      if (data.isDraftPending && data.mockDraftQuote) {
        setIsDraftPending(true);
        setMockDraft(data.mockDraftQuote);
        setPhoneTab('quote');
        if (typeof imageBase64 === 'string') {
          setQuotePreviewDataUrl(imageBase64);
        }
        pendingResumeContextRef.current = {
          consolidatedText: consolidatedText.trim() || '[Imagen(es)]',
          visionItems: Array.isArray(data.visionItems) ? data.visionItems : [],
          imageDataUrl: typeof imageBase64 === 'string' ? imageBase64 : null,
        };
        setConversationHistory((prev) =>
          capConversationHistory([
            ...prev,
            { role: 'user', text: consolidatedText.trim() || '[Imagen(es)]' },
          ]),
        );
      } else {
        setIsDraftPending(false);
        setMockDraft(data.mockDraftQuote ?? null);
        if (typeof imageBase64 === 'string') {
          setQuotePreviewDataUrl(imageBase64);
        } else if (!data.mockDraftQuote) {
          setQuotePreviewDataUrl(null);
        }
        const assistantText = data.assistantMessage ?? '(Sin respuesta)';
        setMessages((prev) => [
          ...prev,
          {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            text: assistantText,
            isError: false,
          },
        ]);
        setConversationHistory((prev) =>
          capConversationHistory([
            ...prev,
            { role: 'user', text: consolidatedText.trim() || '[Imagen(es)]' },
            { role: 'assistant', text: assistantText },
          ]),
        );
      }
    } catch (err) {
      setMockDraft(null);
      setIsDraftPending(false);
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
      setThinkingMode(null);
      setPlaygroundPhase('idle');
    }
  }, [disabled, testAiResponse]);

  const schedulePlaygroundDebounce = useCallback(() => {
    if (playgroundLockedRef.current) return;
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }
    setPlaygroundPhase('debounce');
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPlaygroundPending();
    }, PLAYGROUND_DEBOUNCE_MS);
  }, [flushPlaygroundPending]);

  const handlePickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type?.startsWith('image/')) return;
    if (disabled || playgroundPhase === 'thinking' || playgroundLocked) return;
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
    pendingRef.current = [...pendingRef.current, { kind: 'image', file, name: file.name }];
    schedulePlaygroundDebounce();
  };

  const sendDraft = () => {
    const text = draft.trim();
    if (!text || disabled || playgroundPhase === 'thinking' || playgroundLocked) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: `txt-${Date.now()}`, role: 'user', text }]);
    pendingRef.current = [...pendingRef.current, { kind: 'text', text }];
    schedulePlaygroundDebounce();
  };

  const busyComposer = disabled || playgroundPhase === 'thinking' || playgroundLocked;
  const authorizeDisabled =
    disabled || playgroundPhase === 'thinking' || quoteLineEdits.length === 0;

  return (
    <aside className="flex w-[min(100%,440px)] shrink-0 flex-col border-l border-gray-200 bg-gradient-to-b from-gray-50 to-white">
      <div className="shrink-0 border-b border-gray-200/80 bg-white/90 px-5 py-4 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
          Vista previa
        </p>
        <h2 className="text-lg font-bold tracking-tight text-gray-900">AI Playground</h2>
        <p className="mt-1 text-xs text-gray-500">
          Llama a <code className="rounded bg-gray-100 px-1">/ai-playground/test</code> (visión primero si hay
          imagen) y a <code className="rounded bg-gray-100 px-1">/ai-playground/resume-after-draft</code> tras
          autorizar. Hasta {PLAYGROUND_HISTORY_MAX} turnos en memoria. Debounce 20 s.
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

            <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-zinc-900 to-zinc-950">
              <div className="flex shrink-0 border-b border-white/10 bg-zinc-950/95">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTab('chat');
                    setImageLightboxOpen(false);
                  }}
                  className={`flex-1 px-1 py-2.5 text-[11px] font-semibold transition ${
                    phoneTab === 'chat'
                      ? 'border-b-2 border-indigo-400 bg-white/5 text-white'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  💬 Chat
                </button>
                <button
                  type="button"
                  onClick={() => setPhoneTab('quote')}
                  className={`relative flex-1 px-1 py-2.5 text-[11px] font-semibold transition ${
                    phoneTab === 'quote'
                      ? 'border-b-2 border-indigo-400 bg-white/5 text-white'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  📄 Cotización
                  {mockDraft?.lines?.length > 0 ? (
                    <span
                      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-400 ring-2 ring-zinc-900"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </div>

              {phoneTab === 'chat' ? (
                <>
                  <div className="shrink-0 border-b border-white/5 bg-zinc-900/80 px-4 py-2.5 text-center backdrop-blur">
                    <p className="text-[13px] font-semibold text-white">Asistente IA</p>
                    <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
                      <p className="text-[10px] text-white/45">Prueba · sin persistir en BD</p>
                      {playgroundLocked ? (
                        <span className="rounded-full bg-rose-500/25 px-2 py-0.5 text-[9px] font-semibold text-rose-100 ring-1 ring-rose-400/40">
                          Autopiloto OFF
                        </span>
                      ) : null}
                      {isDraftPending ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-100 ring-1 ring-amber-400/35">
                          Borrador pendiente
                        </span>
                      ) : null}
                    </div>
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
                    {playgroundPhase === 'debounce' ? (
                      <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md border border-cyan-500/30 bg-cyan-950/40 px-3 py-2 text-[11px] leading-snug text-cyan-100/95">
                          IA esperando más mensajes… (agrupa envíos durante ~20 s)
                        </div>
                      </div>
                    ) : null}
                    {playgroundPhase === 'thinking' ? (
                      <div className="flex justify-start">
                        <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/70">
                          {thinkingMode === 'vision'
                            ? 'Analizando imagen y generando borrador…'
                            : 'IA pensando…'}
                        </div>
                      </div>
                    ) : null}
                    <div ref={listEndRef} />
                  </div>

                  <div className="shrink-0 border-t border-white/10 bg-zinc-900/95 p-2.5 backdrop-blur">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePickImage}
                      disabled={busyComposer}
                    />
                    <div className="mb-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busyComposer}
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
                        disabled={busyComposer}
                        placeholder={
                          disabled
                            ? 'Cargando…'
                            : playgroundLocked
                              ? 'Autopiloto OFF: autoriza el borrador para continuar…'
                              : 'Mensaje…'
                        }
                        className="max-h-24 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-white placeholder:text-white/35 outline-none disabled:opacity-40"
                      />
                      <button
                        type="button"
                        onClick={() => void sendDraft()}
                        disabled={busyComposer}
                        className="mb-0.5 shrink-0 rounded-xl bg-indigo-500 px-3 py-2 text-[12px] font-bold text-white shadow-md transition hover:bg-indigo-400 disabled:opacity-40"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/5 bg-slate-100">
                  <div className="shrink-0 border-b border-slate-200 bg-zinc-900 px-3 py-2">
                    <p className="text-[12px] font-bold text-white">Cotización</p>
                    <p className="truncate text-[9px] text-white/50">
                      {mockDraft?.reference ?? 'Sin borrador · envía imagen con daños'}
                    </p>
                  </div>

                  {quotePreviewDataUrl ? (
                    <button
                      type="button"
                      onClick={() => setImageLightboxOpen(true)}
                      className="group shrink-0 border-b border-slate-200 bg-slate-200/60 p-2 text-center transition hover:bg-slate-200"
                    >
                      <img
                        src={quotePreviewDataUrl}
                        alt="Vista previa del daño analizado"
                        className="mx-auto h-24 max-w-full rounded-lg object-cover shadow ring-1 ring-slate-300/80"
                      />
                      <p className="mt-1 text-[9px] font-medium text-slate-600 group-hover:text-indigo-700">
                        Toca para ampliar
                      </p>
                    </button>
                  ) : null}

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
                    {!mockDraft ? (
                      <p className="flex flex-1 items-center justify-center px-4 text-center text-[12px] leading-snug text-slate-600">
                        No hay cotización aún. Usa 💬 Chat para enviar imagen y texto; cuando exista borrador,
                        edítalo aquí.
                      </p>
                    ) : (
                      <>
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">
                            Pendiente de aprobación
                          </span>
                          <span className="max-w-[200px] truncate text-[9px] font-medium text-slate-600">
                            {mockDraft.reference}
                          </span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                          <table className="w-full table-fixed border-collapse text-left text-[10px]">
                            <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100 font-semibold uppercase text-slate-600">
                              <tr>
                                <th className="px-1.5 py-1.5">Pieza</th>
                                <th className="w-[52px] px-1 py-1.5">Sev.</th>
                                <th className="w-[72px] px-1 py-1.5 text-right">Precio</th>
                                <th className="w-[88px] px-1 py-1.5 text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {quoteLineEdits.map((row) => {
                                const amt = parsePrecioInput(row.precioInput);
                                const show = Number.isFinite(amt) ? amt : 0;
                                return (
                                  <Fragment key={row.id}>
                                    <tr className="border-t border-slate-100 align-middle">
                                      <td className="px-1.5 py-1 font-medium text-slate-800">{row.pieza}</td>
                                      <td className="px-1 py-1 text-slate-700">{row.severidad}</td>
                                      <td className="px-1 py-1 text-right font-semibold tabular-nums text-slate-900">
                                        {formatPlaygroundMoney(show)}
                                      </td>
                                      <td className="px-1 py-1 text-right">
                                        <div className="flex flex-wrap justify-end gap-0.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditingQuoteRowId((id) => (id === row.id ? null : row.id))
                                            }
                                            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-semibold text-indigo-700 hover:bg-slate-50"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setQuoteLineEdits((prev) => prev.filter((r) => r.id !== row.id));
                                              setEditingQuoteRowId((id) => (id === row.id ? null : id));
                                            }}
                                            className="rounded border border-red-200 bg-white px-1 py-0.5 text-[9px] font-semibold text-red-700 hover:bg-red-50"
                                          >
                                            Eliminar
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {editingQuoteRowId === row.id ? (
                                      <tr className="border-t border-indigo-100 bg-indigo-50/50">
                                        <td colSpan={4} className="px-2 py-2">
                                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                            <label className="block text-[8px] font-semibold uppercase text-slate-600">
                                              Pieza
                                              <select
                                                value={row.pieza}
                                                onChange={(e) => {
                                                  const pieza = normalizePiezaForPlayground(e.target.value);
                                                  setQuoteLineEdits((prev) =>
                                                    prev.map((r) =>
                                                      r.id === row.id
                                                        ? {
                                                            ...r,
                                                            pieza,
                                                            precioInput: String(
                                                              Math.round(calculateEstimate(pieza, r.severidad)),
                                                            ),
                                                          }
                                                        : r,
                                                    ),
                                                  );
                                                }}
                                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1 py-1 text-[10px] font-medium text-slate-900"
                                              >
                                                {AUTO_FIX_BASE_PRICES.map((pr) => (
                                                  <option key={pr.pieza} value={pr.pieza}>
                                                    {pr.pieza}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                            <label className="block text-[8px] font-semibold uppercase text-slate-600">
                                              Severidad
                                              <select
                                                value={row.severidad}
                                                onChange={(e) => {
                                                  const severidad = e.target.value;
                                                  setQuoteLineEdits((prev) =>
                                                    prev.map((r) =>
                                                      r.id === row.id
                                                        ? {
                                                            ...r,
                                                            severidad,
                                                            precioInput: String(
                                                              Math.round(calculateEstimate(r.pieza, severidad)),
                                                            ),
                                                          }
                                                        : r,
                                                    ),
                                                  );
                                                }}
                                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1 py-1 text-[10px] font-medium text-slate-900"
                                              >
                                                {DAMAGE_LEVEL_KEYS.map((k) => (
                                                  <option key={k} value={k}>
                                                    {k}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                            <label className="block text-[8px] font-semibold uppercase text-slate-600">
                                              Importe (MXN)
                                              <input
                                                type="text"
                                                inputMode="decimal"
                                                value={row.precioInput}
                                                onChange={(e) => {
                                                  const v = e.target.value;
                                                  setQuoteLineEdits((prev) =>
                                                    prev.map((r) =>
                                                      r.id === row.id ? { ...r, precioInput: v } : r,
                                                    ),
                                                  );
                                                }}
                                                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-[11px] font-semibold text-slate-900"
                                              />
                                            </label>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleAuthorizeMockDraft()}
                          disabled={authorizeDisabled}
                          className="mt-2 shrink-0 rounded-xl bg-emerald-600 px-3 py-3 text-center text-[13px] font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ✅ Autorizar y Enviar
                        </button>

                        <div className="mt-1.5 shrink-0 rounded-lg border-2 border-emerald-400/70 bg-emerald-50 px-2 py-2 text-right shadow-sm">
                          <p className="text-[8px] font-bold uppercase tracking-wide text-emerald-900">
                            Gran total
                          </p>
                          <p className="text-lg font-bold tabular-nums text-emerald-950">
                            {formatPlaygroundMoney(playgroundQuoteTotal)}
                          </p>
                          <p className="text-[8px] text-emerald-800/90">Suma de importes por línea</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {imageLightboxOpen && quotePreviewDataUrl ? (
                <div
                  role="presentation"
                  className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-black/88 p-3"
                  onClick={() => setImageLightboxOpen(false)}
                >
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/25"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageLightboxOpen(false);
                    }}
                  >
                    ✕ Cerrar
                  </button>
                  <img
                    src={quotePreviewDataUrl}
                    alt=""
                    className="max-h-[88%] max-w-full rounded-lg object-contain shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : null}
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
    async ({ userText, imageBase64, history }) => {
      const body = {
        visionPrompt: form.visionPrompt,
        chatAppointmentPrompt: form.chatAppointmentPrompt,
        userText:
          userText != null && String(userText).trim() !== '' ? String(userText).trim() : undefined,
        imageBase64:
          imageBase64 != null && String(imageBase64).trim() !== ''
            ? String(imageBase64).trim()
            : undefined,
        ...(Array.isArray(history) && history.length > 0 ? { history } : {}),
      };
      if (!body.userText && !body.imageBase64) {
        throw new Error('Falta mensaje o imagen');
      }
      if (body.imageBase64) {
        body.imageBase64 = assertPlaygroundVisionDataUrl(body.imageBase64, 'imageBase64');
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

  const testAiResumeAfterDraft = useCallback(
    async ({ userBatchText, authorizedQuoteSummary, visionItems, history }) => {
      const body = {
        chatAppointmentPrompt: form.chatAppointmentPrompt,
        userBatchText:
          userBatchText != null && String(userBatchText).trim() !== ''
            ? String(userBatchText).trim()
            : undefined,
        authorizedQuoteSummary:
          authorizedQuoteSummary != null ? String(authorizedQuoteSummary) : '',
        ...(Array.isArray(history) && history.length > 0 ? { history } : {}),
        ...(Array.isArray(visionItems) && visionItems.length > 0 ? { visionItems } : {}),
      };
      const r = await fetch(`${API_BASE_URL}/ai-playground/resume-after-draft`, {
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
    [form.chatAppointmentPrompt],
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
                <code className="rounded bg-gray-100 px-1 text-xs">createAppointment</code>. Si
                describes aquí cómo hablar con el cliente, incluye que, cuando el sistema envíe una
                autorización de cotización (mensaje interno que comienza por{' '}
                <code className="rounded bg-gray-100 px-1 text-xs">SISTEMA:</code>), la respuesta al
                cliente debe ser clara pero conversacional y, cuando encaje, mencionar la garantía
                por escrito y el repintado en cabina.
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
        <AiPlaygroundSidebar
          testAiResponse={testAiResponse}
          testAiResumeAfterDraft={testAiResumeAfterDraft}
          disabled={loading}
        />
      </div>
    </div>
  );
}
