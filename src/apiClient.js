import { API_BASE_URL, API_ORIGIN_URL } from './apiConfig.js';
import { clearAuthSession, getAccessToken } from './authStorage.js';

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

/** Rutas en la raíz Nest (`/auth`, `/catalog`). */
export function apiFetchOrigin(path, options) {
  return apiFetch(joinBase(API_ORIGIN_URL, path), options);
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
