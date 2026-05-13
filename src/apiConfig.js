/** Base URL del webhook Nest (`…/webhook`). Sobrescribe con `VITE_API_BASE_URL` en `.env`. */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://omnichannel-backend-production.up.railway.app/webhook';

/**
 * Origen del backend sin `/webhook` (rutas como `/catalog/*` viven en la raíz de la app Nest).
 * Opcional: `VITE_API_ORIGIN` (p. ej. `http://localhost:3000`).
 */
export const API_ORIGIN_URL =
  import.meta.env.VITE_API_ORIGIN ||
  String(API_BASE_URL).replace(/\/webhook\/?$/i, '');
