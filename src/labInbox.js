/** Reglas de la prueba dentro de la bandeja. El backend sigue validando taller y JWT. */

export const STAGING_TALLER_ID = '01000000-0000-4000-8000-000000000010';
export const STAGING_OWNER_EMAIL_SUFFIX = '@ensayo.test';
export const LAB_MAX_IMAGES = 6;
export const LAB_MAX_TEXT = 2000;
export const LAB_MAX_BYTES = 5_242_880;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isLabChannel(platform) {
  return String(platform ?? '').trim().toLowerCase() === 'lab';
}

export function isStagingApiOrigin(origin) {
  const raw = String(origin ?? '').trim();
  if (!raw) return false;
  let host = raw.toLowerCase();
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    host = raw.toLowerCase();
  }
  if (
    host === 'omnichannel-backend-production.up.railway.app' ||
    host.includes('production')
  ) {
    return false;
  }
  return host.includes('staging');
}

export function canStartLabTrial({ apiOrigin, user, tallerId } = {}) {
  if (!isStagingApiOrigin(apiOrigin)) return false;
  const email = String(user?.email ?? '').trim().toLowerCase();
  const role = String(user?.role ?? '').trim().toLowerCase();
  const workshop = String(tallerId ?? user?.tallerId ?? '').trim();
  return (
    role === 'owner' &&
    workshop === STAGING_TALLER_ID &&
    email.endsWith(STAGING_OWNER_EMAIL_SUFFIX)
  );
}

export function labTurnPath(conversationId) {
  const id = String(conversationId ?? '').trim();
  return `/lab/conversations/${id}/turn`;
}

export function buildLabTurnPayload({ text, images, idempotencyKey } = {}) {
  const cleanText = String(text ?? '').trim();
  const photos = (Array.isArray(images) ? images : []).map((item) =>
    String(item ?? '').replace(/\s/g, ''),
  );
  if (cleanText.length > LAB_MAX_TEXT) {
    throw new Error('El texto es demasiado largo.');
  }
  if (photos.length > LAB_MAX_IMAGES) {
    throw new Error('Se pueden enviar hasta 6 fotografías.');
  }
  for (const image of photos) {
    if (/cloudinary|https?:\/\//i.test(image)) {
      throw new Error('La fotografía debe enviarse como archivo.');
    }
    if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(image)) {
      throw new Error('La fotografía debe ser JPEG, PNG o WebP.');
    }
  }
  if (!cleanText && photos.length === 0) {
    throw new Error('Escribe un mensaje o adjunta una fotografía.');
  }
  const key = String(idempotencyKey ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error('La clave del turno no es válida.');
  }
  const payload = { idempotencyKey: key };
  if (cleanText) payload.text = cleanText;
  if (photos.length) payload.images = photos;
  return payload;
}

export function acceptLabImageFile(file, selectedCount) {
  if (!file || !ACCEPTED.has(file.type)) {
    return 'Usa fotografías JPEG, PNG o WebP.';
  }
  if (file.size <= 0 || file.size > LAB_MAX_BYTES) {
    return 'Cada fotografía puede medir hasta 5 MB.';
  }
  if (selectedCount >= LAB_MAX_IMAGES) {
    return 'Se pueden enviar hasta 6 fotografías.';
  }
  return '';
}
