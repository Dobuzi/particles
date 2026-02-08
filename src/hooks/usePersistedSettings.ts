// Hook to persist user settings in localStorage
// Saves/restores mode, display toggles, and camera state

const STORAGE_KEY = 'freedom-particles-settings';

export type PersistedSettings = {
  currentMode: string;
  background: 'dark' | 'light';
  showPreview: boolean;
  showClay: boolean;
  showStreams: boolean;
  showHandLines: boolean;
  showClayLines: boolean;
  paused: boolean;
};

const DEFAULTS: PersistedSettings = {
  currentMode: 'sculpt',
  background: 'dark',
  showPreview: true,
  showClay: true,
  showStreams: false,
  showHandLines: true,
  showClayLines: true,
  paused: false,
};

export function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // Merge with defaults so new keys get default values
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Partial<PersistedSettings>): void {
  try {
    const existing = loadSettings();
    const merged = { ...existing, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
