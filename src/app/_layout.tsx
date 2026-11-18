import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { getDb } from '@/db';
import { updateReadingWidget } from '@/widgets/updateReadingWidget';
import { SettingsProvider, useSettings } from '@/theme/SettingsProvider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Veri sadece bu cihazda ve sadece bu uygulamadan değişir: değişiklikler
        // ilgili sorguları geçersiz kılar, arka planda yeniden çekmeye gerek yok.
        defaultOptions: { queries: { staleTime: Infinity, retry: false, networkMode: 'always' }, mutations: { networkMode: 'always' } },
      }),
  );

  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <Navigation />
        </SettingsProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}

function Navigation() {
  const { t } = useTranslation();
  const { ready, colors, scheme } = useSettings();
  const [dbReady, setDbReady] = useState(false);

  // Veritabanını (ve şema göçlerini) splash ekranı açıkken hazırla.
  useEffect(() => {
    getDb().then(() => {
      setDbReady(true);
      void updateReadingWidget();
    });
  }, []);

  const booting = !ready || !dbReady;
  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync();
  }, [booting]);

  if (booting) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, border: colors.border, primary: colors.accent },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="book/edit" options={{ presentation: 'modal', title: t('form.newBook') }} />
        <Stack.Screen name="scan" options={{ title: t('scan.title'), presentation: 'fullScreenModal' }} />
        <Stack.Screen name="loans" options={{ title: t('loans.title') }} />
        <Stack.Screen name="borrowed" options={{ title: t('borrowed.title') }} />
        <Stack.Screen name="wishlist" options={{ title: t('wishlist.title') }} />
        <Stack.Screen name="stats" options={{ title: t('stats.title') }} />
        <Stack.Screen name="reminders" options={{ title: t('reminders.title') }} />
        <Stack.Screen name="manage" options={{ title: t('manage.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
      </Stack>
    </ThemeProvider>
  );
}
