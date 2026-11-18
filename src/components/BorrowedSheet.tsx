import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useBorrowers, useCreateReference, useDeleteBorrowedBook, useSaveBorrowedBook } from '@/api/hooks';
import type { BorrowedBook, BorrowedReadingStatus, Borrower } from '@/api/types';
import { StarRating } from '@/components/book';
import { PickerSheet } from '@/components/Picker';
import { Button, Chip, errorMessage, Field, SelectBox, Sheet, Txt } from '@/components/ui';
import { addDays, isValidDate, today } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

const READING: { value: BorrowedReadingStatus; key: string }[] = [
  { value: 'not_started', key: 'borrowed.notStarted' },
  { value: 'reading', key: 'status.reading' },
  { value: 'finished', key: 'status.read' },
];

export type BorrowedPrefill = { title?: string; author_name?: string; page_count?: string };

/**
 * Ödünç alınan (kütüphaneden ya da birinden) bir kitabı ekleme/düzenleme
 * penceresi. Yeni kayıtta "Barkod tara" ile başlık/yazar/sayfa doldurulabilir
 * (kitaplığa kitap EKLENMEZ). Okuma durumu, tarihler, puan ve not da burada.
 */
export function BorrowedSheet({ book, prefill, onClose }: { book: BorrowedBook | null; prefill?: BorrowedPrefill; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const borrowers = useBorrowers();
  const createBorrower = useCreateReference<Borrower>('borrowers');
  const save = useSaveBorrowedBook();
  const remove = useDeleteBorrowedBook();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: book?.title ?? prefill?.title ?? '',
    author_name: book?.author_name ?? prefill?.author_name ?? '',
    page_count: book?.page_count ? String(book.page_count) : (prefill?.page_count ?? ''),
    borrower_id: book?.borrower.id ?? '',
    borrowed_at: book?.borrowed_at ?? today(),
    due_at: book?.due_at ?? addDays(15),
    reading_status: (book?.reading_status ?? 'not_started') as BorrowedReadingStatus,
    started_at: book?.started_at ?? '',
    finished_at: book?.finished_at ?? '',
    rating: book?.rating ?? null,
    reading_notes: book?.reading_notes ?? '',
  });
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const current = borrowers.data?.find((b) => b.id === form.borrower_id);
  const borrowerName = current?.name;
  // "Kimden?": önce Kişi mi Kütüphane mi seçilir, sonra sadece o türün listesi gösterilir.
  const [fromKind, setFromKind] = useState<'person' | 'library' | null>(null);
  const effectiveKind = fromKind ?? (current ? (current.kind === 'library' ? 'library' : 'person') : null);
  function chooseKind(next: 'person' | 'library') {
    setFromKind(next);
    if (current && (current.kind === 'library' ? 'library' : 'person') !== next) set('borrower_id')('');
  }

  function pickStatus(next: BorrowedReadingStatus) {
    setForm((f) => ({
      ...f,
      reading_status: next,
      started_at: next !== 'not_started' && !f.started_at ? today() : f.started_at,
      finished_at: next === 'finished' && !f.finished_at ? today() : f.finished_at,
    }));
  }

  async function submit() {
    setError(null);
    for (const value of [form.borrowed_at, form.due_at, form.started_at, form.finished_at]) {
      if (value && !isValidDate(value)) {
        setError(t('session.invalidDate'));
        return;
      }
    }
    try {
      await save.mutateAsync({
        id: book?.id,
        payload: {
          title: form.title.trim(),
          author_name: form.author_name.trim() || null,
          page_count: form.page_count ? Number(form.page_count) : null,
          borrower_id: form.borrower_id,
          borrowed_at: form.borrowed_at || today(),
          due_at: form.due_at || null,
          reading_status: form.reading_status,
          started_at: form.reading_status !== 'not_started' ? form.started_at || null : null,
          finished_at: form.reading_status === 'finished' ? form.finished_at || null : null,
          rating: form.reading_status === 'finished' ? form.rating : null,
          notes: book?.notes ?? null,
          reading_notes: form.reading_notes.trim() || null,
        },
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  function confirmDelete() {
    if (!book) return;
    Alert.alert(t('common.confirmDelete'), t('common.confirmDeleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await remove.mutateAsync(book.id);
          onClose();
        },
      },
    ]);
  }

  return (
    <>
      <Sheet visible={!pickerOpen} onClose={onClose} title={book ? t('common.edit') : t('borrowed.add')}>
        {!book ? (
          <Button
            label={t('borrowed.scan')}
            icon="barcode-outline"
            variant="secondary"
            style={{ marginBottom: space.lg }}
            onPress={() => {
              onClose();
              router.push({ pathname: '/scan', params: { mode: 'borrowed' } });
            }}
          />
        ) : null}
        <Field label={t('form.title')} value={form.title} onChangeText={set('title')} />
        <Field label={t('borrowed.author')} value={form.author_name} onChangeText={set('author_name')} />
        <FromKindField kind={effectiveKind} onKind={chooseKind} value={borrowerName} onOpen={() => setPickerOpen(true)} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('borrowed.borrowedAt')} value={form.borrowed_at} onChangeText={set('borrowed_at')} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('loans.dueAt')} value={form.due_at} onChangeText={set('due_at')} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Field label={t('form.pageCount')} value={form.page_count} onChangeText={(v) => set('page_count')(v.replace(/\D/g, ''))} keyboardType="number-pad" />

        <Txt size="small" muted weight="500" style={{ marginBottom: space.sm }}>
          {t('borrowed.readingStatus')}
        </Txt>
        <View style={styles.chips}>
          {READING.map((r) => (
            <Chip key={r.value} label={t(r.key)} active={form.reading_status === r.value} onPress={() => pickStatus(r.value)} />
          ))}
        </View>
        {form.reading_status !== 'not_started' ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label={t('session.startedAt')} value={form.started_at} onChangeText={set('started_at')} keyboardType="numbers-and-punctuation" />
            </View>
            {form.reading_status === 'finished' ? (
              <View style={{ flex: 1 }}>
                <Field label={t('session.finishedAt')} value={form.finished_at} onChangeText={set('finished_at')} keyboardType="numbers-and-punctuation" />
              </View>
            ) : null}
          </View>
        ) : null}
        {form.reading_status === 'finished' ? (
          <View style={{ marginBottom: space.lg }}>
            <StarRating value={form.rating} onChange={set('rating')} />
          </View>
        ) : null}
        {form.reading_status !== 'not_started' ? (
          <Field label={t('wishlist.notes')} value={form.reading_notes} onChangeText={set('reading_notes')} multiline />
        ) : null}

        {error ? (
          <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
            {error}
          </Txt>
        ) : null}
        <Button label={t('common.save')} onPress={submit} loading={save.isPending} disabled={!form.title.trim() || !form.borrower_id} />
        {book ? <Button label={t('common.delete')} variant="ghost" icon="trash-outline" style={{ marginTop: space.sm }} onPress={confirmDelete} /> : null}
      </Sheet>
      <PickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={effectiveKind === 'library' ? t('borrowed.fromLibrary') : t('borrowed.fromPerson')}
        options={(borrowers.data ?? [])
          .filter((b) => (b.kind === 'library' ? 'library' : 'person') === effectiveKind)
          .map((b) => ({ id: b.id, label: b.name }))}
        selected={form.borrower_id ? [form.borrower_id] : []}
        onChange={(ids) => set('borrower_id')(ids[0] ?? '')}
        onCreate={async (name) => (await createBorrower.mutateAsync({ name, kind: effectiveKind ?? 'person' })).id}
      />
    </>
  );
}

/**
 * "Kimden ödünç aldınız?" alanı: önce 👤 Kişi / 🏛 Kütüphane seçilir,
 * ardından o türün listesinden seçim kutusu görünür.
 */
export function FromKindField({
  kind,
  onKind,
  value,
  onOpen,
}: {
  kind: 'person' | 'library' | null;
  onKind: (k: 'person' | 'library') => void;
  value?: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ marginBottom: space.md }}>
      <Txt size="small" muted weight="500" style={{ marginBottom: space.sm }}>
        {t('borrowed.from')}
      </Txt>
      <View style={[styles.row, { marginBottom: kind ? space.sm : 0 }]}>
        <Chip icon="person-outline" label={t('borrowed.person')} active={kind === 'person'} onPress={() => onKind('person')} />
        <Chip icon="library-outline" label={t('borrowed.library')} active={kind === 'library'} onPress={() => onKind('library')} />
      </View>
      {kind ? (
        <SelectBox
          label=""
          value={value}
          placeholder={kind === 'library' ? t('borrowed.chooseLibrary') : t('borrowed.choosePerson')}
          onPress={onOpen}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
});
