import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { setApiUrl } from '@/api/client';
import { DEFAULT_API_URL } from '@/config';
import i18n, { deviceLanguage } from '@/i18n';
import { loadSettings, saveSettings, type Settings } from '@/lib/storage';
import { palettes, type Palette } from '@/theme/tokens';

type Ctx = {
  ready: boolean;
  settings: Required<Settings>;
  update: (patch: Settings) => Promise<void>;
  colors: Palette;
  scheme: 'light' | 'dark';
};

const SettingsContext = createContext<Ctx | null>(null);

/**
 * Dil, tema, sunucu adresi gibi tercihleri yükler/saklar ve tema renk
 * paletini sağlar. Tercihler yüklenene kadar `ready=false` — kök layout
 * bu sürede splash ekranını açık tutar.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Required<Settings>>({
    language: deviceLanguage(),
    theme: 'system',
    apiUrl: DEFAULT_API_URL,
    libraryView: 'list',
  });

  const apply = useCallback((next: Required<Settings>) => {
    setSettings(next);
    setApiUrl(next.apiUrl);
    if (i18n.language !== next.language) void i18n.changeLanguage(next.language);
  }, []);

  useEffect(() => {
    loadSettings().then((stored) => {
      apply({
        language: stored.language ?? deviceLanguage(),
        theme: stored.theme ?? 'system',
        apiUrl: stored.apiUrl ?? DEFAULT_API_URL,
        libraryView: stored.libraryView ?? 'list',
      });
      setReady(true);
    });
  }, [apply]);

  const update = useCallback(
    async (patch: Settings) => {
      const next = { ...settings, ...patch };
      apply(next);
      await saveSettings(patch);
    },
    [settings, apply],
  );

  const scheme: 'light' | 'dark' =
    settings.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : settings.theme;

  const value = useMemo(
    () => ({ ready, settings, update, colors: palettes[scheme], scheme }),
    [ready, settings, update, scheme],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** Kısayol: sadece renkler ve şema. */
export function useTheme() {
  const { colors, scheme } = useSettings();
  return { colors, scheme };
}
