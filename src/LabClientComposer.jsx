import { useEffect, useRef, useState } from 'react';
import {
  LabPhotoPicker,
  formatLabFileSize,
  readLabImageFile,
  shortLabFileName,
  takeLabFiles,
} from './labPhotos.jsx';
import { LAB_MAX_IMAGES, LAB_MAX_TEXT } from './labInbox.js';

export default function LabClientComposer({
  busy,
  processing,
  onSend,
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const locked = busy || submitting;

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

  const addFiles = (list) => {
    const { accepted, problem } = takeLabFiles(list, files.length);
    setError(problem || '');
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (locked) return;
    setError('');
    setSubmitting(true);
    try {
      const images = [];
      for (const item of files) images.push(await readLabImageFile(item.file));
      await onSend({ text, images });
      setText('');
      setFiles([]);
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el turno.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      {processing ? (
        <p
          role="status"
          className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          El motor está procesando este turno. La respuesta llega sola, unos 25 segundos después del último envío.
        </p>
      ) : null}
      <label className="block text-sm font-medium" htmlFor="lab-client-message">
        Mensaje del cliente
        <textarea
          id="lab-client-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          maxLength={LAB_MAX_TEXT}
          disabled={locked}
          className="mt-1 w-full resize-y rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-gray-700 dark:bg-gray-950"
          placeholder="Ejemplo: ¿qué costo tiene reparar este golpe?"
        />
      </label>
      <LabPhotoPicker
        inputRef={inputRef}
        dragging={dragging}
        count={files.length}
        onBrowse={() => inputRef.current?.click()}
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
        <ul className="grid grid-cols-2 gap-2">
          {previews.map((item) => (
            <li
              key={item.id}
              className="flex gap-2 rounded-xl border border-stone-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-950"
            >
              <img src={item.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {files.length === 0
            ? 'Ninguna fotografía'
            : `${files.length} de ${LAB_MAX_IMAGES} fotografías`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={files.length === 0 || locked}
            onClick={() => setFiles([])}
            className="rounded-full border border-stone-300 px-3 py-2 text-sm font-medium disabled:opacity-40 dark:border-gray-600"
          >
            Limpiar fotografías
          </button>
          <button
            type="submit"
            disabled={locked}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {locked ? 'Enviando…' : 'Enviar como cliente'}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
