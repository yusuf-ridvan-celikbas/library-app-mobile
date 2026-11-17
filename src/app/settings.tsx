import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card, Chip, errorMessage, Field, ListRow, Screen, Txt } from '@/components/ui';
import { APP_NAME } from '@/config';
import { exportBackup, importBackup } from '@/db/repo/backup';
import { todayYmd } from '@/db';
import { useSettings } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, update, colors } = useSettings();
  const queryClient = useQueryClient();
  const [name, setName] = useState(settings.name);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function doExport() {
    setBusy('export');
    setMessage(null);
    try {
      const backup = { ...(await exportBackup()), owner_name: settings.name || undefined };
      const file = new File(Paths.cache, `eighteeneleven-yedek-${todayYmd()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(backup));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: t('settings.exportBackup') });
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err, t) });
    } finally {
      setBusy(null);
    }
  }

  async function pickAndImport() {
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
    if (picked.canceled) return;
    Alert.alert(t('settings.importConfirmTitle'), t('settings.importConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.importBackup'), style: 'destructive', onPress: () => void doImport(picked.assets[0].uri) },
    ]);
  }

  async function doImport(uri: string) {
    setBusy('import');
    try {
      const raw = JSON.parse(await new File(uri).text());
      const counts = await importBackup(raw);
      if (typeof raw.owner_name === 'string' && raw.owner_name) {
        await update({ name: raw.owner_name });
        setName(raw.owner_name);
      }
      await queryClient.invalidateQueries();
      setMessage({ ok: true, text: t('settings.importDone', { books: counts.books ?? 0 }) });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof SyntaxError ? t('settings.invalidFile') : errorMessage(err, t) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edgeTop={false}>
      <Txt size="small" muted weight="600" style={styles.group}>
        {t('settings.yourName').toLocaleUpperCase()}
      </Txt>
      <Field value={name} onChangeText={setName} onEndEditing={() => update({ name: name.trim() })} placeholder={t('settings.namePlaceholder')} />

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
        {t('settings.backup').toLocaleUpperCase()}
      </Txt>
      <Card style={{ paddingVertical: space.xs }}>
        <ListRow icon="cloud-upload-outline" label={t('settings.exportBackup')} detail={t('settings.exportBackupDesc')} onPress={busy ? undefined : doExport} />
        <ListRow icon="cloud-download-outline" label={t('settings.importBackup')} detail={t('settings.importBackupDesc')} onPress={busy ? undefined : pickAndImport} />
      </Card>
      {busy ? (
        <Txt size="small" muted style={{ marginTop: space.sm }}>
          {t('common.loading')}
        </Txt>
      ) : null}
      {message ? (
        <Txt size="small" color={message.ok ? colors.accent : colors.danger} style={{ marginTop: space.sm }}>
          {message.text}
        </Txt>
      ) : null}
      <Txt size="tiny" faint style={{ marginTop: space.sm }}>
        {t('settings.offlineNote')}
      </Txt>

      <Txt size="tiny" faint center style={{ marginTop: space.xxl }}>
        {APP_NAME} · v1.1.0
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xl, marginBottom: space.sm, marginLeft: space.xs, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
