export type ThemeMode = 'dark' | 'light';

const KEY = 'bryteo.theme';

/** Read the user's stored choice, or null if they haven't picked. */
export async function getStoredTheme(): Promise<ThemeMode | null> {
  try {
    const got = await chrome.storage.local.get(KEY);
    const v = got[KEY];
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export async function setStoredTheme(mode: ThemeMode): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: mode });
    localStorage.setItem(KEY, mode);
  } catch {}
}

/** Read the system preference. */
export function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply a theme to the document and mirror to localStorage for fast next-load reads. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem(KEY, mode); } catch {}
}

/** Resolve current theme: stored > system. */
export async function resolveTheme(): Promise<ThemeMode> {
  return (await getStoredTheme()) ?? getSystemTheme();
}
