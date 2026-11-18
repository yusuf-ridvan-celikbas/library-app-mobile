import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  useBook,
  useBorrowers,
  useConvertToBorrowed,
  useCreateReference,
  useDeleteBook,
  useLendBook,
  useLoans,
  useReturnLoan,
  useSaveBook,
  useSaveSession,
  useSessions,
} from '@/api/hooks';
import type { BookStatus, Borrower, ReadingSession } from '@/api/types';
import { authorNames, Cover, StarRating, StatusPill } from '@/components/book';
import { PickerSheet } from '@/components/Picker';
import { SessionSheet } from '@/components/SessionSheet';
import { Button, Card, Chip, Divider, ErrorState, Field, IconButton, Loading, SectionTitle, SelectBox, Sheet, Txt, errorMessage } from '@/components/ui';
import { formatDate } from '@/i18n';
import { addDays, today } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

const STATUS_CHOICES: BookStatus[] = ['available', 'reading', 'read', 'lost', 'archived'];

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();

  const book = useBook(id);
  const sessions = useSessions({ book_id: id });
  const loans = useLoans();
  const saveBook = useSaveBook();
  const saveSession = useSaveSession();
  const deleteBook = useDeleteBook();
  const returnLoan = useReturnLoan();

  const [finishOpen, setFinishOpen] = useState(false);
  const [lendOpen, setLendOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  if (book.isLoading) return <Loading />;
  if (book.isError || !book.data) return <ErrorState error={book.error} onRetry={() => void book.refetch()} />;

  const b = book.data;
  const activeSession = sessions.data?.find((s) => s.status === 'in_progress');
  const activeLoan = loans.data?.find((l) => l.book?.id === b.id && l.status === 'active');
  const busy = saveBook.isPending || saveSession.isPending || returnLoan.isPending;

  const fail = (err: unknown) => Alert.alert(t('common.genericError'), errorMessage(err, t));

  async function startReading() {
    try {
      await saveSession.mutateAsync({ bookId: b.id, payload: { status: 'in_progress', started_at: today() } });
      await saveBook.mutateAsync({ id: b.id, payload: { status: 'reading' } });
    } catch (err) {
      fail(err);
    }
  }

  async function finishReading() {
    try {
      const payload = {
        status: 'finished' as const,
        started_at: activeSession?.started_at ?? null,
        finished_at: today(),
        rating,
        notes: notes.trim() || null,
      };
      await saveSession.mutateAsync({ id: activeSession?.id, bookId: b.id, payload });
      setFinishOpen(false);
      setRating(null);
      setNotes('');
    } catch (err) {
      fail(err);
    }
  }

  async function changeStatus(status: BookStatus) {
    setStatusOpen(false);
    try {
      await saveBook.mutateAsync({ id: b.id, payload: { status } });
    } catch (err) {
      fail(err);
    }
  }

  function confirmDelete() {
    const run = async () => {
      try {
        await deleteBook.mutateAsync(b.id);
        router.back();
      } catch (err) {
        fail(err);
      }
    };
    if (Platform.OS === 'web') {
      if (confirm(t('common.confirmDelete'))) void run();
      return;
    }
    Alert.alert(t('common.confirmDelete'), t('common.confirmDeleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: run },
    ]);
  }

  const details: [string, string | null | undefined][] = [
    [t('book.publisher'), b.publisher?.name],
    [t('book.translator'), b.translator],
    [t('book.edition'), b.edition ? t('book.editionValue', { value: b.edition }) : null],
    [t('book.published'), b.published_at ? formatDate(b.published_at) : null],
    [t('book.pages'), b.page_count ? String(b.page_count) : null],
    [t('book.location'), b.location?.display_name],
    [t('book.isbn'), b.isbn13 ?? b.isbn10],
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon="create-outline" label={t('common.edit')} onPress={() => router.push({ pathname: '/book/edit', params: { id: b.id } })} />
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={book.isRefetching} onRefresh={() => void book.refetch()} tintColor={colors.accent} />}
      >
        {/* Başlık alanı */}
        <View style={styles.hero}>
          <Cover book={b} width={130} />
          <Txt size="title" serif weight="600" center style={{ marginTop: space.lg }}>
            {b.title}
          </Txt>
          {b.subtitle ? (
            <Txt muted center>
              {b.subtitle}
            </Txt>
          ) : null}
          {b.authors?.length ? (
            <Txt size="heading" muted center style={{ marginTop: space.xs }}>
              {authorNames(b)}
            </Txt>
          ) : null}
          <View style={{ marginTop: space.md }}>
            <StatusPill status={b.status} />
          </View>
          {activeLoan ? (
            <Txt size="small" muted style={{ marginTop: space.sm }}>
              {t('book.loanedTo', { name: activeLoan.borrower.name })} · {formatDate(activeLoan.loaned_at)}
            </Txt>
          ) : null}
          {b.gift ? (
            <Txt size="small" muted style={{ marginTop: space.sm }}>
              {t('book.giftedTo', { name: b.gift.borrower.name })} · {formatDate(b.gift.gifted_at)}
            </Txt>
          ) : null}
        </View>

        {/* Ana eylemler — duruma göre tek, belirgin bir sonraki adım */}
        <View style={styles.actions}>
          {b.status === 'loaned' && activeLoan ? (
            <Button
              label={t('book.returnLoan')}
              icon="return-down-back"
              style={{ flex: 1 }}
              loading={returnLoan.isPending}
              onPress={() => returnLoan.mutateAsync(activeLoan.id).catch(fail)}
            />
          ) : b.status === 'reading' || activeSession ? (
            <Button label={t('book.markRead')} icon="checkmark-done" style={{ flex: 1 }} onPress={() => setFinishOpen(true)} />
          ) : b.status !== 'gifted' && b.status !== 'lost' ? (
            <Button label={t('book.startReading')} icon="book-outline" style={{ flex: 1 }} loading={busy} onPress={startReading} />
          ) : null}
          {b.status !== 'loaned' && b.status !== 'gifted' && b.status !== 'lost' ? (
            <Button label={t('book.lend')} icon="people-outline" variant="secondary" onPress={() => setLendOpen(true)} />
          ) : null}
        </View>

        {/* Detaylar */}
        <Card style={{ marginTop: space.xl }}>
          {details
            .filter(([, v]) => v)
            .map(([label, value], i) => (
              <View key={label}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.detailRow}>
                  <Txt muted size="small" style={{ width: 110 }}>
                    {label}
                  </Txt>
                  <Txt style={{ flex: 1 }}>{value}</Txt>
                </View>
              </View>
            ))}
          {b.tags?.length ? (
            <View style={styles.tags}>
              {b.tags.map((tg) => (
                <Chip key={tg.id} label={tg.name} color={tg.color} />
              ))}
            </View>
          ) : null}
        </Card>

        {b.description ? (
          <>
            <SectionTitle>{t('book.description')}</SectionTitle>
            <Txt muted>{b.description}</Txt>
          </>
        ) : null}

        {/* Okuma geçmişi */}
        <SectionTitle>{t('book.readingHistory')}</SectionTitle>
        {sessions.data?.length ? (
          <View style={{ gap: space.sm }}>
            {sessions.data.map((s) => (
              <SessionCard key={s.id} session={s} bookId={b.id} />
            ))}
          </View>
        ) : (
          <Txt muted>{t('book.noReadingHistory')}</Txt>
        )}

        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xxl }}>
          <Button label={t('book.changeStatus')} variant="secondary" icon="swap-horizontal" style={{ flex: 1 }} onPress={() => setStatusOpen(true)} />
          <Button label={t('common.delete')} variant="danger" icon="trash-outline" onPress={confirmDelete} />
        </View>
        {/* Yanlışlıkla kendi kitabı olarak eklenmiş ödünç (ör. kütüphane) kitabı taşı */}
        {b.status !== 'loaned' && b.status !== 'gifted' ? (
          <Button
            label={t('book.convertToBorrowed')}
            variant="ghost"
            icon="arrow-down-circle-outline"
            style={{ marginTop: space.sm }}
            onPress={() => setConvertOpen(true)}
          />
        ) : null}
      </ScrollView>

      {/* Bitirme: puan + not */}
      <Sheet visible={finishOpen} onClose={() => setFinishOpen(false)} title={t('book.markRead')}>
        <Txt muted style={{ marginBottom: space.sm }}>
          {t('book.rate')}
        </Txt>
        <StarRating value={rating} onChange={setRating} size={36} />
        <Field multiline value={notes} onChangeText={setNotes} placeholder={t('wishlist.notes')} style={{ marginTop: space.lg }} />
        <Button label={t('common.save')} onPress={finishReading} loading={saveSession.isPending} />
      </Sheet>

      {/* Durum değiştir */}
      <Sheet visible={statusOpen} onClose={() => setStatusOpen(false)} title={t('book.changeStatus')}>
        <View style={styles.statusGrid}>
          {STATUS_CHOICES.map((s) => (
            <Chip key={s} label={t(`status.${s}`)} active={b.status === s} onPress={() => changeStatus(s)} />
          ))}
        </View>
      </Sheet>

      <LendSheet visible={lendOpen} onClose={() => setLendOpen(false)} bookId={b.id} />
      {convertOpen ? <ConvertToBorrowedSheet bookId={b.id} title={b.title} onClose={() => setConvertOpen(false)} /> : null}
    </>
  );
}

