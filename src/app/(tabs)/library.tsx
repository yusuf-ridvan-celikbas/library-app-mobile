import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthors, useBooks, useLocations, usePublishers, useTags, type BookFilters } from '@/api/hooks';
import type { BookStatus } from '@/api/types';
import { BookRow, BookTile } from '@/components/book';
import { PickerSheet, type PickerOption } from '@/components/Picker';
import { Button, Chip, EmptyState, ErrorState, IconButton, Loading, SearchBar, Sheet, Txt } from '@/components/ui';
import { useSettings } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

const STATUSES: BookStatus[] = ['available', 'reading', 'read', 'loaned', 'gifted', 'lost', 'archived'];
type RefFilter = 'location_id' | 'tag_id' | 'author_id' | 'publisher_id';

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { colors, settings, update } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ status?: BookStatus }>();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Omit<BookFilters, 'search'>>({ status: params.status ?? '' });
  const [filterSheet, setFilterSheet] = useState(false);
  const [picker, setPicker] = useState<RefFilter | null>(null);

  // Ana sayfadan "?status=available" ile gelinirse filtreyi uygula
  // (parametre değiştiğinde render sırasında — effect'e gerek yok).
  const [lastParam, setLastParam] = useState(params.status);
  if (params.status !== lastParam) {
    setLastParam(params.status);
    if (params.status) setFilters((f) => ({ ...f, status: params.status }));
  }

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useBooks({ ...filters, search: debounced });
  const books = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.meta.total;

  const locations = useLocations();
  const tags = useTags();
  const authors = useAuthors();
  const publishers = usePublishers();

  const refOptions: Record<RefFilter, PickerOption[]> = {
    location_id: (locations.data ?? []).map((l) => ({ id: l.id, label: l.display_name })),
    tag_id: (tags.data ?? []).map((tg) => ({ id: tg.id, label: tg.name, color: tg.color })),
    author_id: (authors.data ?? []).map((a) => ({ id: a.id, label: a.name })),
    publisher_id: (publishers.data ?? []).map((p) => ({ id: p.id, label: p.name })),
  };
  const refLabels: Record<RefFilter, string> = {
    location_id: t('library.shelf'),
    tag_id: t('library.tag'),
    author_id: t('library.author'),
    publisher_id: t('library.publisher'),
  };
  const activeRefFilters = (Object.keys(refLabels) as RefFilter[]).filter((k) => filters[k]);
  const labelFor = (k: RefFilter) => refOptions[k].find((o) => o.id === filters[k])?.label ?? refLabels[k];

  const isGrid = settings.libraryView === 'grid';
  const columns = Math.max(3, Math.floor((width - space.lg * 2) / 120));
  const tileWidth = (width - space.lg * 2 - space.md * (columns - 1)) / columns;

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Txt size="title" serif weight="600">
            {t('library.title')}
          </Txt>
          {total !== undefined ? <Txt muted>{t('library.count', { count: total })}</Txt> : null}
        </View>
        <IconButton
          icon={isGrid ? 'list' : 'grid-outline'}
          label="view"
          onPress={() => update({ libraryView: isGrid ? 'list' : 'grid' })}
        />
        <IconButton icon="options-outline" label={t('library.filters')} onPress={() => setFilterSheet(true)} />
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={t('library.searchPlaceholder')} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('common.all')} active={!filters.status} onPress={() => setFilters((f) => ({ ...f, status: '' }))} />
        {STATUSES.map((s) => (
          <Chip
            key={s}
            label={t(`status.${s}`)}
            active={filters.status === s}
            onPress={() => setFilters((f) => ({ ...f, status: f.status === s ? '' : s }))}
          />
        ))}
      </ScrollView>

      {activeRefFilters.length ? (
        <View style={styles.activeFilters}>
          {activeRefFilters.map((k) => (
            <Chip key={k} label={labelFor(k)} active icon="close" onPress={() => setFilters((f) => ({ ...f, [k]: undefined }))} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <FlatList
        key={isGrid ? `grid-${columns}` : 'list'}
        data={books}
        numColumns={isGrid ? columns : 1}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 120, gap: isGrid ? space.lg : space.sm }}
        columnWrapperStyle={isGrid ? { gap: space.md } : undefined}
        ListHeaderComponent={header}
        renderItem={({ item }) => (isGrid ? <BookTile book={item} width={tileWidth} /> : <BookRow book={item} />)}
        onEndReachedThreshold={0.4}
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          query.isLoading ? (
            <Loading />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState icon="library-outline" message={t('library.empty')} />
          )
        }
        ListFooterComponent={query.isFetchingNextPage ? <Loading /> : undefined}
      />

      <Sheet visible={filterSheet} onClose={() => setFilterSheet(false)} title={t('library.filters')}>
        {(Object.keys(refLabels) as RefFilter[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setFilterSheet(false);
              setPicker(k);
            }}
            style={[styles.filterRow, { borderColor: colors.border }]}
          >
            <Txt weight="500" style={{ flex: 1 }}>
              {refLabels[k]}
            </Txt>
            <Txt muted numberOfLines={1} style={{ maxWidth: '55%' }}>
              {filters[k] ? labelFor(k) : t('common.all')}
            </Txt>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        ))}
        <Button
          label={t('library.clear')}
          variant="ghost"
          style={{ marginTop: space.md }}
          onPress={() => {
            setFilters({ status: '' });
            setFilterSheet(false);
          }}
        />
      </Sheet>

      {picker ? (
        <PickerSheet
          visible
          title={refLabels[picker]}
          options={refOptions[picker]}
          selected={filters[picker] ? [filters[picker] as string] : []}
          onChange={(ids) => setFilters((f) => ({ ...f, [picker]: ids[0] }))}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm, marginBottom: space.lg },
  chips: { gap: space.sm, paddingVertical: space.md },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
