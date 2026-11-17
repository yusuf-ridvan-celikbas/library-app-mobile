import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import tr from './tr';

export function deviceLanguage(): 'tr' | 'en' {
  return getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
}

// eslint-disable-next-line import/no-named-as-default-member -- i18next'in belgelenmiş kullanımı
void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Tarihleri seçili dile göre biçimlendirir ("12 Mart 2024" / "Mar 12, 2024"). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function monthName(index: number): string {
  return new Date(2000, index, 1).toLocaleDateString(i18n.language === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' });
}

export default i18n;
