import AsyncStorage from '@react-native-async-storage/async-storage';

/** Kullanıcı tercihleri (dil, tema, görünüm, selamlamada kullanılan ad). Kitap verisi burada DEĞİL — SQLite'ta (src/db). */
export type Settings = {
  language?: 'tr' | 'en';
  theme?: 'system' | 'light' | 'dark';
  libraryView?: 'list' | 'grid';
  name?: string;
};

const SETTINGS_KEY = 'library_app_settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Settings) : {};
  } catch {
    return {};
  }
}

export async function saveSettings(patch: Settings): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
