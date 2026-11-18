import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  useAuthors,
  useBorrowers,
  useCreateReference,
  useDeleteReference,
  useLocations,
  usePublishers,
  useTags,
  useUpdateReference,
} from '@/api/hooks';
import { fold } from '@/components/Picker';
import { LocalError } from '@/db';
import { Button, Chip, errorMessage, Field, IconButton, Loading, SearchBar, Sheet, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

// 'libraries' ayrı bir sekme ama aynı tabloyu (borrowers, kind='library') kullanır.
type Kind = 'authors' | 'publishers' | 'locations' | 'tags' | 'borrowers' | 'libraries';
const tableFor = (k: Kind) => (k === 'libraries' ? 'borrowers' : k);
type Row = { id: string; label: string; color?: string; raw: Record<string, unknown> };

/** Yazar / yayınevi / raf / tür / kişi kayıtlarını tek ekranda yönetir. */
export default function ManageScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [kind, setKind] = useState<Kind>('authors');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const authors = useAuthors();
  const publishers = usePublishers();
  const locations = useLocations();
  const tags = useTags();
  const borrowers = useBorrowers();

  const source = { authors, publishers, locations, tags, borrowers, libraries: borrowers }[kind];
  const rows: Row[] = useMemo(() => {
    const all = (source.data ?? []) as unknown as Record<string, unknown>[];
    // Kişiler ve kütüphaneler aynı tabloda; her sekme kendi türünü gösterir.
    const data =
      kind === 'borrowers' ? all.filter((d) => d.kind !== 'library') : kind === 'libraries' ? all.filter((d) => d.kind === 'library') : all;
    const mapped = data.map((d) => ({
      id: String(d.id),
      label: kind === 'locations' ? String(d.display_name) : String(d.name),
      color: kind === 'tags' ? String(d.color) : undefined,
      raw: d,
    }));
    const q = fold(query.trim());
    return q ? mapped.filter((r) => fold(r.label).includes(q)) : mapped;
  }, [source.data, kind, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
          {(['authors', 'publishers', 'locations', 'tags', 'borrowers', 'libraries'] as Kind[]).map((k) => (
            <Chip key={k} label={t(`manage.${k}`)} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={t('common.search')} />
          </View>
          <IconButton icon="add" label={t('common.add')} onPress={() => setEditing('new')} />
        </View>
      </View>
      {source.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => setEditing(item)} style={styles.row}>
              {item.color ? <View style={[styles.dot, { backgroundColor: item.color }]} /> : null}
              <Txt style={{ flex: 1 }}>{item.label}</Txt>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          )}
        />
      )}
      {editing ? <EditSheet kind={kind} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}

function EditSheet({ kind, row, onClose }: { kind: Kind; row: Row | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const create = useCreateReference(tableFor(kind));
  const update = useUpdateReference(tableFor(kind));
  const remove = useDeleteReference(tableFor(kind));
  const isLocation = kind === 'locations';
  const [name, setName] = useState(String(row?.raw.name ?? ''));
  const [room, setRoom] = useState(String(row?.raw.room ?? ''));
  const [shelf, setShelf] = useState(String(row?.raw.shelf ?? ''));
  const [error, setError] = useState<string | null>(null);

  const payload = isLocation
    ? { room: room.trim(), shelf: shelf.trim() }
    : {
        name: name.trim(),
        ...(kind === 'tags' && row ? { color: row.color } : {}),
        ...(kind === 'libraries' ? { kind: 'library' } : {}),
      };

  async function submit() {
    setError(null);
    try {
      if (row) await update.mutateAsync({ id: row.id, payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  }

  async function del() {
    if (!row) return;
    setError(null);
    try {
      await remove.mutateAsync(row.id);
      onClose();
    } catch (err) {
      setError(err instanceof LocalError && err.code === 'IN_USE' ? t('manage.inUse') : errorMessage(err, t));
    }
  }

  return (
    <Sheet visible onClose={onClose} title={row ? t('common.edit') : t('common.add')}>
      {isLocation ? (
        <>
          <Field label={t('manage.room')} value={room} onChangeText={setRoom} autoFocus />
          <Field label={t('manage.shelf')} value={shelf} onChangeText={setShelf} />
        </>
      ) : (
        <Field label={t('manage.name')} value={name} onChangeText={setName} autoFocus />
      )}
      {error ? (
        <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
          {error}
        </Txt>
      ) : null}
      <Button
        label={t('common.save')}
        onPress={submit}
        loading={create.isPending || update.isPending}
        disabled={isLocation ? !room.trim() || !shelf.trim() : !name.trim()}
      />
      {row ? <Button label={t('common.delete')} variant="ghost" style={{ marginTop: space.sm }} onPress={del} loading={remove.isPending} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
