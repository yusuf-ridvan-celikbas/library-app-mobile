import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useDeleteSession, useSaveSession } from '@/api/hooks';
import type { ReadingSession, ReadingStatus } from '@/api/types';
import { StarRating } from '@/components/book';
import { Button, Chip, errorMessage, Field, Sheet, Txt } from '@/components/ui';
import { isValidDate, today } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

const STATUSES: ReadingStatus[] = ['planned', 'in_progress', 'finished', 'abandoned'];

/**
 * Bir okuma kaydını (okuma geçmişi satırı) düzenleme penceresi: durum,
 * başlangıç/bitiş tarihi, puan, not ve silme. Kitabın durumu kayıtlara
 * göre otomatik güncellenir (bkz. db/repo/reading.ts → syncBookStatus).
 */
export function SessionSheet({
  session,
  bookId,
  onClose,
  showOpenBook = false,
}: {
  session: ReadingSession;
  bookId: string;
  onClose: () => void;
  showOpenBook?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveSession();
  const remove = useDeleteSession();
  const [status, setStatus] = useState<ReadingStatus>(session.status);
  const [startedAt, setStartedAt] = useState(session.started_at ?? '');
  const [finishedAt, setFinishedAt] = useState(session.finished_at ?? '');
  const [rating, setRating] = useState<number | null>(session.rating);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function pickStatus(next: ReadingStatus) {
    setStatus(next);
    // "Okundu" seçilince bitiş tarihi boşsa bugünü öner.
    if (next === 'finished' && !finishedAt) setFinishedAt(today());
  }

  async function submit() {
    setError(null);
    for (const value of [startedAt, finishedAt]) {
      if (value && !isValidDate(value)) {
        setError(t('session.invalidDate'));
        return;
      }
    }
    try {
      await save.mutateAsync({
        id: session.id,
        bookId,
        payload: {
          status,
          started_at: startedAt || null,
          finished_at: status === 'finished' || status === 'abandoned' ? finishedAt || null : null,
          rating,
          notes: notes.trim() || null,
        },
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  function confirmDelete() {
    Alert.alert(t('session.deleteTitle'), t('common.confirmDeleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await remove.mutateAsync(session.id);
          onClose();
        },
      },
    ]);
  }

  return (
    <Sheet visible onClose={onClose} title={session.book?.title ?? t('book.readingHistory')}>
      <Txt size="small" muted weight="500" style={styles.label}>
        {t('form.status')}
      </Txt>
      <View style={styles.chips}>
        {STATUSES.map((s) => (
          <Chip key={s} label={t(`readingStatus.${s}`)} active={status === s} onPress={() => pickStatus(s)} />
        ))}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label={t('session.startedAt')} value={startedAt} onChangeText={setStartedAt} placeholder="2026-01-31" keyboardType="numbers-and-punctuation" />
        </View>
        {status === 'finished' || status === 'abandoned' ? (
          <View style={{ flex: 1 }}>
            <Field label={t('session.finishedAt')} value={finishedAt} onChangeText={setFinishedAt} placeholder="2026-02-14" keyboardType="numbers-and-punctuation" />
          </View>
        ) : null}
      </View>

      <Txt size="small" muted weight="500" style={styles.label}>
        {t('book.rate')}
      </Txt>
      <View style={styles.ratingRow}>
        <StarRating value={rating} onChange={setRating} size={32} />
        {rating ? (
          <Pressable onPress={() => setRating(null)} hitSlop={8}>
            <Txt size="small" muted>
              {t('session.clearRating')}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <Field label={t('wishlist.notes')} value={notes} onChangeText={setNotes} multiline />

      {error ? (
        <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
          {error}
        </Txt>
      ) : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      <View style={styles.footer}>
        {showOpenBook && session.book ? (
          <Button
            label={t('session.openBook')}
            variant="ghost"
            small
            icon="book-outline"
            onPress={() => {
              onClose();
              router.push(`/book/${session.book!.id}`);
            }}
          />
        ) : (
          <View />
        )}
        <Button label={t('session.delete')} variant="ghost" small icon="trash-outline" onPress={confirmDelete} loading={remove.isPending} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
});
