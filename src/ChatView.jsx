import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import QuickReplies from './QuickReplies';
import {
  AUTO_FIX_BASE_PRICES,
  DAMAGE_LEVEL_KEYS,
  calculateEstimate,
  coerceDamageLevelCode,
  matchPiezaFromAnalysis,
} from './autofix-pricing';

/** Nombres canónicos de pieza en la matriz (coinciden con `value` del select). */
const MATRIX_PIEZA_KEYS = new Set(
  AUTO_FIX_BASE_PRICES.map((row) => row.pieza),
);

// --- FUNCIONES DE UTILIDAD (Fuera del componente) ---
// Añade soporte para Facebook y mejora la visualización del badge con círculo perfecto y centrado
const classifyPlatform = (raw) => {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  if (
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fb_') ||
    s === 'fb'
  ) {
    return 'facebook';
  }
  return 'other';
};

const PlatformBadge = ({
  platform,
  size = 'md',
  className = '',
}) => {
  const kind = classifyPlatform(platform);
  // Configuramos dimensiones fijas para asegurar círculo perfecto y no deformable
  const dim =
    size === 'sm'
      ? 'w-[18px] h-[18px] text-[11px]'
      : 'w-[24px] h-[24px] text-[13px]';

  // Las siguientes reglas aseguran círculo perfecto, centrado y sin deformaciones:
  // w-[] h-[] rounded-full flex items-center justify-center shrink-0
  const baseBadge =
    `flex items-center justify-center rounded-full font-bold text-white shrink-0 box-border shadow-sm ${dim} ${className}`;

  if (kind === 'whatsapp') {
    return (
      <span
        title="WhatsApp"
        className={`bg-green-500 ${baseBadge}`}
        aria-hidden
      >
        W
      </span>
    );
  }
  if (kind === 'instagram') {
    return (
      <span
        title="Instagram"
        className={`bg-pink-500 ${baseBadge}`}
        aria-hidden
      >
        I
      </span>
    );
  }
  if (kind === 'facebook') {
    return (
      <span
        title="Facebook"
        className={`bg-blue-600 ${baseBadge}`}
        aria-hidden
      >
        {/* Usa la letra F como icono representativo */}
        F
      </span>
    );
  }
  return (
    <span
      title="Canal desconocido"
      className={`bg-gray-500 ${baseBadge}`}
      aria-hidden
    >
      ?
    </span>
  );
};

const isImage = (url) => {
  if (!url) return false;
  // Soporte para URLs reales y para URLs temporales de blob
  return (url.match(/\.(jpeg|jpg|gif|png|webp)$/) != null) || url.includes('images.unsplash.com') || url.startsWith('blob:');
};

const getPreviewText = (content) => {
  if (!content) return 'Sin mensajes aún...';
  if (isImage(content)) return '📷 Imagen';
  return content;
};

const SEVERIDAD_LABELS = {
  DL: 'DL — Leve',
  DML: 'DML — Menor',
  DM: 'DM — Moderado',
  DMF: 'DMF',
  DF: 'DF — Grave',
  DMFuerte: 'DMFuerte — Muy grave',
};

/** Valor inicial de pieza en filas añadidas manualmente hasta elegir una de la matriz. */
const MANUAL_ROW_PLACEHOLDER_PIEZA = 'Seleccionar';

function isPlaceholderPieza(pieza) {
  return String(pieza ?? '')
    .trim()
    .toLowerCase() === MANUAL_ROW_PLACEHOLDER_PIEZA.toLowerCase();
}

/** Alinea el texto IA / backend con una fila de la matriz cuando hay match seguro; si no, conserva texto (se muestra como opción extra en el select). */
function normalizePiezaForPanel(raw) {
  const t = String(raw ?? '').trim();
  if (!t || isPlaceholderPieza(t)) return MANUAL_ROW_PLACEHOLDER_PIEZA;
  if (MATRIX_PIEZA_KEYS.has(t)) return t;
  const canon = matchPiezaFromAnalysis(t);
  if (canon && MATRIX_PIEZA_KEYS.has(canon)) return canon;
  return t;
}

function recalcRowPriceFromMatrix(row) {
  const n = calculateEstimate(row.pieza, row.severidad);
  if (n <= 0) return row;
  return { ...row, precioInput: String(Math.round(n)) };
}

