import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import {
  createLabConversation,
  fetchConversationMessages,
  sendLabTurn,
} from './apiClient.js';
import { connectWorkshopSocket } from './realtimeSocket.js';
import { LAB_MAX_IMAGES, LAB_MAX_TEXT } from './labInbox.js';
import {
  LabPhotoPicker,
  formatLabFileSize,
  readLabImageFile,
  shortLabFileName,
  takeLabFiles,
} from './labPhotos.jsx';

const LAB_KEY = 'pegazuz.lab.conversationId';
const WAIT_MS = 40_000;

function isImageContent(value) {
  return /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value ?? ''));
}

function sortMessages(rows) {
  return [...rows].sort((a, b) => {
    const left = new Date(a.createdAt ?? 0).getTime();
    const right = new Date(b.createdAt ?? 0).getTime();
    return left - right;
  });
}

function groupThread(messages) {
  const groups = [];
  for (const message of messages) {
    const outbound = message.direction === 'outbound';
    const image = isImageContent(message.content);
    const last = groups[groups.length - 1];
    if (image && last?.kind === 'images' && last.outbound === outbound) {
      last.items.push(message);
      continue;
    }
    groups.push(
      image
        ? { id: message.id, kind: 'images', outbound, items: [message] }
        : { id: message.id, kind: 'text', outbound, message },
    );
  }
  return groups;
}

