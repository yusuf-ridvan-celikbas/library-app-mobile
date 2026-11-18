import type { Book, BorrowedBook, Loan, LoanStatus, RemindersResponse, WishlistItem } from '@/api/types';

import { getDb, LocalError, nowIso, todayYmd, ulid } from '../index';
import { saveBook } from './books';
import { findOrCreateByName } from './reference';

/*
 * Emanetler (Loan), hatırlatmalar, ödünç aldıklarım ve alınacaklar.
 * İş kuralları backend'deki CreateLoanAction / ReturnLoanAction /
 * ReminderController / ConvertToLibraryAction ile aynıdır.
 */

const LOAN_LABELS: Record<LoanStatus, string> = { active: 'Aktif', returned: 'İade Edildi', overdue: 'Gecikmiş', lost: 'Kayıp' };

// ------------------------------------------------------------------ Emanet

export async function listLoans(): Promise<Loan[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string; status: LoanStatus; loaned_at: string; due_at: string | null; returned_at: string | null; notes: string | null;
    created_at: string; book_id: string; title: string | null; borrower_id: string; borrower_name: string | null;
  }>(
    `SELECT l.*, b.title, br.name AS borrower_name FROM loans l
     LEFT JOIN books b ON b.id = l.book_id LEFT JOIN borrowers br ON br.id = l.borrower_id
     ORDER BY l.loaned_at DESC`,
  );
  const today = todayYmd();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    status_label: LOAN_LABELS[r.status],
    loaned_at: r.loaned_at,
    due_at: r.due_at,
    returned_at: r.returned_at,
    is_overdue: r.status === 'active' && !!r.due_at && r.due_at < today,
    notes: r.notes,
    book: r.title !== null ? { id: r.book_id, title: r.title } : null,
    borrower: { id: r.borrower_id, name: r.borrower_name ?? 'Silinmiş kişi' },
    created_at: r.created_at,
  }));
}

/** Ödünç ver: Loan oluştur + kitabı "Ödünçte" yap (tek transaction; aynı kitap iki kez aktif ödünçte olamaz). */
export async function lendBook(payload: { book_id: string; borrower_id: string; due_at?: string | null }): Promise<void> {
  const db = await getDb();
  const loanedAt = todayYmd();
  if (payload.due_at && payload.due_at < loanedAt) {
    throw new LocalError('VALIDATION_FAILED', 'Son tarih bugünden önce olamaz.', { field: 'due_at' });
  }
  const active = await db.getFirstAsync("SELECT id FROM loans WHERE book_id = ? AND status = 'active'", payload.book_id);
  if (active) throw new LocalError('BOOK_ALREADY_LOANED', 'Bu kitap zaten şu anda ödünçte.');
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "INSERT INTO loans (id, book_id, borrower_id, status, loaned_at, due_at, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
      ulid(),
      payload.book_id,
      payload.borrower_id,
      loanedAt,
      payload.due_at ?? null,
      nowIso(),
    );
    await db.runAsync("UPDATE books SET status = 'loaned', updated_at = ? WHERE id = ?", nowIso(), payload.book_id);
  });
}

export async function returnLoan(loanId: string): Promise<void> {
  const db = await getDb();
  const loan = await db.getFirstAsync<{ book_id: string; status: string }>('SELECT book_id, status FROM loans WHERE id = ?', loanId);
  if (!loan || loan.status !== 'active') throw new LocalError('LOAN_NOT_ACTIVE', 'Bu emanet zaten kapatılmış.');
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE loans SET status = 'returned', returned_at = ? WHERE id = ?", todayYmd(), loanId);
    await db.runAsync("UPDATE books SET status = 'available', updated_at = ? WHERE id = ?", nowIso(), loan.book_id);
  });
}

// ------------------------------------------------------------- Hatırlatmalar

const UPCOMING_WITHIN_DAYS = 3;

