import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useLoans, useReturnLoan } from '@/api/hooks';
import type { Loan } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, Loading, Screen, SectionTitle, Txt } from '@/components/ui';
import { formatDate } from '@/i18n';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function LoansScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loans = useLoans();

  if (loans.isLoading) return <Loading />;
  if (loans.isError) return <ErrorState error={loans.error} onRetry={() => void loans.refetch()} />;

  const active = loans.data?.filter((l) => l.status === 'active') ?? [];
  const returned = loans.data?.filter((l) => l.status !== 'active') ?? [];

  return (
    <Screen edgeTop={false} refreshControl={<RefreshControl refreshing={loans.isRefetching} onRefresh={() => void loans.refetch()} tintColor={colors.accent} />}>
      <SectionTitle>{t('loans.active')}</SectionTitle>
      {active.length ? (
        <View style={{ gap: space.sm }}>
          {active.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </View>
      ) : (
        <EmptyState icon="people-outline" message={t('loans.empty')} />
      )}

      {returned.length ? (
        <>
          <SectionTitle>{t('loans.returned')}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {returned.map((l) => (
              <LoanCard key={l.id} loan={l} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const giveBack = useReturnLoan();
  const isActive = loan.status === 'active';

  return (
    <Card tone={isActive ? undefined : 'muted'} onPress={loan.book ? () => router.push(`/book/${loan.book!.id}`) : undefined}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt serif weight="600" numberOfLines={2}>
            {loan.book?.title ?? '—'}
          </Txt>
          <Txt size="small" muted>
            {loan.borrower.name} · {t('loans.since', { date: formatDate(loan.loaned_at) })}
          </Txt>
          {loan.due_at && isActive ? (
            <Txt size="small" weight="500" color={loan.is_overdue ? colors.danger : colors.textMuted}>
              {loan.is_overdue ? `${t('loans.overdue')} · ` : ''}
              {formatDate(loan.due_at)}
            </Txt>
          ) : null}
          {loan.returned_at ? (
            <Txt size="small" faint>
              ✓ {formatDate(loan.returned_at)}
            </Txt>
          ) : null}
        </View>
        {isActive ? (
          <Button label={t('book.returnLoan')} small variant="secondary" loading={giveBack.isPending} onPress={() => giveBack.mutate(loan.id)} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
