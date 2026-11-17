import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { useScanIsbn } from '@/api/hooks';
import { Button, errorMessage, Field, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

type Result =
  | { kind: 'notFound'; isbn: string }
  | { kind: 'exists'; bookId: string }
  | { kind: 'error'; message: string };

/**
 * Barkod okut → backend Open Library / Google Books'tan bilgileri çekip
 * kitabı tek adımda oluşturur → kitap detayına geçilir. Bulunamazsa ISBN
 * önceden doldurulmuş elle ekleme formuna yönlendirilir.
 */
export default function ScanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useScanIsbn();
  const locked = useRef(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function lookup(raw: string) {
    const isbn = raw.replace(/[^0-9Xx]/g, '');
    if (locked.current || isbn.length < 10) return;
    locked.current = true;
    setResult(null);
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const book = await scan.mutateAsync(isbn);
      router.replace(`/book/${book.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.errorCode === 'BOOK_ALREADY_EXISTS' && err.context?.book_id) {
        setResult({ kind: 'exists', bookId: String(err.context.book_id) });
      } else if (err instanceof ApiError && (err.errorCode === 'ISBN_NOT_FOUND' || err.errorCode === 'EXTERNAL_SERVICE_UNAVAILABLE')) {
        setResult({ kind: 'notFound', isbn });
      } else {
        setResult({ kind: 'error', message: errorMessage(err, t) });
      }
    }
  }

  function retry() {
    setResult(null);
    locked.current = false;
  }

  const resultPanel = result ? (
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      {result.kind === 'exists' ? (
        <>
          <Txt center weight="600">{t('scan.exists')}</Txt>
          <Button label={t('common.done')} onPress={() => router.replace(`/book/${result.bookId}`)} />
        </>
      ) : result.kind === 'notFound' ? (
        <>
          <Txt center>{t('scan.notFound')}</Txt>
          <Button label={t('scan.addManually')} onPress={() => router.replace({ pathname: '/book/edit', params: { isbn: result.isbn } })} />
        </>
      ) : (
        <Txt center color={colors.danger}>
          {result.message}
        </Txt>
      )}
      <Button label={t('common.retry')} variant="ghost" onPress={retry} />
    </View>
  ) : null;

  const manual = (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <Field value={manualIsbn} onChangeText={setManualIsbn} placeholder={t('scan.manualIsbn')} keyboardType="number-pad" />
      </View>
      <Button label={t('scan.lookup')} onPress={() => lookup(manualIsbn)} disabled={manualIsbn.replace(/\D/g, '').length < 10} />
    </View>
  );

  // Web önizlemesinde kamera ile tarama yerine elle ISBN girişi.
  if (Platform.OS === 'web') {
    return (
      <Screen edgeTop={false}>
        <Txt muted style={{ marginBottom: space.lg }}>
          {t('scan.unsupportedWeb')}
        </Txt>
        {manual}
        {scan.isPending ? <ActivityIndicator color={colors.accent} /> : resultPanel}
      </Screen>
    );
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <Screen edgeTop={false}>
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxl }}>
          <Ionicons name="camera-outline" size={48} color={colors.textFaint} />
          <Txt center muted>
            {t('scan.permission')}
          </Txt>
          <Button label={t('scan.allow')} onPress={requestPermission} />
        </View>
        <View style={{ marginTop: space.xxl }}>{manual}</View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
        onBarcodeScanned={result || scan.isPending ? undefined : (e: BarcodeScanningResult) => lookup(e.data)}
      />
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
        <Txt color="#fff" center style={{ marginTop: space.lg }}>
          {scan.isPending ? t('scan.looking') : t('scan.hint')}
        </Txt>
        {scan.isPending ? <ActivityIndicator color="#fff" style={{ marginTop: space.md }} /> : null}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>{resultPanel}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 280, height: 160, borderRadius: radius.md, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  bottom: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
