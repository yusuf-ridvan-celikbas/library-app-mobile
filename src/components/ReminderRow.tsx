import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ReminderItem } from '@/api/types';
import { Txt } from '@/components/ui';
import { formatDate } from '@/i18n';
import { useTheme } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

export function ReminderRow({ item }: { item: ReminderItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tone = item.is_overdue ? colors.danger : colors.warning;
  const toneBg = item.is_overdue ? colors.dangerSoft : colors.warningSoft;
  const when = item.is_overdue
    ? t('home.overdue', { count: Math.abs(item.days_diff) })
    : item.days_diff === 0
      ? t('home.dueToday')
      : t('home.dueIn', { count: item.days_diff });

  return (
    <Pressable
      onPress={() => router.push(item.type === 'loan' ? '/loans' : '/borrowed')}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: toneBg }]}>
        <Ionicons name={item.type === 'loan' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} size={20} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="600" numberOfLines={1}>
          {item.title}
        </Txt>
        <Txt size="small" muted numberOfLines={1}>
          {item.type === 'loan' ? t('reminders.lent', { name: item.person_name }) : t('reminders.borrowedFrom', { name: item.person_name })}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt size="small" weight="600" color={tone}>
          {when}
        </Txt>
        <Txt size="tiny" faint>
          {formatDate(item.due_at)}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
