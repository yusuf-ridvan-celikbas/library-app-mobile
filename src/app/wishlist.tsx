import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useConvertWishlistItem, useDeleteWishlistItem, useSaveWishlistItem, useWishlist } from '@/api/hooks';
import type { WishlistItem } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, errorMessage, Field, IconButton, Loading, Screen, Sheet, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

export default function WishlistScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ add?: string }>();
  const list = useWishlist();
  const [editing, setEditing] = useState<WishlistItem | 'new' | null>(params.add ? 'new' : null);

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="add" label={t('wishlist.add')} onPress={() => setEditing('new')} /> }} />
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Screen edgeTop={false} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.accent} />}>
          {list.data?.length ? (
            <View style={{ gap: space.sm }}>
              {list.data.map((item) => (
                <WishCard key={item.id} item={item} onEdit={() => setEditing(item)} />
              ))}
            </View>
          ) : (
            <EmptyState icon="bookmark-outline" message={t('wishlist.empty')}>
              <Button label={t('wishlist.add')} icon="add" variant="secondary" small onPress={() => setEditing('new')} />
            </EmptyState>
          )}
        </Screen>
      )}
      {editing ? <WishSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function WishCard({ item, onEdit }: { item: WishlistItem; onEdit: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const convert = useConvertWishlistItem();

  return (
    <Card onPress={onEdit}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt serif weight="600">
            {item.title}
          </Txt>
          {item.author_name ? (
            <Txt size="small" muted>
              {item.author_name}
            </Txt>
          ) : null}
          {item.notes ? (
            <Txt size="small" faint numberOfLines={2}>
              {item.notes}
            </Txt>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </View>
      <Button
        label={t('wishlist.toLibrary')}
        icon="checkmark-circle-outline"
        variant="secondary"
        small
        style={{ alignSelf: 'flex-start', marginTop: space.md }}
        loading={convert.isPending}
        onPress={async () => {
          const book = await convert.mutateAsync(item.id);
          router.push({ pathname: '/book/edit', params: { id: book.id } });
        }}
      />
    </Card>
  );
}

function WishSheet({ item, onClose }: { item: WishlistItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveWishlistItem();
  const remove = useDeleteWishlistItem();
  const [form, setForm] = useState({
    title: item?.title ?? '',
    author_name: item?.author_name ?? '',
    isbn: item?.isbn ?? '',
    notes: item?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        id: item?.id,
        payload: {
          title: form.title.trim(),
          author_name: form.author_name.trim() || null,
          isbn: form.isbn.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  return (
    <Sheet visible onClose={onClose} title={item ? t('common.edit') : t('wishlist.add')}>
      <Field label={t('form.title')} value={form.title} onChangeText={set('title')} autoFocus={!item} />
      <Field label={t('borrowed.author')} value={form.author_name} onChangeText={set('author_name')} />
      <Field label={t('form.isbn')} value={form.isbn} onChangeText={set('isbn')} keyboardType="number-pad" />
      <Field label={t('wishlist.notes')} value={form.notes} onChangeText={set('notes')} multiline />
      {error ? (
        <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
          {error}
        </Txt>
      ) : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} disabled={!form.title.trim()} />
      {item ? (
        <Pressable
          onPress={async () => {
            await remove.mutateAsync(item.id);
            onClose();
          }}
          style={{ alignItems: 'center', padding: space.lg }}
        >
          <Txt color={colors.danger} weight="500">
            {t('common.delete')}
          </Txt>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