/** Bir okuma kaydı: dokununca durum/tarih/puan/not düzenlenir ya da silinir. */
function SessionCard({ session, bookId }: { session: ReadingSession; bookId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const range = [session.started_at, session.finished_at].filter(Boolean).map((d) => formatDate(d)).join(' → ');

  return (
    <>
      <Card tone="muted" onPress={() => setEditing(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt weight="600">{t(`readingStatus.${session.status}`)}</Txt>
            {range ? (
              <Txt size="small" muted>
                {range}
              </Txt>
            ) : null}
          </View>
          {session.rating ? <StarRating value={session.rating} size={16} /> : null}
          <Ionicons name="create-outline" size={18} color={colors.textFaint} />
        </View>
        {session.notes ? (
          <Txt size="small" muted style={{ marginTop: space.sm }}>
            {session.notes}
          </Txt>
        ) : null}
      </Card>
      {editing ? <SessionSheet session={session} bookId={bookId} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

/** "Ödünç aldığım kitaba dönüştür": kimden alındığı + (isteğe bağlı) iade tarihi. */
function ConvertToBorrowedSheet({ bookId, title, onClose }: { bookId: string; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const borrowers = useBorrowers();
  const createBorrower = useCreateReference<Borrower>('borrowers');
  const convert = useConvertToBorrowed();
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrowerName = borrowers.data?.find((p) => p.id === borrowerId)?.name;

  async function submit() {
    if (!borrowerId) return;
    setError(null);
    try {
      await convert.mutateAsync({ bookId, borrowerId, dueAt: dueAt.trim() || null });
      onClose();
      router.replace('/borrowed');
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  return (
    <>
      <Sheet visible={!pickerOpen} onClose={onClose} title={t('book.convertToBorrowed')}>
        <Txt muted style={{ marginBottom: space.lg }}>
          {t('book.convertDesc', { title })}
        </Txt>
        <SelectBox label={t('borrowed.from')} value={borrowerName} placeholder={t('borrowed.fromPlaceholder')} onPress={() => setPickerOpen(true)} />
        <Field label={`${t('loans.dueAt')} (${t('common.optional')})`} value={dueAt} onChangeText={setDueAt} placeholder="2026-12-31" keyboardType="numbers-and-punctuation" />
        {error ? (
          <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
            {error}
          </Txt>
        ) : null}
        <Button label={t('book.convertConfirm')} onPress={submit} disabled={!borrowerId} loading={convert.isPending} />
      </Sheet>
      <PickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('borrowed.from')}
        options={(borrowers.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
        selected={borrowerId ? [borrowerId] : []}
        onChange={(ids) => setBorrowerId(ids[0] ?? null)}
        onCreate={async (name) => (await createBorrower.mutateAsync({ name })).id}
      />
    </>
  );
}

function LendSheet({ visible, onClose, bookId }: { visible: boolean; onClose: () => void; bookId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const borrowers = useBorrowers();
  const createBorrower = useCreateReference<Borrower>('borrowers');
  const lend = useLendBook();
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState(addDays(14));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borrowerName = borrowers.data?.find((b) => b.id === borrowerId)?.name;

  async function submit() {
    if (!borrowerId) return;
    setError(null);
    try {
      await lend.mutateAsync({ book_id: bookId, borrower_id: borrowerId, due_at: dueAt || null });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  return (
    <>
      <Sheet visible={visible && !pickerOpen} onClose={onClose} title={t('loans.lendTitle')}>
        <SelectBox label={t('loans.borrower')} value={borrowerName} placeholder={t('form.select')} onPress={() => setPickerOpen(true)} />
        <Field label={t('loans.dueAt')} value={dueAt} onChangeText={setDueAt} placeholder="2026-12-31" />
        {error ? (
          <View style={{ padding: space.md, borderRadius: radius.sm, backgroundColor: colors.dangerSoft, marginBottom: space.md }}>
            <Txt size="small" color={colors.danger}>
              {error}
            </Txt>
          </View>
        ) : null}
        <Button label={t('book.lend')} onPress={submit} disabled={!borrowerId} loading={lend.isPending} />
      </Sheet>
      <PickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('loans.borrower')}
        options={(borrowers.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        selected={borrowerId ? [borrowerId] : []}
        onChange={(ids) => setBorrowerId(ids[0] ?? null)}
        onCreate={async (name) => (await createBorrower.mutateAsync({ name })).id}
        loading={borrowers.isLoading}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  detailRow: { flexDirection: 'row', paddingVertical: space.sm, gap: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
