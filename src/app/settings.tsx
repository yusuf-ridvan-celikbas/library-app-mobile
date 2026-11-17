import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { api, setApiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, Chip, errorMessage, Field, ListRow, Screen, Txt } from '@/components/ui';
import { APP_NAME } from '@/config';
import { useSettings } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, update, colors } = useSettings();
  const { user, logout } = useAuth();
  const [server, setServer] = useState(settings.apiUrl);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const previous = settings.apiUrl;
    try {
      setApiUrl(server.trim());
      await api.get('/auth/me');
      await update({ apiUrl: server.trim() });
      setTestResult({ ok: true, message: t('settings.testOk') });
    } catch (err) {
      setApiUrl(previous);
      setTestResult({ ok: false, message: errorMessage(err, t) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Screen edgeTop={false}>
      <Txt size="small" muted weight="600" style={styles.group}>
        {t('settings.language').toLocaleUpperCase()}
      </Txt>
      <View style={styles.chips}>
        <Chip label="Türkçe" active={settings.language === 'tr'} onPress={() => update({ language: 'tr' })} />
        <Chip label="English" active={settings.language === 'en'} onPress={() => update({ language: 'en' })} />
      </View>

      <Txt size="small" muted weight="600" style={styles.group}>
        {t('settings.theme').toLocaleUpperCase()}
      </Txt>
      <View style={styles.chips}>
        <Chip icon="phone-portrait-outline" label={t('settings.themeSystem')} active={settings.theme === 'system'} onPress={() => update({ theme: 'system' })} />
        <Chip icon="sunny-outline" label={t('settings.themeLight')} active={settings.theme === 'light'} onPress={() => update({ theme: 'light' })} />
        <Chip icon="moon-outline" label={t('settings.themeDark')} active={settings.theme === 'dark'} onPress={() => update({ theme: 'dark' })} />
      </View>

      <Txt size="small" muted weight="600" style={styles.group}>
        {t('settings.server').toLocaleUpperCase()}
      </Txt>
      <Field value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} placeholder={t('settings.serverHint')} />
      <Button label={t('settings.test')} variant="secondary" icon="pulse-outline" onPress={testConnection} loading={testing} />
      {testResult ? (
        <Txt size="small" color={testResult.ok ? colors.accent : colors.danger} style={{ marginTop: space.sm }}>
          {testResult.message}
        </Txt>
      ) : null}

      <Txt size="small" muted weight="600" style={styles.group}>
        {t('settings.account').toLocaleUpperCase()}
      </Txt>
      <Card style={{ paddingVertical: space.xs }}>
        <ListRow icon="person-circle-outline" label={user?.name ?? ''} detail={user?.email} />
        <ListRow icon="log-out-outline" label={t('auth.logout')} danger onPress={logout} />
      </Card>

      <Txt size="tiny" faint center style={{ marginTop: space.xxl }}>
        {APP_NAME} · v1.0.0
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
