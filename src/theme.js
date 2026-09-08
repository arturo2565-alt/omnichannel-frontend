export const THEME_STORAGE_KEY = 'themePreference';
export const THEME_MODES = ['light', 'dark', 'auto'];

export function isNightHour(date = new Date()) {
  const currentHour = date.getHours();
  return currentHour >= 18 || currentHour < 6;
}

export function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_MODES.includes(stored)) return stored;
  } catch {
    /* private mode */
  }
  return 'auto';
}

export function persistThemePreference(preference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveTheme(preference, date = new Date()) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return isNightHour(date) ? 'dark' : 'light';
}

export function applyResolvedTheme(resolved) {
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
}

export function applyThemePreference(preference) {
  const resolved = resolveTheme(preference);
  applyResolvedTheme(resolved);
  return resolved;
}