export default function LabPage() {
  const [conversationId, setConversationId] = useState(
    () => sessionStorage.getItem(LAB_KEY) || '',
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const bottomRef = useRef(null);
  const waitTimer = useRef(null);
  const fileInputRef = useRef(null);
  const thread = useMemo(() => groupThread(messages), [messages]);

  const loadMessages = useCallback(async (id) => {
    if (!id) return;
    const rows = await fetchConversationMessages(id);
    setMessages(sortMessages(rows));
  }, []);

  useEffect(() => {
    const next = files.map((item) => ({
      ...item,
      url: URL.createObjectURL(item.file),
    }));
    setPreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);

  useEffect(() => {
    if (!conversationId) return undefined;
    let cancelled = false;
    loadMessages(conversationId).catch((err) => {
      if (!cancelled) setError(err?.message || 'No se pudo cargar la conversación.');
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const socket = connectWorkshopSocket();
    if (!socket) return undefined;
    const onNewMessage = (message) => {
      const id = message?.conversationId || message?.conversation?.id;
      if (id !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((row) => row.id === message.id)) return prev;
        return sortMessages([...prev, message]);
      });
      if (message?.direction === 'outbound') setWaiting(false);
    };
    socket.on('newMessage', onNewMessage);
    return () => {
      socket.off('newMessage', onNewMessage);
      socket.disconnect();
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, waiting]);

  useEffect(() => () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
  }, []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const startConversation = async () => {
    setBusy(true);
    setError('');
    try {
      const created = await createLabConversation();
      sessionStorage.setItem(LAB_KEY, created.id);
      setConversationId(created.id);
      setMessages([]);
      setText('');
      setFiles([]);
      setWaiting(false);
    } catch (err) {
      setError(err?.message || 'No se pudo crear la conversación.');
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (list) => {
    const { accepted, problem } = takeLabFiles(list, files.length);
    setError(problem || '');
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
  };

  const sendTurn = async () => {
    if (!conversationId || busy) return;
    setBusy(true);
    setError('');
    try {
      if (files.length > LAB_MAX_IMAGES) {
        throw new Error('Se pueden enviar hasta 6 fotografías.');
      }
      const images = [];
      for (const item of files) {
        images.push(await readLabImageFile(item.file));
      }
      const payload = {
        idempotencyKey: crypto.randomUUID(),
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(images.length ? { images } : {}),
      };
      if (!payload.text && !payload.images) {
        throw new Error('Escribe un mensaje o adjunta una fotografía.');
      }
      await sendLabTurn(conversationId, payload);
      setText('');
      setFiles([]);
      setWaiting(true);
      await loadMessages(conversationId);
      if (waitTimer.current) clearTimeout(waitTimer.current);
      waitTimer.current = setTimeout(() => setWaiting(false), WAIT_MS);
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el turno.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-stone-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <OmnichannelLeftRail />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <h1 className="text-lg font-semibold">Laboratorio</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Conversación interna del taller de ensayo. No envía mensajes a Meta.
            </p>
          </div>
          <button
            type="button"
            onClick={startConversation}
            disabled={busy}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Nueva conversación
          </button>
        </header>

        {!conversationId ? (
          <section className="m-auto max-w-md px-6 text-center">
            <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Inicia una conversación para probar texto, fotografías y la cotización real.
            </p>
            <button
              type="button"
              onClick={startConversation}
              disabled={busy}
              className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Iniciar conversación
            </button>
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white/80 px-4 py-2 text-sm dark:border-gray-800 dark:bg-gray-900/80">
              <span className="truncate text-gray-500">Conversación {conversationId.slice(0, 8)}</span>
              <Link
                to={`/?conversation=${conversationId}`}
                className="shrink-0 font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 dark:text-amber-300"
              >
                Abrir cotización
              </Link>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="mx-auto w-full max-w-3xl space-y-4">
              {thread.length === 0 ? (
                <p className="mx-auto max-w-sm pt-10 text-center text-sm leading-6 text-gray-500">
                  Escribe el mensaje del cliente y, si hace falta, adjunta las fotografías del daño.
                </p>
              ) : null}
              {thread.map((group) => (
                <ThreadGroup
                  key={group.id}
                  group={group}
                  onOpenImage={setLightbox}
                />
              ))}
              {waiting ? (
                <p className="max-w-xl rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  El agente responde al cerrar la ráfaga, unos 25 segundos después del último envío.
                </p>
              ) : null}
              <div ref={bottomRef} />
              </div>
            </div>
            <form
              className="border-t border-stone-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6"
              onSubmit={(event) => {
                event.preventDefault();
                void sendTurn();
              }}
            >
              <div className="mx-auto w-full max-w-3xl">
              <label className="mb-3 block text-sm font-medium" htmlFor="lab-message">
                Mensaje
                <textarea
                  id="lab-message"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={3}
                  maxLength={LAB_MAX_TEXT}
                  className="mt-1 w-full resize-y rounded-2xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-gray-700 dark:bg-gray-950"
                  placeholder="Ejemplo: quiero arreglar mi Beetle 2015"
                />
              </label>
              <LabPhotoPicker
                inputRef={fileInputRef}
                dragging={dragging}
                count={files.length}
                onBrowse={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  addFiles(event.dataTransfer?.files);
                }}
                onSelect={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              {previews.length > 0 ? (
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {previews.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 dark:border-gray-700 dark:bg-gray-950"
                    >
                      <img
                        src={item.url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={item.file.name}>
                          {shortLabFileName(item.file.name)}
                        </p>
                        <p className="text-[11px] text-gray-500">{formatLabFileSize(item.file.size)}</p>
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300"
                          onClick={() => setFiles((current) => current.filter((row) => row.id !== item.id))}
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-500">
                  {files.length === 0
                    ? 'Ninguna fotografía'
                    : `${files.length} de ${LAB_MAX_IMAGES} fotografías`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={files.length === 0 || busy}
                    onClick={() => setFiles([])}
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
                  >
                    Limpiar fotografías
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Enviar turno
                  </button>
                </div>
              </div>
              </div>
            </form>
          </>
        )}
        {error ? (
          <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </main>
      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Fotografía ampliada"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-900"
            onClick={() => setLightbox(null)}
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </button>
          <img
            src={lightbox}
            alt="Fotografía enviada"
            className="max-h-[85dvh] max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

function ThreadGroup({ group, onOpenImage }) {
  const mine = !group.outbound;
  const shell = mine
    ? 'ml-auto bg-amber-600 text-white'
    : 'border border-stone-200 bg-white text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
  const width = group.kind === 'text' && group.outbound ? 'max-w-[min(100%,42rem)]' : 'max-w-[min(100%,28rem)]';
  return (
    <article className={`${width} ${mine ? 'ml-auto' : ''}`}>
      <p className={`mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide ${mine ? 'text-right text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
        {mine ? 'Cliente' : 'Agente'}
      </p>
      <div className={`rounded-2xl px-4 py-3 ${shell}`}>
        {group.kind === 'text' ? (
          <p className={`whitespace-pre-wrap break-words ${group.outbound ? 'text-[15px] leading-7' : 'text-sm leading-6'}`}>
            {group.message.content}
          </p>
        ) : (
          <div className={`grid gap-2 ${group.items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="overflow-hidden rounded-xl"
                onClick={() => onOpenImage(item.content)}
              >
                <img
                  src={item.content}
                  alt="Fotografía enviada"
                  className="h-28 w-full object-cover sm:h-36"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
