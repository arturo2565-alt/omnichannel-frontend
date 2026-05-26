const TOKEN_KEY = 'omnichannel_access_token';
const USER_KEY = 'omnichannel_auth_user';
const TALLER_KEY = 'omnichannel_auth_taller';

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredTaller() {
  try {
    const raw = localStorage.getItem(TALLER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession({ accessToken, user, taller }) {
  if (accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
  }
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  if (taller) {
    localStorage.setItem(TALLER_KEY, JSON.stringify(taller));
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TALLER_KEY);
  } catch {
    /* ignore */
  }
}

export function isAuthenticated() {
  return Boolean(getAccessToken()?.trim());
}

/** UUID del taller de la sesión (contexto / localStorage). */
export function getAuthTallerId() {
  const fromTaller = getStoredTaller()?.id;
  if (fromTaller != null && String(fromTaller).trim()) {
    return String(fromTaller).trim();
  }
  const fromUser = getStoredUser()?.tallerId;
  if (fromUser != null && String(fromUser).trim()) {
    return String(fromUser).trim();
  }
  return '';
}