function piezaSelectShowsUnmappedFallback(pieza) {
  const t = String(pieza ?? '').trim();
  if (!t || isPlaceholderPieza(t)) return false;
  return !MATRIX_PIEZA_KEYS.has(t);
}

/** Compat servidor antiguo: urls_origen primero; luego urls_asociadas */
function urlsFromInventoryItem(it) {
  if (Array.isArray(it?.urls_origen) && it.urls_origen.length > 0) {
    return [...it.urls_origen];
  }
  if (Array.isArray(it?.urls_asociadas) && it.urls_asociadas.length > 0) {
    return [...it.urls_asociadas];
  }
  return [];
}

function parsePrecioInput(raw) {
  const s = String(raw ?? '').trim().replace(/\s/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function ChatView({ 
  contacts, 
  selectedConvId, 
  setSelectedConvId, 
  selectedUserName, 
  messages, 
  reply, 
  setReply, 
  onSendMessage,
  onSendQuoteText,
  onRefresh,
  quickReplySuggestions,
  onGetAiSuggestion, 
  isAiLoading,
  isConnected,

  // --- 🌟 NUEVAS PROPS 🌟 ---
  filePreviewUrl, // URL temporal del blob
  onFileSelect,   // Función handleFileSelect de App.jsx
  onClearFile,    // Función handleClearFile de App.jsx
  isSending,       // Estado de carga del envío
  apiBaseUrl,
  onDraftQuotePatched,
}) {

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); // Referencia al input hidden
  const [platformFilter, setPlatformFilter] = useState('all');

  const filteredContacts = useMemo(() => {
    if (platformFilter === 'all') return contacts;
    return contacts.filter((c) => classifyPlatform(c.platform) === platformFilter);
  }, [contacts, platformFilter]);

  const selectedContact = contacts.find((c) => c.id === selectedConvId);

  const latestDraftQuote = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i]?.draftQuote;
      if (q && q.formalNarrative) return { messageId: list[i].id, quote: q };
    }
    return null;
  }, [messages]);

  const latestQuoteMessage = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    return list.find((m) => m.id === latestDraftQuote?.messageId) ?? null;
  }, [messages, latestDraftQuote?.messageId]);

  const [conversationDraftRows, setConversationDraftRows] = useState([]);
  /** Una fila por daño/pieza: pieza, severidad, precio editable, URLs para mini galería */
  const [quoteRows, setQuoteRows] = useState([]);
  const [quoteFormDirty, setQuoteFormDirty] = useState(false);
  const [quoteSaveError, setQuoteSaveError] = useState('');
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [isSendingFinalQuote, setIsSendingFinalQuote] = useState(false);

  /** Borrador de sesión: prioriza fila cuyo messageId coincide con el mensaje que muestra la cotización; si no, el más reciente del API. */
  const activeDraftForPanel = useMemo(() => {
    if (!Array.isArray(conversationDraftRows) || conversationDraftRows.length === 0) {
      return null;
    }
    if (!latestDraftQuote?.messageId) {
      return conversationDraftRows[0] ?? null;
    }
    return (
      conversationDraftRows.find((r) => r.messageId === latestDraftQuote.messageId) ??
      conversationDraftRows[0] ??
      null
    );
  }, [conversationDraftRows, latestDraftQuote?.messageId]);

  const refreshConversationDraftQuotes = useCallback(
    async (signal) => {
      if (!selectedConvId || !apiBaseUrl) {
        setConversationDraftRows([]);
        return;
      }
      try {
        const r = await fetch(
          `${apiBaseUrl}/conversations/${selectedConvId}/draft-quotes`,
          signal ? { signal } : {},
        );
        const data = r.ok ? await r.json() : [];
        setConversationDraftRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (signal?.aborted || e?.name === 'AbortError') return;
        setConversationDraftRows([]);
      }
    },
    [selectedConvId, apiBaseUrl],
  );

  useEffect(() => {
    if (!selectedConvId || !apiBaseUrl) {
      setConversationDraftRows([]);
      return;
    }
    const ac = new AbortController();
    void refreshConversationDraftQuotes(ac.signal);
    return () => ac.abort();
  }, [
    selectedConvId,
    apiBaseUrl,
    latestDraftQuote?.messageId,
    latestDraftQuote?.quote?.total,
    latestDraftQuote?.quote?.subtotal,
    refreshConversationDraftQuotes,
  ]);

  const quoteSyncKey = useMemo(() => {
    if (!latestDraftQuote?.quote) return '';
    const q = latestDraftQuote.quote;
    const basis = q.analysisBasis ?? {};
    const inv =
      Array.isArray(basis.inventory) && basis.inventory.length > 0
        ? basis.inventory
        : Array.isArray(latestQuoteMessage?.damageAnalysis?.inventory) &&
            latestQuoteMessage.damageAnalysis.inventory.length > 0
          ? latestQuoteMessage.damageAnalysis.inventory
          : null;
    const invKey = inv?.map((x) => `${x.pieza}:${x.severidad}`).join('|') ?? '';
    const linesKey = JSON.stringify(
      (q.lines ?? []).map((l) => Number(l.subtotal ?? 0)),
    );
    const bkItems = activeDraftForPanel?.items;
    const itemsKey =
      Array.isArray(bkItems) && bkItems.length > 0
        ? [...bkItems]
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map(
              (it) =>
                `${it.id ?? ''}:${it.pieza}:${it.severidad}:${it.precioMx}`,
            )
            .join('|')
        : '';
    return `${latestDraftQuote.messageId}|${q.total}|${invKey}|${linesKey}|bk:${itemsKey}|dk:${activeDraftForPanel?.id ?? ''}`;
  }, [latestDraftQuote, latestQuoteMessage, activeDraftForPanel]);

  useEffect(() => {
    if (!latestDraftQuote?.quote) return;
    const q = latestDraftQuote.quote;
    const basis = q.analysisBasis ?? {};
    const damage = latestQuoteMessage?.damageAnalysis ?? {};
    const inv =
      Array.isArray(basis.inventory) && basis.inventory.length > 0
        ? basis.inventory
        : Array.isArray(damage.inventory) && damage.inventory.length > 0
          ? damage.inventory
          : null;

    const msgImg =
      latestQuoteMessage?.content && isImage(latestQuoteMessage.content)
        ? [latestQuoteMessage.content]
        : [];

    const lines = q.lines ?? [];
    const backendItems = activeDraftForPanel?.items;

    /** Prioridad 1: filas relacionales del backend (`DraftQuoteItem`). */
    if (Array.isArray(backendItems) && backendItems.length > 0) {
      const sorted = [...backendItems].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      const rows = sorted.map((it, idx) => {
        const rawSev = String(it.severidad ?? 'DM');
        const code = DAMAGE_LEVEL_KEYS.includes(rawSev)
          ? rawSev
          : coerceDamageLevelCode(rawSev);
        let precio = Number(it.precioMx ?? 0);
        const lineAt = lines[idx];
        if (
          lineAt &&
          Number.isFinite(Number(lineAt.subtotal)) &&
          sorted.length === lines.length
        ) {
          precio = Number(lineAt.subtotal);
        }
        const urlsRaw = Array.isArray(it.urlsOrigen) ? it.urlsOrigen : [];
        let urls = urlsRaw.map(String).filter(Boolean);
        if (!urls.length && idx === 0 && msgImg.length) urls = [...msgImg];
        return {
          id: it.id ? String(it.id) : `row-be-${idx}-${String(it.pieza).slice(0, 20)}`,
          pieza: normalizePiezaForPanel(it.pieza ?? ''),
          severidad: code,
          precioInput: String(Math.round(precio)),
          urls_origen: urls,
        };
      });
      setQuoteRows(rows);
    } else if (inv?.length) {
      const rows = inv.map((it, idx) => {
        const rawSev = String(it.severidad ?? 'DM');
        const code = DAMAGE_LEVEL_KEYS.includes(rawSev)
          ? rawSev
          : coerceDamageLevelCode(rawSev);
        let precio = calculateEstimate(it.pieza, code);
        const lineAt = lines[idx];
        if (
          lineAt &&
          Number.isFinite(Number(lineAt.subtotal)) &&
          inv.length === lines.length
        ) {
          precio = Number(lineAt.subtotal);
        }
        let urls = urlsFromInventoryItem(it);
        if (!urls.length && idx === 0 && msgImg.length) urls = [...msgImg];
        return {
          id: `row-${idx}-${String(it.pieza).slice(0, 24)}`,
          pieza: normalizePiezaForPanel(it.pieza ?? ''),
          severidad: code,
          precioInput: String(Math.round(precio)),
          urls_origen: urls,
        };
      });
      setQuoteRows(rows);
    } else {
      const rawSev = String(basis.severidad ?? 'DM');
      const code = DAMAGE_LEVEL_KEYS.includes(rawSev)
        ? rawSev
        : coerceDamageLevelCode(rawSev);
      setQuoteRows([
        {
          id: 'row-0-single',
          pieza: normalizePiezaForPanel(basis.pieza ?? ''),
          severidad: code,
          precioInput: String(
            Math.round(Number(q.total ?? q.subtotal ?? 0)),
          ),
          urls_origen: msgImg,
        },
      ]);
    }
    setQuoteFormDirty(false);
    setQuoteSaveError('');
  }, [quoteSyncKey]);

  const granTotalPanel = useMemo(
    () =>
      quoteRows.reduce((acc, r) => {
        const n = parsePrecioInput(r.precioInput);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0),
    [quoteRows],
  );

  const persistDraftQuotePatch = useCallback(async () => {
    if (!apiBaseUrl || !activeDraftForPanel?.id) {
      const msg =
        'Aún no se puede guardar: espera a cargar el borrador o recarga la conversación.';
      setQuoteSaveError(msg);
      throw new Error(msg);
    }
    if (quoteRows.length === 0) {
      setQuoteSaveError('Añade al menos una pieza a la cotización.');
      throw new Error('bad pieza');
    }
    const linesPayload = quoteRows.map((r) => ({
      pieza: r.pieza.trim(),
      severidad: r.severidad,
      precioMx: parsePrecioInput(r.precioInput),
      urls_origen: r.urls_origen ?? [],
    }));
    for (let i = 0; i < linesPayload.length; i++) {
      const L = linesPayload[i];
      if (!L.pieza) {
        setQuoteSaveError(`La pieza no puede estar vacía (fila ${i + 1}).`);
        throw new Error('bad pieza');
      }
      if (isPlaceholderPieza(L.pieza)) {
        setQuoteSaveError(
          `Elige una pieza de la lista en la fila ${i + 1} (sustituir "${MANUAL_ROW_PLACEHOLDER_PIEZA}").`,
        );
        throw new Error('bad pieza');
      }
      if (!Number.isFinite(L.precioMx) || L.precioMx < 0) {
        setQuoteSaveError(`Precio inválido en fila ${i + 1} (número ≥ 0).`);
        throw new Error('bad price');
      }
    }
    setQuoteSaveError('');
    const res = await fetch(`${apiBaseUrl}/quote/${activeDraftForPanel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryLines: linesPayload }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `HTTP ${res.status}`);
    }
    const entity = await res.json();
    onDraftQuotePatched?.({
      messageId: entity.messageId,
      draftQuote: entity.quotePayload,
      damageAnalysis: entity.damageAnalysis,
    });
    await refreshConversationDraftQuotes();
    setQuoteFormDirty(false);
    return entity;
  }, [
    apiBaseUrl,
    activeDraftForPanel?.id,
    quoteRows,
    onDraftQuotePatched,
    selectedConvId,
    refreshConversationDraftQuotes,
  ]);

  const handleGuardarCambios = async () => {
    setIsSavingQuote(true);
    setQuoteSaveError('');
    try {
      await persistDraftQuotePatch();
    } catch (e) {
      if (e.message !== 'bad price' && e.message !== 'bad pieza') {
        setQuoteSaveError(e.message || 'Error al guardar');
      }
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleEnviarCotizacionFinal = async () => {
    setIsSendingFinalQuote(true);
    setQuoteSaveError('');
    try {
      const entity = await persistDraftQuotePatch();
      await onSendQuoteText?.(entity.quotePayload.formalNarrative);
    } catch (e) {
      if (e.message !== 'bad price' && e.message !== 'bad pieza') {
        setQuoteSaveError(e.message || 'Error al enviar la cotización');
      }
    } finally {
      setIsSendingFinalQuote(false);
    }
  };

  const handleAddManualPiezaRow = useCallback(() => {
    setQuoteRows((prev) => [
      ...prev,
      {
        id: `row-manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        pieza: MANUAL_ROW_PLACEHOLDER_PIEZA,
        severidad: 'DL',
        precioInput: '0',
        urls_origen: [],
      },
    ]);
    setQuoteFormDirty(true);
  }, []);

  const handleRemoveQuoteRow = useCallback((rowId) => {
    setQuoteRows((prev) => prev.filter((r) => r.id !== rowId));
    setQuoteFormDirty(true);
  }, []);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!selectedConvId || platformFilter === 'all') return;
    const visible = filteredContacts.some((c) => c.id === selectedConvId);
    if (!visible) setSelectedConvId(null);
  }, [filteredContacts, platformFilter, selectedConvId, setSelectedConvId]);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 overflow-hidden font-sans">
      
      {/* 1. SIDEBAR CANALES */}
      <div className="w-20 bg-gray-900 flex flex-col items-center py-4 space-y-4 shadow-xl z-10">
        {[
          { id: 'whatsapp', letter: 'W', className: 'bg-green-500' },
          { id: 'instagram', letter: 'I', className: 'bg-pink-500' },
          { id: 'facebook', letter: 'F', className: 'bg-blue-600' },
        ].map(({ id, letter, className }) => (
          <button
            key={id}
            type="button"
            title={id === 'whatsapp' ? 'WhatsApp' : id === 'instagram' ? 'Instagram' : 'Facebook'}
            onClick={() => setPlatformFilter((prev) => (prev === id ? 'all' : id))}
            className={`flex h-12 w-12 items-center justify-center rounded-full font-bold text-white shadow-lg transition hover:scale-105 ${className} ${
              platformFilter === id ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105' : ''
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* 2–4. Bandeja + chat + panel cotización */}
      <div className="flex min-w-0 flex-1 flex-row">
      {/* 2. LISTA CONTACTOS */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white shadow-inner xl:w-[280px]">
        <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
          <div className="p-4 pb-3 font-bold text-xl flex justify-between items-center">
            <span>Bandeja</span>
            <button onClick={onRefresh} className="text-[10px] bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-blue-600 font-medium transition">🔄 Actualizar</button>
          </div>
          <div className="px-4 pb-3 flex gap-1.5 flex-wrap items-center font-normal">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'instagram', label: 'Instagram' },
              { id: 'facebook', label: 'Facebook' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlatformFilter(id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  platformFilter === id
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((contact) => (
            <div key={contact.id} onClick={() => setSelectedConvId(contact.id)} className={`p-4 cursor-pointer border-b transition flex items-center space-x-3 ${selectedConvId === contact.id ? 'bg-blue-50 border-r-4 border-r-blue-500' : 'hover:bg-gray-50'}`}>
              <div className="relative shrink-0 h-12 w-12">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-lg font-bold text-white shadow-md">
                  {contact.contactName ? contact.contactName.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                  <PlatformBadge platform={contact.platform} size="sm" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-gray-800 truncate">{contact.contactName}</p>
                  <span className="text-[10px] text-gray-400 ml-2 shrink-0">{contact.lastMessageAt ? new Date(contact.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-1 italic">
                  {contact.direction === 'outbound' ? <span className="text-blue-500 font-medium">Tú: </span> : ''}
                  {getPreviewText(contact.lastMessage)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. VENTANA CHAT + 4. PANEL COTIZACIÓN */}
      <div className="flex min-w-0 flex-1 flex-row">
      <div className="flex min-w-0 flex-1 flex-col border-r border-gray-200 bg-white">
        {selectedConvId ? (
          <>
            {/* Header Chat */}
            <div className="p-4 border-b shadow-sm font-semibold bg-white flex justify-between items-center z-10">
              <div className="flex items-center space-x-3">
                <div className="relative h-9 w-9 shrink-0">
                  <div className="flex h-full w-full items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-bold text-blue-600">
                    {selectedUserName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="pointer-events-none absolute bottom-[-1px] right-[-1px] z-[1] rounded-full shadow-sm ring-2 ring-white">
                    <PlatformBadge platform={selectedContact?.platform} size="sm" />
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate">{selectedUserName}</span>
                  <span className="text-[10px] text-gray-400 font-normal truncate">ID: {selectedConvId}</span>
                </div>
              </div>
              <span className={`text-xs font-normal flex items-center ${isConnected ? 'text-green-500' : 'text-red-500'}`}><span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>{isConnected ? 'Online' : 'Desconectado'}</span>
            </div>
            
            {/* Mensajes Chat */}
            <div className="flex-1 p-6 bg-[#e5ddd5] overflow-y-auto flex flex-col space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`p-3 rounded-2xl shadow-sm max-w-[80%] ${msg.direction === 'inbound' ? 'bg-white self-start text-gray-800 rounded-tl-none' : 'bg-indigo-600 text-white self-end rounded-tr-none'}`}>
                  {isImage(msg.content) ? (
                    <img src={msg.content} alt="Adjunto" className="rounded-lg max-h-72 object-cover cursor-pointer hover:opacity-95 transition" onClick={() => window.open(msg.content, '_blank')} />
                  ) : ( <p className="text-sm leading-relaxed">{msg.content}</p> )}
                  <div className={`text-[9px] mt-1 text-right opacity-60 ${msg.direction === 'inbound' ? 'text-gray-500' : 'text-indigo-100'}`}>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* --- SECCIÓN DE ENTRADA PRO (Multimedia + IA) --- */}
            <div className="p-4 border-t bg-gray-50 mt-auto z-10">
              
              <QuickReplies
                suggestions={quickReplySuggestions}
                onPick={setReply}
                disabled={!!filePreviewUrl}
              />

              {/* --- 🌟 VISTA PREVIA DE LA IMAGEN (Thumbnail) 🌟 --- */}
              {filePreviewUrl && (
                <div className="mb-3 p-2 bg-white border border-gray-200 rounded-xl shadow-lg flex items-center space-x-3 relative animate-in fade-in slide-in-from-bottom-2">
                  <img 
                    src={filePreviewUrl} 
                    alt="Previsualización" 
                    className="w-16 h-16 rounded-lg object-cover border border-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Imagen seleccionada</p>
                    <p className="text-xs text-gray-500">Lista para enviar a Cloudinary</p>
                  </div>
                  {/* Botón ✕ para cancelar */}
                  <button 
                    onClick={onClearFile}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs hover:bg-gray-600 shadow-md transition"
                    title="Cancelar imagen"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Barra de Entrada */}
              <div className="flex space-x-2 items-center">
                
                {/* Botón Clip 📎 (Hidden Input Trigger) */}
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 hover:scale-105 active:scale-95 shadow-sm"
                  title="Adjuntar imagen"
                >
                  📎
                </button>
                {/* INPUT HIDDEN REAL */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={(e) => {
                    onFileSelect(e.target.files[0]);
                    e.target.value = null; // Reset para poder elegir la misma imagen dos veces
                  }} 
                />

                {/* Botón IA ✨ */}
                {!filePreviewUrl && (
                    <button onClick={onGetAiSuggestion} disabled={isAiLoading} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md border ${isAiLoading ? 'bg-gray-100 border-gray-200' : 'bg-white border-purple-200 text-purple-600 hover:bg-purple-50 hover:scale-110 active:scale-95'}`}>
                    {isAiLoading ? <span className="animate-spin">⏳</span> : '✨'}
                    </button>
                )}

                {/* Input de Texto (Deshabilitado si hay imagen para simplificar) */}
                <input 
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !filePreviewUrl && onSendMessage()}
                  id="chat-reply-input"
                  disabled={!!filePreviewUrl || isSending}
                  className={`flex-1 border border-gray-200 rounded-full px-5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400 transition-all bg-white shadow-inner ${filePreviewUrl ? 'bg-gray-100 text-gray-400 italic' : ''}`} 
                  placeholder={filePreviewUrl ? "Imagen lista. Haz clic en Enviar ->" : `Responder a ${selectedUserName}...`} 
                />
                
                {/* Botón Enviar 🚀 */}
                <button 
                  onClick={onSendMessage} 
                  disabled={isSending}
                  className={`bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold hover:bg-indigo-700 shadow-md active:scale-95 transition-all flex items-center space-x-2 ${isSending ? 'opacity-70 bg-gray-500' : ''}`}
                >
                  {isSending ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <span>Enviar</span>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-gray-50 text-center text-gray-400">
            <div><div className="mb-4 text-8xl opacity-10">💬</div><p className="text-xl font-semibold text-gray-400">Bandeja de Entrada</p><p className="text-sm opacity-60">Selecciona un chat para empezar a gestionar</p></div>
          </div>
        )}
      </div>

      {/* 4. Panel de Cotización */}
      <aside className="flex w-[min(100%,360px)] shrink-0 flex-col border-l border-gray-200 bg-slate-50 shadow-inner">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-gray-900">Panel de Cotización</h2>
          <p className="mt-0.5 text-[10px] text-gray-500">Borrador generado por IA · requiere tu validación</p>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          {!selectedConvId ? (
            <p className="text-center text-xs text-gray-500">Selecciona una conversación para ver cotizaciones de este chat.</p>
          ) : !latestDraftQuote ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white/80 p-4 text-center text-xs text-gray-500">
              Aquí aparecerá la cotización cuando el sistema analice una imagen (daños / taller) en este chat.
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                  {latestDraftQuote.quote.status === 'PENDING_APPROVAL' ? 'Pendiente de aprobación' : latestDraftQuote.quote.status}
                </span>
                {latestDraftQuote.quote.reference ? (
                  <span className="text-[10px] text-gray-500">{latestDraftQuote.quote.reference}</span>
                ) : null}
                {quoteFormDirty ? (
                  <span className="text-[10px] font-medium text-amber-700">Cambios sin guardar</span>
                ) : null}
              </div>

              <div className="mb-3 flex max-h-[min(78vh,640px)] min-h-0 shrink-0 flex-col gap-2 overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Daños detectados ({quoteRows.length}) — editable por pieza
                </p>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
                  {quoteRows.map((row, idx) => {
                    const thumbs = row.urls_origen ?? [];
                    return (
                      <div
                        key={row.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left shadow-sm"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                          <div className="flex min-w-0 flex-1 items-baseline gap-2">
                            <span className="shrink-0 text-[11px] font-bold text-slate-800">
                              Daño {idx + 1}
                            </span>
                            {row.pieza && !isPlaceholderPieza(row.pieza) ? (
                              <span
                                className="truncate text-[10px] font-medium text-slate-500"
                                title={row.pieza}
                              >
                                {row.pieza}
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={quoteRows.length <= 1}
                            onClick={() => handleRemoveQuoteRow(row.id)}
                            title={
                              quoteRows.length <= 1
                                ? 'Debe quedar al menos una pieza en el borrador'
                                : 'Quitar esta pieza de la cotización'
                            }
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            aria-label="Eliminar pieza de la cotización"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                        </div>
                        <label className="block text-[10px] font-medium text-gray-700">
                          Pieza
                          <select
                            value={row.pieza}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuoteFormDirty(true);
                              setQuoteRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id
                                    ? recalcRowPriceFromMatrix({
                                        ...r,
                                        pieza: v,
                                      })
                                    : r,
                                ),
                              );
                            }}
                            className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value={MANUAL_ROW_PLACEHOLDER_PIEZA}>
                              Seleccionar pieza…
                            </option>
                            {piezaSelectShowsUnmappedFallback(row.pieza) ? (
                              <option value={row.pieza}>
                                {row.pieza} (texto IA — elige pieza de la lista)
                              </option>
                            ) : null}
                            {AUTO_FIX_BASE_PRICES.map((pr) => (
                              <option key={pr.pieza} value={pr.pieza}>
                                {pr.pieza}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-[10px] font-medium text-gray-700">
                          Severidad
                          <select
                            value={row.severidad}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuoteFormDirty(true);
                              setQuoteRows((prev) =>
                                prev.map((r) => {
                                  if (r.id !== row.id) return r;
                                  return recalcRowPriceFromMatrix({
                                    ...r,
                                    severidad: v,
                                  });
                                }),
                              );
                            }}
                            className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {DAMAGE_LEVEL_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {SEVERIDAD_LABELS[k] ?? k}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="mt-2 block text-[10px] font-medium text-gray-700">
                          Precio (MXN)
                          <span className="ml-1 font-normal text-gray-400">
                            — editable (redondeo / descuento)
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.precioInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuoteRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, precioInput: v } : r,
                                ),
                              );
                              setQuoteFormDirty(true);
                            }}
                            className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="0"
                          />
                        </label>

                        <div className="mt-2.5 rounded-md border border-dashed border-slate-200 bg-white px-2 py-1.5">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            Fotos (evidencia)
                          </p>
                          {thumbs.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {thumbs.map((url) => (
                                <button
                                  key={url}
                                  type="button"
                                  title="Abrir imagen"
                                  onClick={() =>
                                    window.open(url, '_blank', 'noopener,noreferrer')
                                  }
                                  className="overflow-hidden rounded-md border border-gray-200 shadow-sm transition hover:opacity-90"
                                >
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-12 w-12 object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[9px] italic text-gray-400">
                              Sin fotos vinculadas a este daño.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    disabled={
                      !activeDraftForPanel?.id ||
                      isSavingQuote ||
                      isSendingFinalQuote
                    }
                    onClick={handleAddManualPiezaRow}
                    title={
                      activeDraftForPanel?.id
                        ? 'Agregar línea editable con la misma matriz'
                        : 'Esperando borrador del servidor'
                    }
                    className="w-full rounded-lg border border-dashed border-indigo-300 bg-white py-2.5 text-[11px] font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    + Añadir Pieza Manualmente
                  </button>
                </div>
                <div className="shrink-0 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                    Gran total
                  </p>
                  <p className="text-xl font-bold tabular-nums text-emerald-950">
                    {granTotalPanel.toLocaleString('es-MX', {
                      style: 'currency',
                      currency: 'MXN',
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  <p className="text-[9px] text-emerald-800/90">
                    Suma de todos los precios de la lista
                  </p>
                </div>

                {!activeDraftForPanel?.id ? (
                  <p className="text-[10px] text-amber-800">
                    Obteniendo enlace del borrador en el servidor…
                  </p>
                ) : null}
                {quoteSaveError ? (
                  <p className="text-[10px] text-red-600">{quoteSaveError}</p>
                ) : null}
              </div>

              {Array.isArray(latestDraftQuote.quote.lines) && latestDraftQuote.quote.lines.length > 0 ? (
                <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white text-[11px] shadow-sm">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-gray-100 text-[9px] uppercase text-gray-600">
                      <tr>
                        <th className="px-2 py-1.5">Concepto</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestDraftQuote.quote.lines.map((line, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-2 py-1.5 text-gray-800">{line.description}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-gray-900">
                            {line.quantity}×{Number(line.unitPrice).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}
                            <br />
                            <span className="text-[10px] text-gray-500">{Number(line.subtotal).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-xs font-bold text-gray-900">
                    Total:{' '}
                    {Number(latestDraftQuote.quote.total ?? latestDraftQuote.quote.subtotal ?? 0).toLocaleString('es-MX', {
                      style: 'currency',
                      currency: 'MXN',
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-800 shadow-sm">
                <pre className="whitespace-pre-wrap font-sans">{latestDraftQuote.quote.formalNarrative}</pre>
              </div>
              <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  disabled={
                    isSending ||
                    isSavingQuote ||
                    isSendingFinalQuote ||
                    !activeDraftForPanel?.id
                  }
                  onClick={handleGuardarCambios}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-900 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingQuote ? 'Guardando…' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  disabled={
                    isSending ||
                    isSavingQuote ||
                    isSendingFinalQuote ||
                    !activeDraftForPanel?.id
                  }
                  onClick={handleEnviarCotizacionFinal}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSendingFinalQuote || isSending
                    ? 'Enviando…'
                    : 'Enviar Cotización Final'}
                </button>
                <button
                  type="button"
                  disabled={isSending || isSavingQuote || isSendingFinalQuote}
                  onClick={() => {
                    setReply(latestDraftQuote.quote.formalNarrative);
                    document.getElementById('chat-reply-input')?.focus?.();
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copiar texto al cuadro de respuesta
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
      </div>
      </div>
    </div>
  );
}

export default ChatView;