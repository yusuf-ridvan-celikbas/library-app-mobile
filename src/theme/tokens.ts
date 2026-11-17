import { Platform } from 'react-native';

import type { BookStatus } from '@/api/types';

/**
 * Göz yormayan, düşük kontrastlı sıcak nötrler + tek bir sakin vurgu
 * rengi (adaçayı yeşili). Saf beyaz/siyah kullanılmaz; durum renkleri
 * doygunluğu düşük tutulur ki liste ekranları "bağırmasın".
 */
const light = {
  background: '#F5F3EE',
  surface: '#FFFEFB',
  surfaceMuted: '#EEEAE2',
  border: '#E6E1D7',
  text: '#2B2A27',
  textMuted: '#77736B',
  textFaint: '#A6A198',
  accent: '#5E8A6D',
  accentSoft: '#E2EBE4',
  onAccent: '#FFFFFF',
  danger: '#B5655B',
  dangerSoft: '#F4E3E0',
  warning: '#B88A4A',
  warningSoft: '#F4EAD9',
  overlay: 'rgba(30, 28, 24, 0.35)',
};

const dark: typeof light = {
  background: '#151614',
  surface: '#1E1F1C',
  surfaceMuted: '#282925',
  border: '#31322E',
  text: '#ECEAE4',
  textMuted: '#A19D94',
  textFaint: '#6E6B64',
  accent: '#8DB59A',
  accentSoft: '#243028',
  onAccent: '#132017',
  danger: '#D98E84',
  dangerSoft: '#3A2522',
  warning: '#D9B27A',
  warningSoft: '#3A3022',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export type Palette = typeof light;
export const palettes = { light, dark };

/** Kitap durumu → [yazı rengi, zemin rengi] — her iki temada da yumuşak. */
export function statusColors(status: BookStatus, scheme: 'light' | 'dark'): [string, string] {
  const l = scheme === 'light';
  switch (status) {
    case 'available':
      return l ? ['#4F7A5D', '#E2EBE4'] : ['#8DB59A', '#243028'];
    case 'reading':
      return l ? ['#9A7034', '#F4EAD9'] : ['#D9B27A', '#3A3022'];
    case 'read':
      return l ? ['#4E6E8E', '#E1E8F0'] : ['#9DB8D4', '#222C37'];
    case 'loaned':
      return l ? ['#8E5A6E', '#F1E3E8'] : ['#D49DB1', '#36252C'];
    case 'gifted':
      return l ? ['#7A6A9A', '#E9E5F1'] : ['#B5A8D4', '#2C2837'];
    case 'lost':
      return l ? ['#A0574D', '#F4E3E0'] : ['#D98E84', '#3A2522'];
    default:
      return l ? ['#77736B', '#EEEAE2'] : ['#A19D94', '#282925'];
  }
}

/** Kapağı olmayan kitaplar için başlıktan türetilen sakin renkler. */
const COVER_TONES = ['#8FA89A', '#B3977A', '#8E9DB3', '#B38E8E', '#A08EB3', '#8EB3AC', '#B3A88E', '#9AA58A'];
export function coverTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return COVER_TONES[Math.abs(hash) % COVER_TONES.length];
}

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const text = {
  title: 28,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
} as const;
