import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic, ListRow, Sheet, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

/**
 * 4 sekme + ortada yükseltilmiş "+" düğmesi. "+" bir sekmeye gitmez,
 * ekleme seçeneklerini (barkod / elle / alınacaklar) bir alt sayfada açar
 * — en sık yapılan işlem tek dokunuş uzaklıkta.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [addOpen, setAddOpen] = useState(false);

  const icon = (name: IconName, active: IconName) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Ionicons name={focused ? active : name} size={24} color={color as string} />;
    };

  function go(path: '/scan' | '/book/edit' | '/wishlist') {
    setAddOpen(false);
    router.push(path === '/wishlist' ? { pathname: '/wishlist', params: { add: '1' } } : path);
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textFaint,
          // Yükseklik Android'in gezinme çubuğu (geri/ana ekran tuşları) kadar
          // artırılır — aksi halde sekmeler o çubuğun ALTINDA kalıp dokunuşlar
          // sistem tuşlarına gidiyordu.
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 64 + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom + 4,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
        <Tabs.Screen name="library" options={{ title: t('tabs.library'), tabBarIcon: icon('library-outline', 'library') }} />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarButton: () => (
              <View style={styles.addWrap}>
                <Pressable
                  accessibilityLabel={t('tabs.add')}
                  onPress={() => {
                    haptic();
                    setAddOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: colors.accent, shadowColor: colors.accent, transform: [{ scale: pressed ? 0.94 : 1 }] },
                  ]}
                >
                  <Ionicons name="add" size={30} color={colors.onAccent} />
                </Pressable>
              </View>
            ),
          }}
        />
        <Tabs.Screen name="reading" options={{ title: t('tabs.reading'), tabBarIcon: icon('book-outline', 'book') }} />
        <Tabs.Screen name="more" options={{ title: t('tabs.more'), tabBarIcon: icon('grid-outline', 'grid') }} />
      </Tabs>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t('add.title')}>
        <View style={{ gap: space.sm }}>
          <ListRow icon="barcode-outline" label={t('add.scan')} detail={t('add.scanDesc')} onPress={() => go('/scan')} />
          <ListRow icon="create-outline" label={t('add.manual')} detail={t('add.manualDesc')} onPress={() => go('/book/edit')} />
          <ListRow icon="bookmark-outline" label={t('add.wishlist')} detail={t('add.wishlistDesc')} onPress={() => go('/wishlist')} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  addWrap: { flex: 1, alignItems: 'center' },
  addButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
