import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { Button, errorMessage, Field, Txt } from '@/components/ui';
import { APP_NAME } from '@/config';
import { useSettings } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { colors, settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(settings.apiUrl);
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (server.trim() !== settings.apiUrl) await update({ apiUrl: server.trim() });
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + space.xxl * 2 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logo, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="library" size={36} color={colors.accent} />
        </View>
        <Txt size="title" serif weight="600" center>
          {APP_NAME}
        </Txt>
        <Txt muted center style={{ marginBottom: space.xxl }}>
          {t('auth.welcome')}
        </Txt>

        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          onSubmitEditing={submit}
        />

        {showServer ? (
          <Field label={t('settings.server')} value={server} onChangeText={setServer} autoCapitalize="none" placeholder={t('settings.serverHint')} />
        ) : null}

        {error ? (
          <View style={[styles.error, { backgroundColor: colors.dangerSoft }]}>
            <Txt size="small" color={colors.danger}>
              {error}
            </Txt>
          </View>
        ) : null}

        <Button label={t('auth.login')} onPress={submit} loading={busy} disabled={!email || !password} />

        <Pressable onPress={() => setShowServer((s) => !s)} style={styles.serverToggle}>
          <Ionicons name="server-outline" size={14} color={colors.textFaint} />
          <Txt size="tiny" faint numberOfLines={1}>
            {t('auth.server')}: {server}
          </Txt>
        </Pressable>

        <View style={styles.footer}>
          <Txt muted size="small">
            {t('auth.noAccount')}{' '}
          </Txt>
          <Link href="/register">
            <Txt size="small" weight="600" color={colors.accent}>
              {t('auth.register')}
            </Txt>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, flexGrow: 1 },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  error: { padding: space.md, borderRadius: radius.sm, marginBottom: space.md },
  serverToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: space.xl },
});
