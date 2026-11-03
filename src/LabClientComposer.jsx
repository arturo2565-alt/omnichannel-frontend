import { useEffect, useRef, useState } from 'react';
import { readLabImageFile, takeLabFiles } from './labPhotos.jsx';
import { LAB_MAX_IMAGES, LAB_MAX_TEXT } from './labInbox.js';

export default function LabClientComposer({
  busy,
  processing,
  onSend,
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const locked = busy || submitting;
  const canSend = Boolean(text.trim() || files.length);

  useEffect(() => () => {
    filesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  const addFiles = (list) => {
    const { accepted, problem } = takeLabFiles(list, files.length);
    setError(problem || '');
    if (!accepted.length) return;
    setFiles((current) => [
      ...current,
      ...accepted.map((item) => ({
        ...item,
        url: URL.createObjectURL(item.file),
      })),
    ]);
  };

  const removeFile = (id) => {
    setFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (locked || !canSend) return;
    setError('');
    setSubmitting(true);
    try {
      const images = [];
      for (const item of files) images.push(await readLabImageFile(item.file));
      await onSend({ text, images });
      setText('');
      setFiles((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.url));
        return [];
      });
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el turno.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className={`space-y-2 ${dragging ? 'rounded-2xl ring-2 ring-indigo-300' : ''}`}
      onSubmit={(event) => void submit(event)}
      onDragOver={(event) => {
        event.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!locked) addFiles(event.dataTransfer?.files);
      }}
    >
      {processing ? (
        <p role="status" className="px-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
          El motor está procesando este turno. La respuesta llega sola, unos 25 segundos después del último envío.
        </p>
      ) : null}
      {files.length > 0 ? (
        <div className="flex items-center gap-2">
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
            {files.map((item) => (
              <li key={item.id} className="relative h-14 w-14 shrink-0">
                <img
                  src={item.url}
                  alt=""
                  className="h-14 w-14 rounded-lg border border-gray-100 object-cover dark:border-gray-700"
                />
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] text-white shadow-md hover:bg-gray-600"
                  aria-label={`Quitar ${item.file.name}`}
                  onClick={() => removeFile(item.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="shrink-0 text-[11px] text-gray-500">
            {files.length} de {LAB_MAX_IMAGES}
          </p>
        </div>
      ) : null}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={locked || files.length >= LAB_MAX_IMAGES}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:scale-105 hover:bg-gray-100 active:scale-95 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          title="Adjuntar fotografías"
          aria-label="Adjuntar fotografías"
        >
          📎
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          id="lab-client-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={LAB_MAX_TEXT}
          disabled={locked}
          aria-label="Mensaje del cliente"
          className="flex-1 rounded-full border border-gray-200 bg-white px-5 py-2.5 shadow-inner outline-none transition-all focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          placeholder="Escribe como el cliente..."
        />
        <button
          type="submit"
          disabled={locked || !canSend}
          className={`flex items-center space-x-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60 ${locked ? 'bg-gray-500' : ''}`}
        >
          <span>{locked ? 'Enviando…' : 'Enviar como cliente'}</span>
        </button>
      </div>
      {error ? (
        <p role="alert" className="px-1 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
