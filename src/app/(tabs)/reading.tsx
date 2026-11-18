import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useBorrowedBooks, useCreateGoal, useDeleteGoal, useGoals, useSessions } from '@/api/hooks';
import type { BorrowedBook, GoalPeriod, ReadingGoal, ReadingSession } from '@/api/types';
import { StarRating } from '@/components/book';
import { BorrowedSheet } from '@/components/BorrowedSheet';
import { ProgressRing } from '@/components/ProgressRing';
import { SessionSheet } from '@/components/SessionSheet';
import { Button, Card, Chip, EmptyState, errorMessage, Field, IconButton, Screen, SectionTitle, Sheet, Txt } from '@/components/ui';
import { formatDate } from '@/i18n';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function ReadingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const goals = useGoals();
  const inProgress = useSessions({ status: 'in_progress' });
  const finished = useSessions({ status: 'finished' });
  const borrowed = useBorrowedBooks();
  const [goalOpen, setGoalOpen] = useState(false);
  const params = useLocalSearchParams<{ year?: string }>();

  // Okuma geçmişi = kendi kitaplarımın bitmiş kayıtları + okunup bitirilmiş ödünç kitaplar.
  type Entry = { key: string; finished_at: string | null; session?: ReadingSession; borrowed?: BorrowedBook };
  const history: Entry[] = [
    ...(finished.data ?? []).map((s) => ({ key: `s-${s.id}`, finished_at: s.finished_at, session: s })),
    ...(borrowed.data ?? []).filter((b) => b.reading_status === 'finished').map((b) => ({ key: `b-${b.id}`, finished_at: b.finished_at, borrowed: b })),
  ].sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''));
  const readingNow: Entry[] = [
    ...(inProgress.data ?? []).map((s) => ({ key: `s-${s.id}`, finished_at: null, session: s })),
    ...(borrowed.data ?? []).filter((b) => b.reading_status === 'reading').map((b) => ({ key: `b-${b.id}`, finished_at: null, borrowed: b })),
  ];

  // Yıl filtresi: varsayılan bu yıl (bu yıl hiç kayıt yoksa "Tümü").
  // Ana sayfadaki "bitirilen" sayısına dokunulunca ?year=2026 ile gelinir.
  const currentYear = String(new Date().getFullYear());
  const years = [...new Set(history.map((s) => s.finished_at?.slice(0, 4)).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a));
  const hasUndated = history.some((s) => !s.finished_at);
  const [year, setYear] = useState<string>(params.year ?? currentYear);
  const [lastParam, setLastParam] = useState(params.year);
  if (params.year !== lastParam) {
    setLastParam(params.year);
    if (params.year) setYear(params.year);
  }
  const effectiveYear = year === 'all' || year === 'undated' || years.includes(year) ? year : 'all';
  const visible = history.filter((s) =>
    effectiveYear === 'all' ? true : effectiveYear === 'undated' ? !s.finished_at : s.finished_at?.startsWith(effectiveYear),
  );

  return (
    <Screen
      title={t('reading.title')}
      right={<IconButton icon="stats-chart-outline" label={t('stats.title')} onPress={() => router.push('/stats')} />}
      refreshControl={
        <RefreshControl
          refreshing={goals.isRefetching || finished.isRefetching}
          onRefresh={() => {
            void borrowed.refetch();
            void goals.refetch();
            void inProgress.refetch();
            void finished.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <SectionTitle action={<Button label={t('reading.newGoal')} icon="add" variant="secondary" small onPress={() => setGoalOpen(true)} />}>
        {t('reading.goals')}
      </SectionTitle>
      {goals.data?.length ? (
        <View style={{ gap: space.md }}>
          {goals.data.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </View>
      ) : (
        <Card tone="muted">
          <Txt muted>{t('home.noGoal')}</Txt>
        </Card>
      )}

      {readingNow.length ? (
        <>
          <SectionTitle>{t('reading.inProgress')}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {readingNow.map((e) => (e.session ? <SessionRow key={e.key} session={e.session} /> : <BorrowedRow key={e.key} book={e.borrowed!} />))}
          </View>
        </>
      ) : null}

      <SectionTitle>{t('reading.history')}</SectionTitle>
      {history.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearChips}>
            {years.map((y) => (
              <Chip key={y} label={y} active={effectiveYear === y} onPress={() => setYear(y)} />
            ))}
            <Chip label={t('common.all')} active={effectiveYear === 'all'} onPress={() => setYear('all')} />
            {hasUndated ? <Chip label={t('reading.undated')} active={effectiveYear === 'undated'} onPress={() => setYear('undated')} /> : null}
          </ScrollView>
          <Txt size="small" muted style={{ marginBottom: space.sm }}>
            {effectiveYear === 'all' || effectiveYear === 'undated'
              ? t('common.books', { count: visible.length })
              : t('reading.finishedInYear', { count: visible.length, year: effectiveYear })}
          </Txt>
          <View style={{ gap: space.sm }}>
            {visible.map((e) => (e.session ? <SessionRow key={e.key} session={e.session} /> : <BorrowedRow key={e.key} book={e.borrowed!} />))}
          </View>
        </>
      ) : (
        <EmptyState icon="book-outline" message={t('reading.emptyHistory')} />
      )}

      <NewGoalSheet visible={goalOpen} onClose={() => setGoalOpen(false)} />
    </Screen>
  );
}

function GoalCard({ goal }: { goal: ReadingGoal }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const remove = useDeleteGoal();

  function confirmRemove() {
    if (Platform.OS === 'web') {
      if (confirm(t('common.confirmDelete'))) remove.mutate(goal.id);
      return;
    }
    Alert.alert(t('common.confirmDelete'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(goal.id) },
    ]);
  }

  return (
    <Card>
      <View style={styles.goalRow}>
        <ProgressRing percent={goal.percent_complete} size={72} stroke={7}>
          <Txt size="small" weight="700" color={colors.accent}>
            %{Math.round(goal.percent_complete)}
          </Txt>
        </ProgressRing>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="600">{t(`reading.${goal.period_type}`)}</Txt>
          <Txt muted size="small">
            {t('reading.progress', { done: goal.completed_books, target: goal.target_books })} · {t('reading.daysLeft', { count: goal.days_remaining })}
          </Txt>
          <Txt size="small" weight="500" color={goal.is_on_track ? colors.accent : colors.warning}>
            {goal.is_on_track ? t('reading.onTrack') : t('reading.behind')}
            {goal.suggested_daily_pages > 0 ? ` · ${t('reading.suggestedPages', { count: Math.ceil(goal.suggested_daily_pages) })}` : ''}
          </Txt>
        </View>
        <Pressable onPress={confirmRemove} hitSlop={10}>
          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
    </Card>
  );
}

