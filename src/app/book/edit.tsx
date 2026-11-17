import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  useAuthors,
  useBook,
  useCreateReference,
  useLocations,
  usePublishers,
  useSaveBook,
  useTags,
  type BookPayload,
} from '@/api/hooks';
import type { Author, BookStatus, Publisher, Tag } from '@/api/types';
import { PickerSheet, type PickerOption } from '@/components/Picker';
import { LocalError } from '@/db';
import { Button, Chip, Field, Loading, SelectBox, Txt } from '@/components/ui';
import { isValidDate } from '@/lib/dates';
import { useTheme } from '@/theme/SettingsProvider';
import { space } from '@/theme/tokens';

type Form = {
  title: string;
  subtitle: string;
  translator: string;
  edition: string;
  page_count: string;
  published_at: string;
  isbn: string;
  description: string;
  status: BookStatus;
  author_ids: string[];
  tag_ids: string[];
  publisher_id: string | null;
  location_id: string | null;
};

const EMPTY: Form = {
  title: '',
  subtitle: '',
  translator: '',
  edition: '',
  page_count: '',
  published_at: '',
  isbn: '',
  description: '',
  status: 'available',
  author_ids: [],
  tag_ids: [],
  publisher_id: null,
  location_id: null,
};

type PickerKind = 'authors' | 'publisher' | 'location' | 'tags';
const NEW_STATUSES: BookStatus[] = ['available', 'reading', 'read'];
const TAG_COLORS = ['#7C9A82', '#B8956A', '#8A9BB5', '#B58A8A', '#9A8AB5', '#8AB5AE'];

export default function BookEditScreen() {
  const { id, isbn } = useLocalSearchParams<{ id?: string; isbn?: string }>();
  const existing = useBook(id);

  if (id && !existing.data) return <Loading />;

  const b = existing.data;
  const initial: Form = b
    ? {
        title: b.title,
        subtitle: b.subtitle ?? '',
        translator: b.translator ?? '',
        edition: b.edition ?? '',
        page_count: b.page_count ? String(b.page_count) : '',
        published_at: b.published_at ?? '',
        isbn: b.isbn13 ?? b.isbn10 ?? '',
        description: b.description ?? '',
        status: b.status,
        author_ids: b.authors.map((a) => a.id),
        tag_ids: b.tags.map((tg) => tg.id),
        publisher_id: b.publisher?.id ?? null,
        location_id: b.location?.id ?? null,
      }
    : { ...EMPTY, isbn: isbn ?? '' };

  // Düzenleme modunda form, kitap yüklendikten SONRA mevcut değerlerle başlar.
  return <BookForm key={id ?? 'new'} id={id} initial={initial} />;
}

