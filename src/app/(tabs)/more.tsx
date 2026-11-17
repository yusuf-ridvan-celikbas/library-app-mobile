import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useReminders } from '@/api/hooks';
import { Card, ListRow, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

export default function MoreScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reminders = useReminders();
  const dueCount = (reminders.data?.overdue_count ?? 0) + (reminders.data?.upcoming_count ?? 0);

  const badge = dueCount ? (
    <View style={[styles.badge, { backgroundColor: reminders.data?.overdue_count ? colors.danger : colors.warning }]}>
      <Txt size="tiny" weight="700" color="#fff">
        {dueCount}
      </Txt>
    </View>
  ) : undefined;

  return (
    <Screen title={t('more.title')}>
      <Txt size="small" muted weight="600" style={styles.group}>
        {t('more.collection').toLocaleUpperCase()}
      </Txt>
      <Card style={styles.card}>
        <ListRow icon="people-outline" label={t('loans.title')} onPress={() => router.push('/loans')} />
        <ListRow icon="arrow-down-circle-outline" label={t('borrowed.title')} onPress={() => router.push('/borrowed')} />
        <ListRow icon="bookmark-outline" label={t('wishlist.title')} onPress={() => router.push('/wishlist')} />
        <ListRow icon="folder-open-outline" label={t('manage.title')} detail={t('more.manage')} onPress={() => router.push('/manage')} />
      </Card>

      <Txt size="small" muted weight="600" style={styles.group}>
        {t('more.insights').toLocaleUpperCase()}
      </Txt>
      <Card style={styles.card}>
        <ListRow icon="notifications-outline" label={t('reminders.title')} onPress={() => router.push('/reminders')} right={badge} />
        <ListRow icon="stats-chart-outline" label={t('stats.title')} onPress={() => router.push('/stats')} />
      </Card>

      <Txt size="small" muted weight="600" style={styles.group}>
        {t('more.app').toLocaleUpperCase()}
      </Txt>
      <Card style={styles.card}>
        <ListRow icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.lg, marginBottom: space.sm, marginLeft: space.xs, letterSpacing: 0.5 },
  card: { paddingVertical: space.xs },
  badge: { minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
