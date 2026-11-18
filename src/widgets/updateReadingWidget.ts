import { Appearance, Platform } from 'react-native';

import { listBooks } from '@/db/repo/books';
import { listBorrowed } from '@/db/repo/circulation';
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
    const borrowedReading = (await listBorrowed()).filter((b) => b.reading_status === 'reading' && !b.is_returned);
    ReadingWidget.updateSnapshot({
      heading: i18n.t('widget.heading'),
      empty: i18n.t('widget.empty'),
      books: [
        ...reading.data.map((b) => ({ title: b.title, author: b.authors.map((a) => a.name).join(', ') })),
        ...borrowedReading.map((b) => ({ title: b.title, author: b.author_name ?? '' })),
      ].slice(0, 3),
      dark: Appearance.getColorScheme() === 'dark',
    });
  } catch {
    // Widget güncellemesi asla uygulamayı bozmamalı.
  }
}
