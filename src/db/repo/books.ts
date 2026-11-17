import type { BookFilters, BookPayload } from '@/api/hooks';
import type { Book, BookStatus, PaginatedResponse } from '@/api/types';

import { fold, getDb, LocalError, nowIso, placeholders, ulid } from '../index';

const STATUS_LABELS: Record<BookStatus, string> = {
  available: 'Müsait',
  reading: 'Okunuyor',
  loaned: 'Ödünçte',
  lost: 'Kayıp',
  archived: 'Arşivlendi',
  gifted: 'Hediye Edildi',
  read: 'Okundu',
};

type BookRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: BookStatus;
  isbn10: string | null;
  isbn13: string | null;
  language: string | null;
  page_count: number | null;
  published_at: string | null;
  edition: string | null;
  translator: string | null;
  cover_image_source_url: string | null;
  publisher_id: string | null;
  publisher_name: string | null;
  location_id: string | null;
  room: string | null;
  shelf: string | null;
  position: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export function locationDisplayName(l: { room: string | null; shelf: string | null; position?: string | null; label?: string | null }): string {
  return l.label || [l.room, l.shelf, l.position].filter(Boolean).join(' / ');
}

const SELECT_BOOK = `
  SELECT b.*, p.name AS publisher_name, l.room, l.shelf, l.position, l.label
  FROM books b
  LEFT JOIN publishers p ON p.id = b.publisher_id
  LEFT JOIN locations l ON l.id = b.location_id`;

