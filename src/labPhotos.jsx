import { ImagePlus } from 'lucide-react';
import { LAB_MAX_BYTES, LAB_MAX_IMAGES, acceptLabImageFile } from './labInbox.js';

export function readLabImageFile(file) {
  return new Promise((resolve, reject) => {
    const problem = acceptLabImageFile(file, 0);
    if (problem && problem !== 'Se pueden enviar hasta 6 fotografías.') {
      reject(new Error(problem));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result.replace(/\s/g, '') : '';
      if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) {
        reject(new Error('No se pudo leer la fotografía.'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(file);
  });
}

export function takeLabFiles(list, currentCount) {
  const incoming = Array.from(list ?? []);
  const accepted = [];
  let problem = '';
  for (const file of incoming) {
    const nextCount = currentCount + accepted.length;
    const reason = acceptLabImageFile(file, nextCount);
    if (reason) {
      problem = problem || reason;
      if (reason.startsWith('Se pueden enviar')) break;
      continue;
    }
    accepted.push({ id: crypto.randomUUID(), file });
  }
  return { accepted, problem };
}

export function formatLabFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortLabFileName(name) {
  const value = String(name || 'fotografia');
  if (value.length <= 22) return value;
  const dot = value.lastIndexOf('.');
  const ext = dot > 0 ? value.slice(dot) : '';
  const keep = Math.max(8, 18 - ext.length);
  return `${value.slice(0, keep)}…${ext}`;
}

export function LabPhotoPicker({
  inputRef,
  dragging,
  count,
  onBrowse,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelect,
}) {
  const selected =
    count === 1 ? '1 seleccionada' : `${count} seleccionadas`;
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="sr-only"
        onChange={onSelect}
      />
      <button
        type="button"
        onClick={onBrowse}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-4 text-center transition ${
          dragging
            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
            : 'border-stone-300 bg-stone-50 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-950'
        }`}
      >
        <ImagePlus className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden />
        <span className="text-sm font-medium">Suelta las fotografías o haz clic para elegirlas</span>
        <span className="text-xs text-gray-500">
          JPG, PNG o WebP · hasta {LAB_MAX_IMAGES} · {selected}
        </span>
      </button>
    </div>
  );
}

export { LAB_MAX_BYTES, LAB_MAX_IMAGES };
