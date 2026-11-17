import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { useReminders } from '@/api/hooks';
import { ReminderRow } from '@/components/ReminderRow';
import { EmptyState, ErrorState, Loading, Screen } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function RemindersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reminders = useReminders();

  if (reminders.isLoading) return <Loading />;
  if (reminders.isError) return <ErrorState error={reminders.error} onRetry={() => void reminders.refetch()} />;

  return (
    <Screen
      edgeTop={false}
      refreshControl={<RefreshControl refreshing={reminders.isRefetching} onRefresh={() => void reminders.refetch()} tintColor={colors.accent} />}
    >
      {reminders.data?.items.length ? (
        <View style={{ gap: space.sm }}>
          {reminders.data.items.map((r) => (
            <ReminderRow key={`${r.type}-${r.record_id}`} item={r} />
          ))}
        </View>
      ) : (
        <EmptyState icon="notifications-off-outline" message={t('reminders.empty')} />
      )}
    </Screen>
  );
}