export async function computeReminders(): Promise<RemindersResponse> {
  const db = await getDb();
  const today = todayYmd();
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + UPCOMING_WITHIN_DAYS);
  const threshold = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;

  const loans = await db.getAllAsync<{ id: string; title: string | null; name: string | null; due_at: string }>(
    `SELECT l.id, b.title, br.name, l.due_at FROM loans l LEFT JOIN books b ON b.id = l.book_id LEFT JOIN borrowers br ON br.id = l.borrower_id
     WHERE l.status = 'active' AND l.due_at IS NOT NULL AND l.due_at <= ?`,
    threshold,
  );
  const borrowed = await db.getAllAsync<{ id: string; title: string; name: string | null; due_at: string }>(
    `SELECT bb.id, bb.title, br.name, bb.due_at FROM borrowed_books bb LEFT JOIN borrowers br ON br.id = bb.borrower_id
     WHERE bb.returned_at IS NULL AND bb.due_at IS NOT NULL AND bb.due_at <= ?`,
    threshold,
  );
  const diff = (due: string) => Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);

  const items = [
    ...loans.map((l) => ({ type: 'loan' as const, record_id: l.id, title: l.title ?? 'Silinmiş kitap', person_name: l.name ?? 'Silinmiş kişi', due_at: l.due_at })),
    ...borrowed.map((b) => ({ type: 'borrowed' as const, record_id: b.id, title: b.title, person_name: b.name ?? 'Silinmiş kişi', due_at: b.due_at })),
  ]
    .map((i) => ({ ...i, days_diff: diff(i.due_at), is_overdue: i.due_at < today }))
    .sort((a, b) => a.due_at.localeCompare(b.due_at));

  return {
    items,
    overdue_count: items.filter((i) => i.is_overdue).length,
    upcoming_count: items.filter((i) => !i.is_overdue).length,
  };
}

// --------------------------------------------------------- Ödünç aldıklarım

export async function listBorrowed(): Promise<BorrowedBook[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BorrowedBook & { borrower_id: string; borrower_name: string | null }>(
    `SELECT bb.*, br.name AS borrower_name FROM borrowed_books bb LEFT JOIN borrowers br ON br.id = bb.borrower_id ORDER BY bb.borrowed_at DESC`,
  );
  return rows.map(({ borrower_id, borrower_name, ...r }) => ({
    ...r,
    borrower: { id: borrower_id, name: borrower_name ?? 'Silinmiş kişi' },
    is_returned: r.returned_at !== null,
  }));
}

