import { useEffect, useState, useCallback } from 'react';
import {
  type ThemeMode,
  applyTheme,
  resolveTheme,
  setStoredTheme,
  getSystemTheme
} from '../lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const ds = document.documentElement.dataset.theme;
    if (ds === 'dark' || ds === 'light') return ds;
    return getSystemTheme();
  });

  useEffect(() => {
    let cancelled = false;
    resolveTheme().then((m) => {
      if (cancelled) return;
      setTheme(m);
      applyTheme(m);
    });
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    await setStoredTheme(next);
  }, [theme]);

  return { theme, toggle };
}
