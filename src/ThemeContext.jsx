import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
} from './theme.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() =>
    readThemePreference(),
  );
  const [resolved, setResolved] = useState(() =>
    resolveTheme(readThemePreference()),
  );

  const syncResolved = useCallback((nextPreference) => {
    setResolved(applyThemePreference(nextPreference));
  }, []);

  useEffect(() => {
    syncResolved(preference);
  }, [preference, syncResolved]);

  useEffect(() => {
    if (preference !== 'auto') return undefined;

    const refresh = () => syncResolved('auto');
    const intervalId = window.setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [preference, syncResolved]);

  const setPreference = useCallback((next) => {
    const value = next === 'light' || next === 'dark' ? next : 'auto';
    persistThemePreference(value);
    setPreferenceState(value);
    applyThemePreference(value);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return ctx;
}
