import { API_BASE_URL, API_ORIGIN_URL } from './apiConfig.js';
import {
  clearAuthSession,
  getAccessToken,
  getAuthTallerId,
} from './authStorage.js';

/** Evita redirecciones en bucle si varias peticiones fallan a la vez. */
let redirectingToLogin = false;

function redirectToLogin() {
  if (redirectingToLogin) return;
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  redirectingToLogin = true;
  clearAuthSession();
  const from = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?from=${encodeURIComponent(from)}`);
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
export async function parseApiError(res) {
  const raw = await res.text().catch(() => '');
  let msg = raw?.trim() || `Error ${res.status}`;
  try {
    const j = JSON.parse(raw);
    if (j?.message != null) {
      msg = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
    } else if (typeof j?.error === 'string') {
      msg = j.error;
    }
  } catch {
    /* texto plano */
  }
  if (msg.length > 400) msg = `${msg.slice(0, 400)}…`;
  return msg;
}

/**
 * Fetch con JWT (salvo `skipAuth`).
 * @param {string} url URL absoluta
 * @param {RequestInit & { skipAuth?: boolean }} options
 */
export async function apiFetch(url, options = {}) {
  const { skipAuth = false, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (
    rest.body != null &&
    !(rest.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...rest, headers });

  if (res.status === 401 && !skipAuth) {
    redirectToLogin();
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }

  return res;
}

function joinBase(base, path) {
  const b = String(base ?? '').replace(/\/$/, '');
  const p = String(path ?? '').startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Rutas bajo `/webhook` o `/chat` (bandeja, mensajes, cotizaciones). */
export function apiFetchWebhook(path, options) {
  return apiFetch(joinBase(API_BASE_URL, path), options);
}

/** Rutas en la raíz Nest (`/auth`, `/catalog`, `/api/chats`). */
export function apiFetchOrigin(path, options) {
  return apiFetch(joinBase(API_ORIGIN_URL, path), options);
}

/**
 * Kill switch: apaga alarma Twilio de cliente esperando afuera.
 * @param {string} conversationId
 */
export async function markClienteAtendidoRequest(conversationId) {
  const id = String(conversationId ?? '').trim();
  if (!id) {
    throw new Error('Falta el id de la conversación.');
  }
  const res = await apiFetchOrigin(`/api/chats/${id}/marcar-atendido`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
}

/**
 * @param {{ email: string; password: string }} credentials
 */
export async function loginRequest(credentials) {
  const res = await apiFetchOrigin('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
}

/**
 * @param {{ email: string; password: string; nombreTaller: string; metaPageId?: string }} payload
 */
/**
 * Envía mensaje outbound del agente (JWT + `tallerId` en el body).
 * @param {{
 *   conversationId: string;
 *   message: string;
 *   platform?: string;
 *   user?: string;
 *   conversationLeadStatus?: 'cotizado';
 *   tallerId?: string;
 * }} payload
 */
export async function sendAgentMessageRequest(payload) {
  const tallerId =
    String(payload.tallerId ?? '').trim() || getAuthTallerId();
  if (!tallerId) {
    throw new Error('No hay taller en sesión. Inicia sesión de nuevo.');
  }
  const token = getAccessToken()?.trim();
  if (!token) {
    throw new Error('No hay token de sesión. Inicia sesión de nuevo.');
  }

  const res = await apiFetchWebhook('/messages', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      tallerId,
    }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
}

export async function registerRequest(payload) {
  const res = await apiFetchOrigin('/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      nombreTaller: payload.nombreTaller,
      ...(payload.metaPageId?.trim()
        ? { metaPageId: payload.metaPageId.trim() }
        : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json();
}