function SessionRow({ session }: { session: ReadingSession }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const date = session.finished_at ?? session.started_at;
  return (
    <>
    <Card onPress={() => setEditing(true)} style={styles.sessionRow}>
      <View style={{ flex: 1 }}>
        <Txt serif weight="600" numberOfLines={2}>
          {session.book?.title ?? '—'}
        </Txt>
        {date ? (
          <Txt size="small" muted>
            {session.started_at && session.finished_at
              ? `${formatDate(session.started_at)} → ${formatDate(session.finished_at)}`
              : session.status === 'finished'
                ? t('reading.finishedOn', { date: formatDate(date) })
                : t('reading.startedOn', { date: formatDate(date) })}
          </Txt>
        ) : null}
      </View>
      {session.rating ? <StarRating value={session.rating} size={14} /> : null}
    </Card>
    {editing && session.book ? (
      <SessionSheet session={session} bookId={session.book.id} onClose={() => setEditing(false)} showOpenBook />
    ) : null}
    </>
  );
}

/** Ödünç alınmış (ör. kütüphane) bir kitabın geçmiş satırı; dokununca ödünç kaydı düzenlenir. */
function BorrowedRow({ book }: { book: BorrowedBook }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const dates =
    book.started_at && book.finished_at
      ? `${formatDate(book.started_at)} → ${formatDate(book.finished_at)}`
      : book.finished_at
        ? t('reading.finishedOn', { date: formatDate(book.finished_at) })
        : book.started_at
          ? t('reading.startedOn', { date: formatDate(book.started_at) })
          : '';
  return (
    <>
      <Card onPress={() => setEditing(true)} style={styles.sessionRow}>
        <View style={{ flex: 1 }}>
          <Txt serif weight="600" numberOfLines={2}>
            {book.title}
          </Txt>
          {dates ? (
            <Txt size="small" muted>
              {dates}
            </Txt>
          ) : null}
          <View style={styles.borrowedTag}>
            <Ionicons name="arrow-down-circle-outline" size={13} color={colors.accent} />
            <Txt size="tiny" color={colors.accent} weight="600">
              {t('reading.borrowedFrom', { name: book.borrower.name })}
            </Txt>
          </View>
        </View>
        {book.rating ? <StarRating value={book.rating} size={14} /> : null}
      </Card>
      {editing ? <BorrowedSheet book={book} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function NewGoalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const create = useCreateGoal();
  const [period, setPeriod] = useState<GoalPeriod>('yearly');
  const [target, setTarget] = useState('12');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({ period_type: period, target_books: Number(target) });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.newGoal')}>
      <Txt size="small" muted weight="500" style={{ marginBottom: space.sm }}>
        {t('reading.period')}
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
        {(['weekly', 'monthly', 'yearly'] as GoalPeriod[]).map((p) => (
          <Chip key={p} label={t(`reading.${p}`)} active={period === p} onPress={() => setPeriod(p)} />
        ))}
      </View>
      <Field label={t('reading.target')} value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      {error ? (
        <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
          {error}
        </Txt>
      ) : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending} disabled={!Number(target)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  yearChips: { gap: space.sm, paddingBottom: space.md },
  borrowedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
});
