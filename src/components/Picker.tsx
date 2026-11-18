import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { haptic, SearchBar, Sheet, Txt } from '@/components/ui';
import { useTheme } from '@/theme/SettingsProvider';
import { radius, space } from '@/theme/tokens';

export type PickerOption = { id: string; label: string; color?: string };

/** Türkçe karakter/aksan duyarsız arama ("dostoyevski" → "Dostoyevski"). */
export function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

/**
 * Aranabilir seçim penceresi. Tekli ya da çoklu seçim yapılabilir;
 * `onCreate` verilirse listede olmayan bir değer anında eklenebilir
 * (ör. yeni bir yazar) — kullanıcı formu terk etmek zorunda kalmaz.
 */
export function PickerSheet({
  visible,
  onClose,
  title,
  options,
  selected,
  onChange,
  multiple = false,
  onCreate,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  onCreate?: (name: string) => Promise<string | undefined>;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    const list = q ? options.filter((o) => fold(o.label).includes(q)) : options;
    // Seçili olanlar en üstte görünsün.
    return [...list].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  }, [options, query, selected]);

  const exactExists = options.some((o) => fold(o.label) === fold(query.trim()));

  function toggle(id: string) {
    haptic();
    if (multiple) {
      onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      onChange(selected[0] === id ? [] : [id]);
      close();
    }
  }

  function close() {
    setQuery('');
    onClose();
  }

  async function create() {
    if (!onCreate) return;
    setCreating(true);
    try {
      const id = await onCreate(query.trim());
      if (id) {
        onChange(multiple ? [...selected, id] : [id]);
        setQuery('');
        if (!multiple) onClose();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={title} scroll={false}>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('common.search')} />
      {onCreate && query.trim().length > 1 && !exactExists ? (
        <Pressable onPress={create} style={[styles.create, { backgroundColor: colors.accentSoft }]}>
          {creating ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Ionicons name="add-circle" size={20} color={colors.accent} />
          )}
          <Txt weight="600" color={colors.accent}>
            {t('form.createNew', { name: query.trim() })}
          </Txt>
        </Pressable>
      ) : null}
      {loading ? (
        <ActivityIndicator style={{ margin: space.xl }} color={colors.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          keyboardShouldPersistTaps="handled"
          // Sabit yükseklik yerine küçülebilir: klavye açıkken arama kutusu, sonuçlar
          // ve Tamam düğmesi birlikte klavyenin üstüne sığar.
          style={{ marginTop: space.sm, maxHeight: 420, flexShrink: 1 }}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <Txt muted center style={{ padding: space.xl }}>
              {t('form.noResults')}
            </Txt>
          }
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);
            return (
              <Pressable onPress={() => toggle(item.id)} style={styles.option}>
                {item.color ? <View style={[styles.dot, { backgroundColor: item.color }]} /> : null}
                <Txt style={{ flex: 1 }} weight={isSelected ? '600' : '400'}>
                  {item.label}
                </Txt>
                <Ionicons
                  name={isSelected ? (multiple ? 'checkbox' : 'checkmark-circle') : multiple ? 'square-outline' : 'ellipse-outline'}
                  size={22}
                  color={isSelected ? colors.accent : colors.textFaint}
                />
              </Pressable>
            );
          }}
        />
      )}
      {multiple ? (
        <Pressable onPress={close} style={[styles.done, { backgroundColor: colors.accent }]}>
          <Txt weight="600" color={colors.onAccent}>
            {t('common.done')}
          </Txt>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    marginTop: space.sm,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  done: { alignItems: 'center', padding: space.md, borderRadius: radius.md, marginTop: space.md },
});
