import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Book, BookStatus } from '@/api/types';
import { haptic, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { coverTone, radius, space, statusColors } from '@/theme/tokens';

/**
 * Kitap kapağı. Kapak görseli yoksa (Notion'dan gelenlerin hepsi böyle),
 * başlıktan türetilen sakin bir renkte, baş harfli "cilt" çizilir —
 * böylece liste yine de renkli ve ayırt edilebilir görünür.
 */
export function Cover({ book, width = 56 }: { book: Pick<Book, 'title' | 'cover_image_source_url'>; width?: number }) {
  const height = Math.round(width * 1.5);
  const tone = coverTone(book.title);
  const shape = { width, height, borderRadius: Math.max(6, width / 10) };

  if (book.cover_image_source_url) {
    return (
      <Image
        source={book.cover_image_source_url}
        style={[shape, { backgroundColor: tone }]}
        contentFit="cover"
        transition={200}
      />
    );
  }
  return (
    <View style={[shape, styles.placeholder, { backgroundColor: tone }]}>
      <View style={[styles.spine, { width: Math.max(3, width / 14) }]} />
      <Txt
        serif
        weight="600"
        color="rgba(255,255,255,0.92)"
        style={{ fontSize: width / 2.6, lineHeight: width / 2.1 }}
        numberOfLines={1}
      >
        {book.title.trim().charAt(0).toLocaleUpperCase('tr')}
      </Txt>
    </View>
  );
}

export function StatusPill({ status }: { status: BookStatus }) {
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const [fg, bg] = statusColors(status, scheme);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Txt size="tiny" weight="600" color={fg}>
        {t(`status.${status}`)}
      </Txt>
    </View>
  );
}

export function authorNames(book: Pick<Book, 'authors'>): string {
  return (book.authors ?? []).map((a) => a.name).join(', ');
}

/** Liste satırı: kapak + başlık + yazar + raf + durum. */
export function BookRow({ book }: { book: Book }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic();
        router.push(`/book/${book.id}`);
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Cover book={book} width={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt serif weight="600" numberOfLines={2}>
          {book.title}
        </Txt>
        {book.authors?.length ? (
          <Txt size="small" muted numberOfLines={1}>
            {authorNames(book)}
          </Txt>
        ) : null}
        <View style={styles.meta}>
          <StatusPill status={book.status} />
          {book.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="albums-outline" size={12} color={colors.textFaint} />
              <Txt size="tiny" faint>
                {book.location.display_name}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Izgara görünümü için büyük kapaklı kart. */
export function BookTile({ book, width }: { book: Book; width: number }) {
  return (
    <Pressable
      onPress={() => {
        haptic();
        router.push(`/book/${book.id}`);
      }}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <Cover book={book} width={width} />
      <Txt size="small" serif weight="600" numberOfLines={2} style={{ marginTop: space.sm }}>
        {book.title}
      </Txt>
      <Txt size="tiny" muted numberOfLines={1}>
        {authorNames(book)}
      </Txt>
    </Pressable>
  );
}

export function StarRating({ value, onChange, size = 28 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          hitSlop={4}
          onPress={() => {
            haptic();
            onChange?.(n);
          }}
        >
          <Ionicons name={value && n <= value ? 'star' : 'star-outline'} size={size} color={colors.warning} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.12)' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
