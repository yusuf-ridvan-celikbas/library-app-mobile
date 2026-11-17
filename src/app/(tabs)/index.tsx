import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useBooks, useGoals, useOverview, useRecentBooks, useReminders, useStats } from '@/api/hooks';
import { authorNames, Cover } from '@/components/book';
import { ProgressRing } from '@/components/ProgressRing';
import { ReminderRow } from '@/components/ReminderRow';
import { Button, Card, ErrorState, Screen, SectionTitle, Txt } from '@/components/ui';
import { useSettings } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors, settings } = useSettings();

  const reading = useBooks({ status: 'reading' });
  const recent = useRecentBooks();
  const overview = useOverview();
  const stats = useStats();
  const goals = useGoals();
  const reminders = useReminders();

  const readingBooks = reading.data?.pages.flatMap((p) => p.data) ?? [];
  const goal = goals.data?.find((g) => g.period_type === 'yearly') ?? goals.data?.[0];
  const year = stats.data?.year_stats;
  const firstName = settings.name.split(' ')[0];
  const greeting = firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName');

  const refreshing = reading.isRefetching || stats.isRefetching;
  const refresh = () => {
    void reading.refetch();
    void recent.refetch();
    void overview.refetch();
    void stats.refetch();
    void goals.refetch();
    void reminders.refetch();
  };

  if (recent.isError && !recent.data) {
    return (
      <Screen title={greeting}>
        <ErrorState error={recent.error} onRetry={refresh} />
      </Screen>
    );
  }

  return (
    <Screen
      title={greeting}
      subtitle={overview.data ? t('home.subtitle', { count: overview.data.total_books }) : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
    >
      {/* Bu yıl + hedef */}
      <Card tone="accent">
        <View style={styles.yearRow}>
          {goal ? (
            <Pressable onPress={() => router.push('/reading')}>
              <ProgressRing percent={goal.percent_complete}>
                <Txt size="heading" weight="700" color={colors.accent}>
                  {goal.completed_books}
                </Txt>
                <Txt size="tiny" muted>
                  / {goal.target_books}
                </Txt>
              </ProgressRing>
            </Pressable>
          ) : null}
          <View style={{ flex: 1, gap: space.sm }}>
            <Txt size="small" muted weight="600">
              {t('home.thisYear', { year: stats.data?.selected_year ?? new Date().getFullYear() })}
            </Txt>
            <View style={styles.statsRow}>
              <Stat value={year?.books_finished ?? '–'} label={t('home.finished')} />
              <Stat value={year?.pages_read ?? '–'} label={t('home.pagesRead')} />
              <Stat value={year?.average_daily_pages ?? '–'} label={t('home.perDay')} />
            </View>
            {!goal ? (
              <Pressable onPress={() => router.push('/reading')}>
                <Txt size="small" color={colors.accent} weight="600">
                  + {t('reading.newGoal')}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Şu an okunanlar */}
      <SectionTitle>{t('home.nowReading')}</SectionTitle>
      {readingBooks.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
          {readingBooks.map((b) => (
            <Card key={b.id} onPress={() => router.push(`/book/${b.id}`)} style={styles.readingCard}>
              <Cover book={b} width={64} />
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Txt serif weight="600" numberOfLines={3}>
                  {b.title}
                </Txt>
                <Txt size="small" muted numberOfLines={1}>
                  {authorNames(b)}
                </Txt>
              </View>
            </Card>
          ))}
        </ScrollView>
      ) : (
        <Card tone="muted">
          <Txt muted>{t('home.nothingReading')}</Txt>
          <Button
            label={t('tabs.library')}
            variant="secondary"
            small
            icon="library-outline"
            style={{ alignSelf: 'flex-start', marginTop: space.md }}
            onPress={() => router.push({ pathname: '/library', params: { status: 'available' } })}
          />
        </Card>
      )}

      {/* Hatırlatmalar */}
      {reminders.data?.items.length ? (
        <>
          <SectionTitle>{t('home.reminders')}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {reminders.data.items.slice(0, 3).map((r) => (
              <ReminderRow key={`${r.type}-${r.record_id}`} item={r} />
            ))}
          </View>
        </>
      ) : null}

      {/* Kitaplık özeti */}
      {overview.data ? (
        <View style={[styles.statsRow, { marginTop: space.xl }]}>
          <Card style={{ flex: 1 }}>
            <Txt size="title" serif weight="600">
              {overview.data.read_books}
            </Txt>
            <Txt size="small" muted>
              {t('status.read')}
            </Txt>
          </Card>
          <Card style={{ flex: 1 }} onPress={() => router.push({ pathname: '/library', params: { status: 'available' } })}>
            <Txt size="title" serif weight="600">
              {overview.data.unread_books}
            </Txt>
            <Txt size="small" muted>
              {t('home.unread')}
            </Txt>
          </Card>
        </View>
      ) : null}

      {/* Son eklenenler */}
      {recent.data?.data.length ? (
        <>
          <SectionTitle>{t('home.recentlyAdded')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
            {recent.data.data.map((b) => (
              <Pressable key={b.id} onPress={() => router.push(`/book/${b.id}`)} style={{ width: 96 }}>
                <Cover book={b} width={96} />
                <Txt size="small" serif weight="600" numberOfLines={2} style={{ marginTop: space.sm }}>
                  {b.title}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt size="heading" weight="700">
        {value}
      </Txt>
      <Txt size="tiny" muted>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  statsRow: { flexDirection: 'row', gap: space.md },
  readingCard: { width: 260, flexDirection: 'row', gap: space.md, padding: space.md },
});
