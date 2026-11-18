import type { Book } from '@/api/types';
import { LocalError } from '@/db';
import { findBookIdByIsbn, saveBook } from '@/db/repo/books';
import { findOrCreateByName } from '@/db/repo/reference';

/**
 * ISBN taraması artık sunucusuz: telefon doğrudan Open Library'ye,
 * bulamazsa Google Books'a sorar (backend'deki fallback_chain ile aynı
 * sıra ve alanlar). İnternet gerekir, PC gerekmez.
 */
export type LookupResult = {
  title: string;
  subtitle: string | null;
  description: string | null;
  authorNames: string[];
  publisherName: string | null;
  publishedAt: string | null;
  pageCount: number | null;
  language: string | null;
  coverImageUrl: string | null;
  isbn10: string | null;
  isbn13: string | null;
};

const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    return { status: res.status, data: res.ok ? await res.json() : null };
  } finally {
    clearTimeout(timer);
  }
}

async function openLibrary(isbn: string): Promise<LookupResult | null> {
  const { status, data } = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
  if (status === 404 || !data) return null;
  const authorNames: string[] = [];
  for (const ref of (data.authors ?? []).slice(0, 5)) {
    if (!ref?.key) continue;
    try {
      const author = await getJson(`https://openlibrary.org${ref.key}.json`);
      if (author.data?.name) authorNames.push(author.data.name);
    } catch {
      // yazar adı alınamazsa atla
    }
  }
  const description = typeof data.description === 'object' ? data.description?.value : data.description;
  return {
    title: data.title ?? 'Bilinmeyen Başlık',
    subtitle: data.subtitle ?? null,
    description: description ?? null,
    authorNames,
    publisherName: data.publishers?.[0] ?? null,
    publishedAt: data.publish_date ?? null,
    pageCount: data.number_of_pages ?? null,
    language: null,
    coverImageUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
    isbn10: data.isbn_10?.[0] ?? null,
    isbn13: data.isbn_13?.[0] ?? (isbn.length === 13 ? isbn : null),
  };
}

async function googleBooks(isbn: string): Promise<LookupResult | null> {
  const { data } = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const info = data?.items?.[0]?.volumeInfo;
  if (!info) return null;
  const ids: { type: string; identifier: string }[] = info.industryIdentifiers ?? [];
  return {
    title: info.title ?? 'Bilinmeyen Başlık',
    subtitle: info.subtitle ?? null,
    description: info.description ?? null,
    authorNames: info.authors ?? [],
    publisherName: info.publisher ?? null,
    publishedAt: info.publishedDate ?? null,
    pageCount: info.pageCount ?? null,
    language: info.language ?? null,
    coverImageUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
    isbn10: ids.find((i) => i.type === 'ISBN_10')?.identifier ?? null,
    isbn13: ids.find((i) => i.type === 'ISBN_13')?.identifier ?? (isbn.length === 13 ? isbn : null),
  };
}

/** "2019", "2019-04", "April 2019", "2019-04-01" → YYYY-MM-DD (anlaşılamazsa null). */
function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const year = value.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];
    return year ? `${year}-01-01` : null;
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function normalizeIsbn(rawIsbn: string): string {
  const isbn = rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (isbn.length !== 10 && isbn.length !== 13) {
    throw new LocalError('VALIDATION_FAILED', 'Geçersiz ISBN.', { field: 'isbn' });
  }
  return isbn;
}

/**
 * Sadece bilgiyi getirir, kitap OLUŞTURMAZ — ödünç alınan (ör. kütüphane)
 * kitapların başlık/yazar/sayfa bilgisini doldurmak için.
 */
export async function lookupIsbn(rawIsbn: string): Promise<LookupResult> {
  const isbn = normalizeIsbn(rawIsbn);
  let result: LookupResult | null = null;
  let reachedAny = false;
  for (const provider of [openLibrary, googleBooks]) {
    try {
      result = await provider(isbn);
      reachedAny = true;
      if (result) break;
    } catch {
      // bağlantı hatası → sıradaki sağlayıcı
    }
  }
  if (!result) {
    throw reachedAny
      ? new LocalError('ISBN_NOT_FOUND', 'Bu ISBN için bilgi bulunamadı.')
      : new LocalError('NETWORK_ERROR', 'İnternet bağlantısı yok.');
  }
  return result;
}

export async function lookupAndCreateBook(rawIsbn: string): Promise<Book> {
  const isbn = normalizeIsbn(rawIsbn);
  const existing = await findBookIdByIsbn(isbn);
  if (existing) {
    throw new LocalError('BOOK_ALREADY_EXISTS', 'Bu ISBN numarasına sahip bir kitap zaten kütüphanenizde kayıtlı.', { book_id: existing });
  }

  const result = await lookupIsbn(isbn);

  const authorIds: string[] = [];
  for (const name of result.authorNames) {
    if (name.trim()) authorIds.push(await findOrCreateByName('authors', name.trim()));
  }
  const publisherId = result.publisherName?.trim() ? await findOrCreateByName('publishers', result.publisherName.trim()) : null;

  // Sağlayıcının döndürdüğü ISBN'ler zaten başka kitapta varsa çakışmasın.
  const isbn13 = result.isbn13 && !(await findBookIdByIsbn(result.isbn13)) ? result.isbn13 : isbn.length === 13 ? isbn : null;
  const isbn10 = result.isbn10 && !(await findBookIdByIsbn(result.isbn10)) ? result.isbn10 : isbn.length === 10 ? isbn : null;

  return saveBook(undefined, {
    title: result.title,
    subtitle: result.subtitle,
    description: result.description,
    status: 'available',
    page_count: result.pageCount && result.pageCount > 0 ? result.pageCount : null,
    published_at: normalizeDate(result.publishedAt),
    language: result.language,
    cover_image_source_url: result.coverImageUrl,
    isbn13,
    isbn10,
    publisher_id: publisherId,
    author_ids: authorIds,
  });
}
