import type { Author, Borrower, Location, Publisher, Tag } from '@/api/types';

import { getDb, LocalError, slugify, ulid } from '../index';
import { locationDisplayName } from './books';

export type ReferenceName = 'authors' | 'publishers' | 'locations' | 'tags' | 'borrowers';

export async function listReference(name: ReferenceName): Promise<unknown[]> {
  const db = await getDb();
  switch (name) {
    case 'authors':
      return db.getAllAsync<Author>('SELECT id, name, slug, birth_country, bio FROM authors WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
    case 'publishers':
      return db.getAllAsync<Publisher>('SELECT id, name, slug, country FROM publishers WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
    case 'tags':
      return db.getAllAsync<Tag>('SELECT id, name, slug, color FROM tags ORDER BY name COLLATE NOCASE');
    case 'borrowers':
      return db.getAllAsync<Borrower>('SELECT id, name, phone, email, notes, kind FROM borrowers WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
    case 'locations': {
      const rows = await db.getAllAsync<Omit<Location, 'display_name'>>('SELECT id, room, shelf, position, label FROM locations ORDER BY room, shelf');
      return rows.map((l) => ({ ...l, display_name: locationDisplayName(l) }));
    }
  }
}

/** Yazar/yayınevi/etiket adları slug'a göre tekil (backend'deki AuthorRequest/TagRequest kuralı). */
async function assertUniqueSlug(table: 'authors' | 'publishers' | 'tags', name: string, exceptId?: string) {
  const db = await getDb();
  const clash = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ${table} WHERE slug = ? AND id != ?${table === 'tags' ? '' : ' AND deleted_at IS NULL'}`,
    slugify(name),
    exceptId ?? '',
  );
  if (clash) throw new LocalError('VALIDATION_FAILED', 'Bu isimde bir kayıt zaten var.', { field: 'name' });
}

function requireText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new LocalError('VALIDATION_FAILED', 'Bu alan gerekli.', { field });
  return text;
}

export async function saveReference(name: ReferenceName, id: string | undefined, payload: Record<string, unknown>): Promise<{ id: string }> {
  const db = await getDb();
  const recordId = id ?? ulid();

  if (name === 'locations') {
    const room = requireText(payload.room, 'room');
    const shelf = requireText(payload.shelf, 'shelf');
    if (id) await db.runAsync('UPDATE locations SET room = ?, shelf = ? WHERE id = ?', room, shelf, id);
    else await db.runAsync('INSERT INTO locations (id, room, shelf) VALUES (?, ?, ?)', recordId, room, shelf);
    return { id: recordId };
  }

  const value = requireText(payload.name, 'name');
  if (name === 'borrowers') {
    const kind = payload.kind === 'library' ? 'library' : 'person';
    if (id) await db.runAsync('UPDATE borrowers SET name = ? WHERE id = ?', value, id);
    else await db.runAsync('INSERT INTO borrowers (id, name, kind) VALUES (?, ?, ?)', recordId, value, kind);
    return { id: recordId };
  }

  await assertUniqueSlug(name, value, id);
  if (name === 'tags') {
    const color = typeof payload.color === 'string' && payload.color ? payload.color : '#7C9A82';
    if (id) await db.runAsync('UPDATE tags SET name = ?, slug = ?, color = ? WHERE id = ?', value, slugify(value), color, id);
    else await db.runAsync('INSERT INTO tags (id, name, slug, color) VALUES (?, ?, ?, ?)', recordId, value, slugify(value), color);
    return { id: recordId };
  }
  if (id) {
    await db.runAsync(`UPDATE ${name} SET name = ?, slug = ? WHERE id = ?`, value, slugify(value), id);
    return { id };
  }
  // Silinmiş (gizlenmiş) aynı isimli kayıt varsa onu geri getir — slug sütunu tekil.
  const deleted = await db.getFirstAsync<{ id: string }>(`SELECT id FROM ${name} WHERE slug = ? AND deleted_at IS NOT NULL`, slugify(value));
  if (deleted) {
    await db.runAsync(`UPDATE ${name} SET name = ?, deleted_at = NULL WHERE id = ?`, value, deleted.id);
    return { id: deleted.id };
  }
  await db.runAsync(`INSERT INTO ${name} (id, name, slug) VALUES (?, ?, ?)`, recordId, value, slugify(value));
  return { id: recordId };
}

/** Yazar/yayınevi bulur ya da oluşturur (ISBN taraması ve alınacaklar dönüşümü için). */
export async function findOrCreateByName(table: 'authors' | 'publishers', name: string): Promise<string> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM ${table} WHERE slug = ? AND deleted_at IS NULL`, slugify(name));
  if (existing) return existing.id;
  return (await saveReference(table, undefined, { name })).id;
}

export async function deleteReference(name: ReferenceName, id: string): Promise<void> {
  const db = await getDb();
  if (name === 'borrowers') {
    // Kayıtlı ödünç/hediye geçmişi olan kişi silinmez, sadece gizlenir.
    const used = await db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM loans WHERE borrower_id = ? AND status = 'active')
            + (SELECT COUNT(*) FROM borrowed_books WHERE borrower_id = ? AND returned_at IS NULL) AS n`,
      id,
      id,
    );
    if (used && used.n > 0) throw new LocalError('IN_USE', 'Bu kişide hâlâ açık bir kayıt var.');
    await db.runAsync('UPDATE borrowers SET deleted_at = ? WHERE id = ?', new Date().toISOString(), id);
    return;
  }
  if (name === 'authors' || name === 'publishers') {
    await db.runAsync(`UPDATE ${name} SET deleted_at = ? WHERE id = ?`, new Date().toISOString(), id);
    if (name === 'authors') await db.runAsync('DELETE FROM book_author WHERE author_id = ?', id);
    else await db.runAsync('UPDATE books SET publisher_id = NULL WHERE publisher_id = ?', id);
    return;
  }
  await db.runAsync(`DELETE FROM ${name} WHERE id = ?`, id);
}
