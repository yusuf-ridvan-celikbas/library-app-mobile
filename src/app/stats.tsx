import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useOverview, useStats } from '@/api/hooks';
import { Card, Chip, ErrorState, Loading, Screen, SectionTitle, Txt } from '@/components/ui';
import { monthName } from '@/i18n';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function StatsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [year, setYear] = useState<number | undefined>(undefined);
  const stats = useStats(year);
  const overview = useOverview();

  if (stats.isLoading) return <Loading />;
  if (stats.isError || !stats.data) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;

  const s = stats.data;
  const hours = Math.round((s.total_minutes_read / 60) * 10) / 10;

  return (
    <Screen
      edgeTop={false}
      refreshControl={<RefreshControl refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()} tintColor={colors.accent} />}
    >
      {/* Tüm zamanlar — sayılar grafik değil, büyük rakamlar */}
      <View style={styles.tiles}>
        <Tile value={s.total_books_finished} label={t('stats.totalBooks')} />
        <Tile value={s.total_pages_read.toLocaleString()} label={t('stats.totalPages')} />
        <Tile value={hours || '–'} label={t('stats.totalHours')} />
        <Tile value={s.average_rating ?? '–'} label={t('stats.avgRating')} />
      </View>

      {/* Yıl seçimi + aylık dağılım */}
      <SectionTitle>{t('stats.monthly')}</SectionTitle>
      <View style={styles.years}>
        {[...s.available_years].sort((a, b) => b - a).map((y) => (
          <Chip key={y} label={String(y)} active={y === s.selected_year} onPress={() => setYear(y)} />
        ))}
      </View>
      <Card>
        <View style={styles.yearSummary}>
          <Txt muted size="small">
            {t('common.books', { count: s.year_stats.books_finished })} · {t('common.pages', { count: s.year_stats.pages_read })} ·{' '}
            {s.year_stats.average_daily_pages} {t('home.perDay')}
          </Txt>
        </View>
        <MonthlyBars data={s.monthly_breakdown} />
      </Card>

      {/* Tempo */}
      {s.pace.average_days_to_finish ? (
        <>
          <SectionTitle>{t('stats.pace')}</SectionTitle>
          <Card>
            <Txt>{t('stats.avgDays', { count: Math.round(s.pace.average_days_to_finish) })}</Txt>
            {s.pace.fastest_book ? (
              <Txt size="small" muted style={{ marginTop: space.sm }}>
                {t('stats.fastest')}: {s.pace.fastest_book.title} ({t('common.days', { count: s.pace.fastest_book.days })})
              </Txt>
            ) : null}
            {s.pace.slowest_book ? (
              <Txt size="small" muted>
                {t('stats.slowest')}: {s.pace.slowest_book.title} ({t('common.days', { count: s.pace.slowest_book.days })})
              </Txt>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Kitaplık özeti — en çok yazar/yayınevi */}
      {overview.data ? (
        <>
          <SectionTitle>{t('stats.overview')}</SectionTitle>
          <Card>
            <RankList title={t('library.author')} rows={overview.data.author_distribution} />
          </Card>
          <Card style={{ marginTop: space.md }}>
            <RankList title={t('library.publisher')} rows={overview.data.publisher_distribution} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <Card style={styles.tile}>
      <Txt size="title" serif weight="600">
        {value}
      </Txt>
      <Txt size="small" muted>
        {label}
      </Txt>
    </Card>
  );
}

/**
 * Tek seriden oluşan aylık çubuk grafik: tek vurgu rengi, taban çizgisine
 * oturan ince çubuklar (üstü 4px yuvarlatılmış), aralarında boşluk.
 * Dokunulan ayın değeri üstte gösterilir (mobilde "hover" karşılığı).
 */
function MonthlyBars({ data }: { data: { books_finished: number; pages_read: number }[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.books_finished));
  const CHART_H = 120;
  const active = selected !== null ? data[selected] : null;

  return (
    <View>
      <View style={{ height: 22, justifyContent: 'center' }}>
        {active ? (
          <Txt size="small" weight="600">
            {monthName(selected!)} · {t('common.books', { count: active.books_finished })} · {t('common.pages', { count: active.pages_read })}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.bars, { height: CHART_H, borderBottomColor: colors.border }]}>
        {data.map((d, i) => {
          const h = d.books_finished ? Math.max(4, (d.books_finished / max) * (CHART_H - 8)) : 0;
          const dim = selected !== null && selected !== i;
          return (
            <Pressable
              key={i}
              onPress={() => setSelected(selected === i ? null : i)}
              style={styles.barHit}
              accessibilityLabel={`${monthName(i)}: ${d.books_finished}`}
            >
              <View
                style={{
                  height: h,
                  backgroundColor: colors.accent,
                  opacity: dim ? 0.35 : 1,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  marginHorizontal: 3,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.monthLabels}>
        {data.map((_, i) => (
          <Txt key={i} size="tiny" faint center style={{ flex: 1 }}>
            {monthName(i).charAt(0).toLocaleUpperCase()}
          </Txt>
        ))}
      </View>
    </View>
  );
}

function RankList({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={{ gap: space.sm }}>
      <Txt size="small" muted weight="600">
        {title}
      </Txt>
      {rows.map((r) => (
        <View key={r.name}>
          <View style={{ flexDirection: 'row' }}>
            <Txt size="small" style={{ flex: 1 }} numberOfLines={1}>
              {r.name}
            </Txt>
            <Txt size="small" muted>
              {r.count}
            </Txt>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
            <View style={{ width: `${(r.count / max) * 100}%`, height: '100%', backgroundColor: colors.accent, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexBasis: '47%', flexGrow: 1 },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  yearSummary: { marginBottom: space.sm },
  bars: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth },
  barHit: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  monthLabels: { flexDirection: 'row', marginTop: space.xs },
  track: { height: 6, borderRadius: 4, marginTop: 4, overflow: 'hidden' },
});
