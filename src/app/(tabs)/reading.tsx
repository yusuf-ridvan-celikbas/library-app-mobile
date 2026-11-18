import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useCreateGoal, useDeleteGoal, useGoals, useSessions } from '@/api/hooks';
import type { GoalPeriod, ReadingGoal, ReadingSession } from '@/api/types';
import { StarRating } from '@/components/book';
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
  const [goalOpen, setGoalOpen] = useState(false);

  const history = [...(finished.data ?? [])].sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''));

  return (
    <Screen
      title={t('reading.title')}
      right={<IconButton icon="stats-chart-outline" label={t('stats.title')} onPress={() => router.push('/stats')} />}
      refreshControl={
        <RefreshControl
          refreshing={goals.isRefetching || finished.isRefetching}
          onRefresh={() => {
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

      {inProgress.data?.length ? (
        <>
          <SectionTitle>{t('reading.inProgress')}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {inProgress.data.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle>{t('reading.history')}</SectionTitle>
      {history.length ? (
        <View style={{ gap: space.sm }}>
          {history.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </View>
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
            {session.status === 'finished' ? t('reading.finishedOn', { date: formatDate(date) }) : formatDate(date)}
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
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
});
