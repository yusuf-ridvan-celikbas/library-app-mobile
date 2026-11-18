import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useBorrowedBooks, useReturnBorrowedBook } from '@/api/hooks';
import type { BorrowedBook } from '@/api/types';
import { StarRating } from '@/components/book';
import { BorrowedSheet, type BorrowedPrefill } from '@/components/BorrowedSheet';
import { Button, Card, EmptyState, ErrorState, IconButton, Loading, Screen, SectionTitle, Txt } from '@/components/ui';
import { formatDate } from '@/i18n';
import { today } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function BorrowedScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const list = useBorrowedBooks();
  const [editing, setEditing] = useState<BorrowedBook | 'new' | null>(null);
  const [prefill, setPrefill] = useState<BorrowedPrefill | undefined>(undefined);

  // + menüsünden ya da barkod taramasından gelince ekleme penceresini (dolu) aç.
  const params = useLocalSearchParams<{ add?: string; title?: string; author?: string; pages?: string; ts?: string }>();
  const [lastTs, setLastTs] = useState<string | undefined>(undefined);
  const openKey = params.add ? `${params.ts ?? ''}|${params.title ?? ''}` : undefined;
  if (openKey !== lastTs) {
    setLastTs(openKey);
    if (openKey) {
      setPrefill({ title: params.title, author_name: params.author, page_count: params.pages });
      setEditing('new');
    }
  }

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
      {editing ? (
        <BorrowedSheet
          book={editing === 'new' ? null : editing}
          prefill={editing === 'new' ? prefill : undefined}
          onClose={() => {
            setEditing(null);
            setPrefill(undefined);
          }}
        />
      ) : null}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
