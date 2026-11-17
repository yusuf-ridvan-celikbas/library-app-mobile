import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  useBorrowedBooks,
  useBorrowers,
  useCreateReference,
  useDeleteBorrowedBook,
  useReturnBorrowedBook,
  useSaveBorrowedBook,
} from '@/api/hooks';
import type { BorrowedBook, BorrowedReadingStatus, Borrower } from '@/api/types';
import { StarRating } from '@/components/book';
import { PickerSheet } from '@/components/Picker';
import { Button, Card, Chip, EmptyState, ErrorState, errorMessage, Field, IconButton, Loading, Screen, SectionTitle, SelectBox, Sheet, Txt } from '@/components/ui';
import { formatDate } from '@/i18n';
import { addDays, today } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

const READING: { value: BorrowedReadingStatus; key: string }[] = [
  { value: 'not_started', key: 'status.available' },
  { value: 'reading', key: 'status.reading' },
  { value: 'finished', key: 'status.read' },
];

export default function BorrowedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const list = useBorrowedBooks();
  const [editing, setEditing] = useState<BorrowedBook | 'new' | null>(null);

  const active = list.data?.filter((b) => !b.is_returned) ?? [];
  const returned = list.data?.filter((b) => b.is_returned) ?? [];

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="add" label={t('borrowed.add')} onPress={() => setEditing('new')} /> }} />
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Screen edgeTop={false} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.accent} />}>
          {active.length ? (
            <View style={{ gap: space.sm }}>
              {active.map((b) => (
                <BorrowedCard key={b.id} book={b} onPress={() => setEditing(b)} />
              ))}
            </View>
          ) : (
            <EmptyState icon="arrow-down-circle-outline" message={t('borrowed.empty')}>
              <Button label={t('borrowed.add')} icon="add" variant="secondary" small onPress={() => setEditing('new')} />
            </EmptyState>
          )}
          {returned.length ? (
            <>
              <SectionTitle>{t('loans.returned')}</SectionTitle>
              <View style={{ gap: space.sm }}>
                {returned.map((b) => (
                  <BorrowedCard key={b.id} book={b} onPress={() => setEditing(b)} />
                ))}
              </View>
            </>
          ) : null}
        </Screen>
      )}
      {editing ? <BorrowedSheet book={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function BorrowedCard({ book, onPress }: { book: BorrowedBook; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const giveBack = useReturnBorrowedBook();
  const overdue = !book.is_returned && book.due_at && book.due_at < today();

  return (
    <Card tone={book.is_returned ? 'muted' : undefined} onPress={onPress}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt serif weight="600">
            {book.title}
          </Txt>
          <Txt size="small" muted>
            {[book.author_name, `${t('borrowed.from')}: ${book.borrower.name}`].filter(Boolean).join(' · ')}
          </Txt>
          {book.due_at && !book.is_returned ? (
            <Txt size="small" weight="500" color={overdue ? colors.danger : colors.textMuted}>
              {overdue ? `${t('loans.overdue')} · ` : ''}
              {formatDate(book.due_at)}
            </Txt>
          ) : null}
          {book.rating ? <StarRating value={book.rating} size={14} /> : null}
        </View>
        {!book.is_returned ? (
          <Button label={t('borrowed.returnIt')} small variant="secondary" loading={giveBack.isPending} onPress={() => giveBack.mutate(book.id)} />
        ) : null}
      </View>
    </Card>
  );
}

function BorrowedSheet({ book, onClose }: { book: BorrowedBook | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const borrowers = useBorrowers();
  const createBorrower = useCreateReference<Borrower>('borrowers');
  const save = useSaveBorrowedBook();
  const remove = useDeleteBorrowedBook();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: book?.title ?? '',
    author_name: book?.author_name ?? '',
    page_count: book?.page_count ? String(book.page_count) : '',
    borrower_id: book?.borrower.id ?? '',
    borrowed_at: book?.borrowed_at ?? today(),
    due_at: book?.due_at ?? addDays(30),
    reading_status: (book?.reading_status ?? 'not_started') as BorrowedReadingStatus,
    rating: book?.rating ?? null,
  });
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const borrowerName = borrowers.data?.find((b) => b.id === form.borrower_id)?.name;

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        id: book?.id,
        payload: {
          title: form.title.trim(),
          author_name: form.author_name.trim() || null,
          page_count: form.page_count ? Number(form.page_count) : null,
          borrower_id: form.borrower_id,
          borrowed_at: form.borrowed_at,
          due_at: form.due_at || null,
          reading_status: form.reading_status,
          started_at: form.reading_status !== 'not_started' ? (book?.started_at ?? today()) : null,
          finished_at: form.reading_status === 'finished' ? (book?.finished_at ?? today()) : null,
          rating: form.rating,
          notes: book?.notes ?? null,
          reading_notes: book?.reading_notes ?? null,
        },
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  return (
    <>
      <Sheet visible={!pickerOpen} onClose={onClose} title={book ? t('common.edit') : t('borrowed.add')}>
        <Field label={t('form.title')} value={form.title} onChangeText={set('title')} />
        <Field label={t('borrowed.author')} value={form.author_name} onChangeText={set('author_name')} />
        <SelectBox label={t('borrowed.from')} value={borrowerName} placeholder={t('form.select')} onPress={() => setPickerOpen(true)} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label={t('form.pageCount')} value={form.page_count} onChangeText={(v) => set('page_count')(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('loans.dueAt')} value={form.due_at} onChangeText={set('due_at')} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          {READING.map((r) => (
            <Chip key={r.value} label={t(r.key)} active={form.reading_status === r.value} onPress={() => set('reading_status')(r.value)} />
          ))}
        </View>
        {form.reading_status === 'finished' ? (
          <View style={{ marginBottom: space.lg }}>
            <StarRating value={form.rating} onChange={set('rating')} />
          </View>
        ) : null}
        {error ? (
          <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
            {error}
          </Txt>
        ) : null}
        <Button label={t('common.save')} onPress={submit} loading={save.isPending} disabled={!form.title.trim() || !form.borrower_id} />
        {book ? (
          <Pressable
            onPress={async () => {
              await remove.mutateAsync(book.id);
              onClose();
            }}
            style={{ alignItems: 'center', padding: space.lg }}
          >
            <Txt color={colors.danger} weight="500">
              {t('common.delete')}
            </Txt>
          </Pressable>
        ) : null}
      </Sheet>
      <PickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('borrowed.from')}
        options={(borrowers.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        selected={form.borrower_id ? [form.borrower_id] : []}
        onChange={(ids) => set('borrower_id')(ids[0] ?? '')}
        onCreate={async (name) => (await createBorrower.mutateAsync({ name })).id}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
