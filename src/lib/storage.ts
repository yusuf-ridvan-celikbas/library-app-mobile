import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Token hassas veri olduğu için cihazın güvenli deposunda (Keychain /
 * Keystore) tutulur. SecureStore web'de yok — web önizlemesinde
 * AsyncStorage'a (localStorage) düşülür.
 */
const TOKEN_KEY = 'library_app_token';

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(TOKEN_KEY);
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(TOKEN_KEY, token);
    return SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(TOKEN_KEY);
    return SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

/** Hassas olmayan kullanıcı tercihleri (dil, tema, sunucu adresi, görünüm). */
export type Settings = {
  language?: 'tr' | 'en';
  theme?: 'system' | 'light' | 'dark';
  apiUrl?: string;
  libraryView?: 'list' | 'grid';
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
