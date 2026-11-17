import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button, errorMessage, Field, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmation: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const fieldError = (k: string) => (error instanceof ApiError ? error.fieldError(k) : undefined);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password, form.confirmation);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t('auth.register')} edgeTop={false}>
      <Field label={t('auth.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        error={fieldError('email')}
      />
      <Field label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry error={fieldError('password')} />
      <Field label={t('auth.passwordConfirm')} value={form.confirmation} onChangeText={set('confirmation')} secureTextEntry />
      {error && !(error instanceof ApiError && error.fieldErrors) ? (
        <View style={{ marginBottom: space.md }}>
          <Txt size="small" color={colors.danger}>
            {errorMessage(error, t)}
          </Txt>
        </View>
      ) : null}
      <Button label={t('auth.register')} onPress={submit} loading={busy} disabled={!form.name || !form.email || !form.password} />
    </Screen>
  );
}
