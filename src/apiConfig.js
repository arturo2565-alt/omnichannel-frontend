/** Base URL del webhook Nest (`…/webhook`). Sobrescribe con `VITE_API_BASE_URL` en `.env`. */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'https://omnichannel-backend-production.up.railway.app/webhook';
