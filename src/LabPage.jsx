import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { OmnichannelLeftRail } from './OmnichannelLeftRail.jsx';
import {
  createLabConversation,
  fetchConversationMessages,
  sendLabTurn,
} from './apiClient.js';
import { connectWorkshopSocket } from './realtimeSocket.js';

const LAB_KEY = 'pegazuz.lab.conversationId';
const MAX_IMAGES = 6;
const MAX_BYTES = 5_242_880;
const WAIT_MS = 40_000;

function isImageContent(value) {
  return /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value ?? ''));
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Usa fotografías JPEG, PNG o WebP.'));
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      reject(new Error('Cada fotografía puede medir hasta 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result.replace(/\s/g, '') : '';
      if (!isImageContent(value)) {
        reject(new Error('No se pudo leer la fotografía.'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(file);
  });
}

function sortMessages(rows) {
  return [...rows].sort((a, b) => {
    const left = new Date(a.createdAt ?? 0).getTime();
    const right = new Date(b.createdAt ?? 0).getTime();
    return left - right;
  });
}

export default function LabPage() {
  const [conversationId, setConversationId] = useState(
    () => sessionStorage.getItem(LAB_KEY) || '',
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const waitTimer = useRef(null);

  const loadMessages = useCallback(async (id) => {
    if (!id) return;
    const rows = await fetchConversationMessages(id);
    setMessages(sortMessages(rows));
  }, []);

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
  }, [messages]);

  useEffect(() => () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
  }, []);

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

  const sendTurn = async () => {
    if (!conversationId || busy) return;
    setBusy(true);
    setError('');
    try {
      if (files.length > MAX_IMAGES) {
        throw new Error('Se pueden enviar hasta 6 fotografías.');
      }
      const images = [];
      for (const file of files) {
        images.push(await readImageFile(file));
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
    <div className="flex h-[100dvh] overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <OmnichannelLeftRail />
      <main className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
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
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
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
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-800">
              <span className="truncate text-gray-500">Conversación {conversationId.slice(0, 8)}</span>
              <Link
                to={`/?conversation=${conversationId}`}
                className="shrink-0 font-medium text-amber-700 underline dark:text-amber-300"
              >
                Abrir cotización
              </Link>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => {
                const outbound = message.direction === 'outbound';
                const image = isImageContent(message.content);
                return (
                  <article
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      outbound
                        ? 'ml-auto bg-amber-100 text-gray-900 dark:bg-amber-900/40 dark:text-amber-50'
                        : 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                    }`}
                  >
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">
                      {outbound ? 'Agente' : 'Cliente'}
                    </p>
                    {image ? (
                      <img
                        src={message.content}
                        alt="Fotografía enviada"
                        className="max-h-48 rounded-lg"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </article>
                );
              })}
              {waiting ? (
                <p className="text-sm text-gray-500">
                  El agente responde al cerrar la ráfaga, unos 25 segundos después del último envío.
                </p>
              ) : null}
              <div ref={bottomRef} />
            </div>
            <form
              className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              onSubmit={(event) => {
                event.preventDefault();
                void sendTurn();
              }}
            >
              <label className="mb-2 block text-sm">
                Mensaje
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-950"
                  placeholder="Ejemplo: quiero arreglar mi Beetle 2015"
                />
              </label>
              <label className="mb-3 block text-sm">
                Fotografías
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="mt-1 block w-full text-sm"
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES);
                    setFiles(selected);
                  }}
                />
              </label>
              {files.length > 0 ? (
                <ul className="mb-3 text-xs text-gray-500">
                  {files.map((file) => (
                    <li key={`${file.name}-${file.size}`}>
                      {file.name} ({Math.ceil(file.size / 1024)} KB)
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-amber-600"
              >
                Enviar turno
              </button>
            </form>
          </>
        )}
        {error ? (
          <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}