function BookForm({ id, initial }: { id?: string; initial: Form }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const save = useSaveBook();

  const authors = useAuthors();
  const publishers = usePublishers();
  const locations = useLocations();
  const tags = useTags();
  const createAuthor = useCreateReference<Author>('authors');
  const createPublisher = useCreateReference<Publisher>('publishers');
  const createTag = useCreateReference<Tag>('tags');

  const [form, setForm] = useState<Form>(initial);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [error, setError] = useState<LocalError | string | null>(null);


  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fieldError = (k: string) => (error instanceof LocalError && error.context?.field === k ? error.message : undefined);

  const options: Record<PickerKind, PickerOption[]> = {
    authors: (authors.data ?? []).map((a) => ({ id: a.id, label: a.name })),
    publisher: (publishers.data ?? []).map((p) => ({ id: p.id, label: p.name })),
    location: (locations.data ?? []).map((l) => ({ id: l.id, label: l.display_name })),
    tags: (tags.data ?? []).map((tg) => ({ id: tg.id, label: tg.name, color: tg.color })),
  };
  const names = (kind: PickerKind, ids: (string | null)[]) =>
    ids
      .map((i) => options[kind].find((o) => o.id === i)?.label)
      .filter(Boolean)
      .join(', ');

  async function submit() {
    if (!form.title.trim()) {
      setError(t('form.titleRequired'));
      return;
    }
    if (form.published_at && !isValidDate(form.published_at)) {
      setError(t('form.publishedAt'));
      return;
    }
    setError(null);
    const digits = form.isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    const payload: BookPayload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      translator: form.translator.trim() || null,
      edition: form.edition.trim() || null,
      page_count: form.page_count ? Number(form.page_count) : null,
      published_at: form.published_at || null,
      description: form.description.trim() || null,
      isbn13: digits.length === 13 ? digits : null,
      isbn10: digits.length === 10 ? digits : null,
      publisher_id: form.publisher_id,
      location_id: form.location_id,
      author_ids: form.author_ids,
      tag_ids: form.tag_ids,
      ...(id ? {} : { status: form.status }),
    };
    try {
      const book = await save.mutateAsync({ id, payload });
      if (id) router.back();
      else router.replace(`/book/${book.id}`);
    } catch (err) {
      setError(err instanceof LocalError ? err : t('common.genericError'));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? t('form.editBook') : t('form.newBook') }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Field label={t('form.title')} value={form.title} onChangeText={set('title')} error={fieldError('title')} autoFocus={!id} />
        <SelectBox label={t('form.authors')} value={names('authors', form.author_ids)} placeholder={t('form.select')} onPress={() => setPicker('authors')} />
        <SelectBox label={t('form.location')} value={names('location', [form.location_id])} placeholder={t('form.select')} onPress={() => setPicker('location')} />
        <SelectBox label={t('form.tags')} value={names('tags', form.tag_ids)} placeholder={t('form.select')} onPress={() => setPicker('tags')} />

        {!id ? (
          <View style={{ marginBottom: space.md }}>
            <Txt size="small" muted weight="500" style={{ marginBottom: space.xs }}>
              {t('form.status')}
            </Txt>
            <View style={styles.row}>
              {NEW_STATUSES.map((s) => (
                <Chip key={s} label={t(`status.${s}`)} active={form.status === s} onPress={() => set('status')(s)} />
              ))}
            </View>
          </View>
        ) : null}

        <Txt size="heading" serif weight="600" style={{ marginVertical: space.md }}>
          {t('book.details')}
        </Txt>
        <SelectBox label={t('form.publisher')} value={names('publisher', [form.publisher_id])} placeholder={t('form.select')} onPress={() => setPicker('publisher')} />
        <Field label={t('form.subtitle')} value={form.subtitle} onChangeText={set('subtitle')} />
        <Field label={t('form.translator')} value={form.translator} onChangeText={set('translator')} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t('form.edition')} value={form.edition} onChangeText={set('edition')} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t('form.pageCount')}
              value={form.page_count}
              onChangeText={(v) => set('page_count')(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              error={fieldError('page_count')}
            />
          </View>
        </View>
        <Field label={t('form.publishedAt')} value={form.published_at} onChangeText={set('published_at')} placeholder="2024-03-01" error={fieldError('published_at')} />
        <Field label={t('form.isbn')} value={form.isbn} onChangeText={set('isbn')} keyboardType="number-pad" error={fieldError('isbn13') ?? fieldError('isbn10')} />
        <Field label={t('form.description')} value={form.description} onChangeText={set('description')} multiline />

        {error ? (
          <Txt size="small" color={colors.danger} style={{ marginBottom: space.md }}>
            {typeof error === 'string' ? error : error.message}
          </Txt>
        ) : null}
        <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      </ScrollView>

      <PickerSheet
        visible={picker === 'authors'}
        onClose={() => setPicker(null)}
        title={t('form.authors')}
        multiple
        options={options.authors}
        selected={form.author_ids}
        onChange={set('author_ids')}
        onCreate={async (name) => (await createAuthor.mutateAsync({ name })).id}
      />
      <PickerSheet
        visible={picker === 'publisher'}
        onClose={() => setPicker(null)}
        title={t('form.publisher')}
        options={options.publisher}
        selected={form.publisher_id ? [form.publisher_id] : []}
        onChange={(ids) => set('publisher_id')(ids[0] ?? null)}
        onCreate={async (name) => (await createPublisher.mutateAsync({ name })).id}
      />
      <PickerSheet
        visible={picker === 'location'}
        onClose={() => setPicker(null)}
        title={t('form.location')}
        options={options.location}
        selected={form.location_id ? [form.location_id] : []}
        onChange={(ids) => set('location_id')(ids[0] ?? null)}
      />
      <PickerSheet
        visible={picker === 'tags'}
        onClose={() => setPicker(null)}
        title={t('form.tags')}
        multiple
        options={options.tags}
        selected={form.tag_ids}
        onChange={set('tag_ids')}
        onCreate={async (name) =>
          (await createTag.mutateAsync({ name, color: TAG_COLORS[(tags.data?.length ?? 0) % TAG_COLORS.length] })).id
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
