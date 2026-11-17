import { Appearance, Platform } from 'react-native';

import { listBooks } from '@/db/repo/books';
import i18n from '@/i18n';

/**
 * "Şu an okuduklarım" widget'ını telefondaki veriyle günceller. Kitap
 * durumunu etkileyen her değişiklikten sonra (useInvalidateLibrary) ve
 * uygulama açılışında çağrılır. Widget henüz eklenmemişse zararsızdır.
 */
export async function updateReadingWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { default: ReadingWidget } = await import('./ReadingWidget');
    const reading = await listBooks({ status: 'reading' }, 1, 3);
    ReadingWidget.updateSnapshot({
      heading: i18n.t('widget.heading'),
      empty: i18n.t('widget.empty'),
      books: reading.data.map((b) => ({ title: b.title, author: b.authors.map((a) => a.name).join(', ') })),
      dark: Appearance.getColorScheme() === 'dark',
    });
  } catch {
    // Widget güncellemesi asla uygulamayı bozmamalı.
  }
}