export async function saveBorrowed(id: string | undefined, p: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  const title = typeof p.title === 'string' ? p.title.trim() : '';
  if (!title) throw new LocalError('VALIDATION_FAILED', 'Başlık gerekli.', { field: 'title' });
  if (!p.borrower_id) throw new LocalError('VALIDATION_FAILED', 'Kişi seçin.', { field: 'borrower_id' });
  const values = [
    title,
    p.author_name ?? null,
    p.page_count ?? null,
    p.borrower_id,
    p.borrowed_at ?? todayYmd(),
    p.due_at ?? null,
    p.notes ?? null,
    p.reading_status ?? 'not_started',
    p.started_at ?? null,
    p.finished_at ?? null,
    p.rating ?? null,
    p.reading_notes ?? null,
  ] as (string | number | null)[];
  if (id) {
    await db.runAsync(
      `UPDATE borrowed_books SET title = ?, author_name = ?, page_count = ?, borrower_id = ?, borrowed_at = ?, due_at = ?, notes = ?,
       reading_status = ?, started_at = ?, finished_at = ?, rating = ?, reading_notes = ? WHERE id = ?`,
      ...values,
      id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO borrowed_books (title, author_name, page_count, borrower_id, borrowed_at, due_at, notes, reading_status, started_at,
       finished_at, rating, reading_notes, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...values,
      ulid(),
      nowIso(),
    );
  }
}

export async function returnBorrowed(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE borrowed_books SET returned_at = ? WHERE id = ? AND returned_at IS NULL', todayYmd(), id);
}

export async function deleteBorrowed(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM borrowed_books WHERE id = ?', id);
}

// ---------------------------------------------------------------- Alınacaklar

export async function listWishlist(): Promise<WishlistItem[]> {
  const db = await getDb();
  return db.getAllAsync<WishlistItem>('SELECT * FROM wishlist_items ORDER BY created_at DESC');
}

export async function saveWishlistItem(id: string | undefined, p: Partial<WishlistItem>): Promise<void> {
  const db = await getDb();
  const title = p.title?.trim();
  if (!title) throw new LocalError('VALIDATION_FAILED', 'Başlık gerekli.', { field: 'title' });
  if (id) {
    await db.runAsync('UPDATE wishlist_items SET title = ?, author_name = ?, isbn = ?, notes = ? WHERE id = ?', title, p.author_name ?? null, p.isbn ?? null, p.notes ?? null, id);
  } else {
    await db.runAsync(
      'INSERT INTO wishlist_items (id, title, author_name, isbn, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ulid(),
      title,
      p.author_name ?? null,
      p.isbn ?? null,
      p.notes ?? null,
      nowIso(),
    );
  }
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM wishlist_items WHERE id = ?', id);
}

/** "Aldım": öğeyi gerçek bir kitaba dönüştür, yazarı varsa yeniden kullan, öğeyi sil. */
export async function convertWishlistItem(id: string): Promise<Book> {
  const db = await getDb();
  const item = await db.getFirstAsync<WishlistItem>('SELECT * FROM wishlist_items WHERE id = ?', id);
  if (!item) throw new LocalError('NOT_FOUND', 'Kayıt bulunamadı.');
  const digits = (item.isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
  const authorIds = item.author_name ? [await findOrCreateByName('authors', item.author_name)] : [];
  const book = await saveBook(undefined, {
    title: item.title,
    status: 'available',
    author_ids: authorIds,
    isbn13: digits.length === 13 ? digits : null,
    isbn10: digits.length === 10 ? digits : null,
  });
  await db.runAsync('DELETE FROM wishlist_items WHERE id = ?', id);
  return book;
}

// ------------------------------------------- Kendi kitabını ödünce dönüştür

/**
 * Yanlışlıkla "kendi kitabım" olarak eklenmiş, aslında ödünç alınmış
 * (ör. kütüphaneden) bir kitabı Ödünç Aldıklarım'a taşır. Okuma bilgileri
 * (tarihler, puan, not), hedef bağlantıları ve süre kayıtları korunur;
 * kitabın kendi okuma kayıtları silinir ki istatistiklerde İKİ KEZ sayılmasın.
 */
export async function convertBookToBorrowed(bookId: string, borrowerId: string, dueAt: string | null): Promise<string> {
  const db = await getDb();
  const book = await db.getFirstAsync<{ title: string; page_count: number | null }>('SELECT title, page_count FROM books WHERE id = ? AND deleted_at IS NULL', bookId);
  if (!book) throw new LocalError('NOT_FOUND', 'Kitap bulunamadı.');
  const activeLoan = await db.getFirstAsync("SELECT id FROM loans WHERE book_id = ? AND status = 'active'", bookId);
  if (activeLoan) throw new LocalError('BOOK_ALREADY_LOANED', 'Bu kitap şu anda birine ödünç verilmiş; önce iade alın.');

  const authors = await db.getAllAsync<{ name: string }>(
    'SELECT a.name FROM book_author ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = ? ORDER BY ba.sort_order',
    bookId,
  );
  const sessions = await db.getAllAsync<{ id: string; status: string; started_at: string | null; finished_at: string | null; rating: number | null; notes: string | null }>(
    'SELECT id, status, started_at, finished_at, rating, notes FROM reading_sessions WHERE book_id = ? ORDER BY COALESCE(finished_at, started_at, created_at) DESC',
    bookId,
  );
  const finished = sessions.find((s) => s.status === 'finished');
  const reading = sessions.find((s) => s.status === 'in_progress');
  const source = finished ?? reading;
  const id = ulid();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO borrowed_books (id, title, author_name, page_count, borrower_id, borrowed_at, due_at, reading_status, started_at, finished_at,
       rating, reading_notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      book.title,
      authors.map((a) => a.name).join(', ') || null,
      book.page_count,
      borrowerId,
      source?.started_at ?? todayYmd(),
      dueAt,
      finished ? 'finished' : reading ? 'reading' : 'not_started',
      source?.started_at ?? null,
      finished?.finished_at ?? null,
      finished?.rating ?? null,
      source?.notes ?? null,
      nowIso(),
    );
    // Süre kayıtları ve hedef listeleri yeni ödünç kaydına bağlanır.
    for (const s of sessions) {
      await db.runAsync('UPDATE reading_time_logs SET borrowed_book_id = ?, reading_session_id = NULL WHERE reading_session_id = ?', id, s.id);
    }
    await db.runAsync('UPDATE reading_goal_books SET borrowed_book_id = ?, book_id = NULL WHERE book_id = ?', id, bookId);
    await db.runAsync('DELETE FROM reading_sessions WHERE book_id = ?', bookId);
    await db.runAsync('UPDATE books SET deleted_at = ?, isbn10 = NULL, isbn13 = NULL WHERE id = ?', nowIso(), bookId);
  });
  return id;
}