/** Satırları API'deki Book şekline (yazarlar, etiketler, hediye dahil) dönüştürür. */
async function hydrate(rows: BookRow[]): Promise<Book[]> {
  if (!rows.length) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.id);
  const ph = placeholders(ids.length);

  const authors = await db.getAllAsync<{ book_id: string; id: string; name: string }>(
    `SELECT ba.book_id, a.id, a.name FROM book_author ba JOIN authors a ON a.id = ba.author_id
     WHERE ba.book_id IN (${ph}) ORDER BY ba.sort_order`,
    ...ids,
  );
  const tags = await db.getAllAsync<{ book_id: string; id: string; name: string; slug: string; color: string }>(
    `SELECT bt.book_id, t.id, t.name, t.slug, t.color FROM book_tag bt JOIN tags t ON t.id = bt.tag_id
     WHERE bt.book_id IN (${ph}) ORDER BY t.name`,
    ...ids,
  );
  const gifts = await db.getAllAsync<{ book_id: string; id: string; gifted_at: string; notes: string | null; borrower_id: string; borrower_name: string }>(
    `SELECT g.book_id, g.id, g.gifted_at, g.notes, br.id AS borrower_id, br.name AS borrower_name
     FROM book_gifts g JOIN borrowers br ON br.id = g.borrower_id WHERE g.book_id IN (${ph})`,
    ...ids,
  );

  return rows.map((r) => {
    const gift = gifts.find((g) => g.book_id === r.id);
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      description: r.description,
      status: r.status,
      status_label: STATUS_LABELS[r.status] ?? r.status,
      isbn10: r.isbn10,
      isbn13: r.isbn13,
      language: r.language,
      page_count: r.page_count,
      published_at: r.published_at,
      edition: r.edition,
      translator: r.translator,
      cover_image_source_url: r.cover_image_source_url,
      publisher: r.publisher_id ? { id: r.publisher_id, name: r.publisher_name ?? '' } : null,
      location: r.location_id ? { id: r.location_id, display_name: locationDisplayName(r) } : null,
      authors: authors.filter((a) => a.book_id === r.id).map((a) => ({ id: a.id, name: a.name })),
      tags: tags.filter((tg) => tg.book_id === r.id).map((tg) => ({ id: tg.id, name: tg.name, slug: tg.slug, color: tg.color })),
      gift: gift
        ? { id: gift.id, borrower: { id: gift.borrower_id, name: gift.borrower_name }, gifted_at: gift.gifted_at, notes: gift.notes }
        : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function listBooks(filters: BookFilters, page: number, perPage: number): Promise<PaginatedResponse<Book>> {
  const db = await getDb();
  const where: string[] = ['b.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  if (filters.status) {
    where.push('b.status = ?');
    params.push(filters.status);
  }
  if (filters.search?.trim()) {
    where.push('b.title_fold LIKE ?');
    params.push(`%${fold(filters.search.trim())}%`);
  }
  if (filters.location_id) {
    where.push('b.location_id = ?');
    params.push(filters.location_id);
  }
  if (filters.publisher_id) {
    where.push('b.publisher_id = ?');
    params.push(filters.publisher_id);
  }
  if (filters.author_id) {
    where.push('EXISTS (SELECT 1 FROM book_author ba WHERE ba.book_id = b.id AND ba.author_id = ?)');
    params.push(filters.author_id);
  }
  if (filters.tag_id) {
    where.push('EXISTS (SELECT 1 FROM book_tag bt WHERE bt.book_id = b.id AND bt.tag_id = ?)');
    params.push(filters.tag_id);
  }

  const whereSql = where.join(' AND ');
  const total = (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM books b WHERE ${whereSql}`, ...params))?.n ?? 0;
  const rows = await db.getAllAsync<BookRow>(
    `${SELECT_BOOK} WHERE ${whereSql} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?`,
    ...params,
    perPage,
    (page - 1) * perPage,
  );
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    data: await hydrate(rows),
    links: { first: null, last: null, prev: null, next: null },
    meta: { current_page: page, last_page: lastPage, per_page: perPage, total },
  };
}

export async function getBook(id: string): Promise<Book> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>(`${SELECT_BOOK} WHERE b.id = ? AND b.deleted_at IS NULL`, id);
  if (!row) throw new LocalError('NOT_FOUND', 'Kitap bulunamadı.');
  return (await hydrate([row]))[0];
}

/** İçeride, aynı ISBN'li başka bir kitap var mı? (backend'deki unique kuralı) */
export async function findBookIdByIsbn(isbn: string, exceptId?: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM books WHERE (isbn13 = ? OR isbn10 = ?) AND deleted_at IS NULL AND id != ?',
    isbn,
    isbn,
    exceptId ?? '',
  );
  return row?.id ?? null;
}

const BOOK_FIELDS = [
  'title',
  'subtitle',
  'description',
  'status',
  'isbn10',
  'isbn13',
  'language',
  'page_count',
  'published_at',
  'edition',
  'translator',
  'cover_image_source_url',
  'publisher_id',
  'location_id',
] as const;

type SavePayload = Partial<BookPayload> & { cover_image_source_url?: string | null; language?: string | null };

/** Oluştur ya da (kısmi) güncelle — gönderilmeyen alanlara dokunulmaz (backend'deki update() davranışı). */
export async function saveBook(id: string | undefined, payload: SavePayload): Promise<Book> {
  const db = await getDb();
  for (const key of ['isbn13', 'isbn10'] as const) {
    const value = payload[key];
    if (value && (await findBookIdByIsbn(value, id))) {
      throw new LocalError('VALIDATION_FAILED', 'Bu ISBN zaten kayıtlı.', { field: key });
    }
  }
  if (payload.title !== undefined && !payload.title.trim()) {
    throw new LocalError('VALIDATION_FAILED', 'Başlık gerekli.', { field: 'title' });
  }

  const bookId = id ?? ulid();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    if (!id) {
      await db.runAsync(
        `INSERT INTO books (id, title, title_fold, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        bookId,
        payload.title!.trim(),
        fold(payload.title!.trim()),
        payload.status ?? 'available',
        now,
        now,
      );
    }
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    for (const field of BOOK_FIELDS) {
      if (field in payload) {
        sets.push(`${field} = ?`);
        values.push((payload as Record<string, string | number | null>)[field] ?? null);
      }
    }
    if (payload.title !== undefined) {
      sets.push('title_fold = ?');
      values.push(fold(payload.title));
    }
    sets.push('updated_at = ?');
    values.push(now);
    await db.runAsync(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`, ...values, bookId);

    if (payload.author_ids) {
      await db.runAsync('DELETE FROM book_author WHERE book_id = ?', bookId);
      for (const [i, authorId] of payload.author_ids.entries()) {
        await db.runAsync('INSERT INTO book_author (book_id, author_id, sort_order) VALUES (?, ?, ?)', bookId, authorId, i);
      }
    }
    if (payload.tag_ids) {
      await db.runAsync('DELETE FROM book_tag WHERE book_id = ?', bookId);
      for (const tagId of payload.tag_ids) {
        await db.runAsync('INSERT INTO book_tag (book_id, tag_id) VALUES (?, ?)', bookId, tagId);
      }
    }
  });
  return getBook(bookId);
}

/** Yumuşak silme: geçmiş okuma istatistikleri silinen kitaplarla da korunur (backend ile aynı). */
export async function deleteBook(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE books SET deleted_at = ?, isbn10 = NULL, isbn13 = NULL WHERE id = ?', nowIso(), id);
}
