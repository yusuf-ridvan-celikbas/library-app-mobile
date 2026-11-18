import type { SessionPayload } from '@/api/hooks';
import type { GoalBook, GoalPeriod, ReadingGoal, ReadingSession, ReadingStats, ReadingStatus } from '@/api/types';

import { getDb, LocalError, nowIso, placeholders, todayYmd, ulid } from '../index';

/*
 * Okuma kayıtları, hedefler, istatistikler ve kütüphane özeti.
 * Hesaplamalar backend'deki ReadingGoalProgressCalculator,
 * ReadingStatsCalculator ve LibraryOverviewCalculator'ın birebir
 * TypeScript karşılığıdır (aynı alan adları, aynı yuvarlamalar).
 */

const READING_LABELS: Record<ReadingStatus, string> = {
  planned: 'Planlandı',
  in_progress: 'Okunuyor',
  finished: 'Okundu',
  abandoned: 'Yarım Bırakıldı',
};

const DAY = 86_400_000;
const parse = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00`);
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------ Okuma kayıtları

type SessionRow = {
  id: string;
  book_id: string;
  status: ReadingStatus;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  created_at: string;
  title: string | null;
  page_count: number | null;
  total_minutes: number | null;
};

export async function listSessions(params: { book_id?: string; status?: ReadingStatus }): Promise<ReadingSession[]> {
  const db = await getDb();
  const where: string[] = ['1 = 1'];
  const values: string[] = [];
  if (params.book_id) {
    where.push('s.book_id = ?');
    values.push(params.book_id);
  }
  if (params.status) {
    where.push('s.status = ?');
    values.push(params.status);
  }
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT s.*, b.title, b.page_count,
            (SELECT SUM(duration_minutes) FROM reading_time_logs t WHERE t.reading_session_id = s.id) AS total_minutes
     FROM reading_sessions s LEFT JOIN books b ON b.id = s.book_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(s.started_at, s.created_at) DESC`,
    ...values,
  );
  return rows.map((r) => {
    const minutes = r.total_minutes ?? 0;
    const pace =
      r.status === 'finished' && minutes > 0 && r.page_count
        ? { hours_to_read: round1(minutes / 60), pages_per_hour: round1(r.page_count / (minutes / 60)), pages_per_minute: round2(r.page_count / minutes) }
        : null;
    return {
      id: r.id,
      status: r.status,
      status_label: READING_LABELS[r.status],
      started_at: r.started_at,
      finished_at: r.finished_at,
      rating: r.rating,
      notes: r.notes,
      book: r.title !== null ? { id: r.book_id, title: r.title, page_count: r.page_count } : null,
      total_minutes: minutes,
      pace,
      created_at: r.created_at,
    };
  });
}

/** Kaydet + "Okundu" olunca kitabı da Okundu yap (backend'deki syncBookStatus). */
export async function saveSession(id: string | undefined, bookId: string, payload: SessionPayload): Promise<void> {
  const db = await getDb();
  if (payload.started_at && payload.finished_at && payload.finished_at < payload.started_at) {
    throw new LocalError('VALIDATION_FAILED', 'Bitiş tarihi başlangıçtan önce olamaz.', { field: 'finished_at' });
  }
  await db.withTransactionAsync(async () => {
    if (id) {
      await db.runAsync(
        'UPDATE reading_sessions SET status = ?, started_at = ?, finished_at = ?, rating = ?, notes = ? WHERE id = ?',
        payload.status,
        payload.started_at ?? null,
        payload.finished_at ?? null,
        payload.rating ?? null,
        payload.notes ?? null,
        id,
      );
    } else {
      await db.runAsync(
        'INSERT INTO reading_sessions (id, book_id, status, started_at, finished_at, rating, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ulid(),
        bookId,
        payload.status,
        payload.started_at ?? null,
        payload.finished_at ?? null,
        payload.rating ?? null,
        payload.notes ?? null,
        nowIso(),
      );
    }
    await syncBookStatus(bookId);
  });
}

/** Okuma kaydını siler ve kitabın durumunu kalan kayıtlara göre yeniden hesaplar. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ book_id: string }>('SELECT book_id FROM reading_sessions WHERE id = ?', id);
  if (!row) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM reading_sessions WHERE id = ?', id);
    await syncBookStatus(row.book_id);
  });
}

/**
 * Kitabın durumunu okuma geçmişine göre düzeltir: bitmiş bir kayıt varsa
 * "Okundu", devam eden varsa "Okunuyor", hiçbiri yoksa "Rafta".
 * Ödünçte / hediye / kayıp / arşiv durumlarına dokunulmaz — onlar okuma
 * geçmişinden bağımsız, elle verilmiş durumlardır.
 */
async function syncBookStatus(bookId: string): Promise<void> {
  const db = await getDb();
  const flags = await db.getFirstAsync<{ finished: number; reading: number }>(
    `SELECT EXISTS (SELECT 1 FROM reading_sessions WHERE book_id = ? AND status = 'finished') AS finished,
            EXISTS (SELECT 1 FROM reading_sessions WHERE book_id = ? AND status = 'in_progress') AS reading`,
    bookId,
    bookId,
  );
  const next = flags?.finished ? 'read' : flags?.reading ? 'reading' : 'available';
  await db.runAsync(
    "UPDATE books SET status = ?, updated_at = ? WHERE id = ? AND status IN ('available', 'reading', 'read') AND status != ?",
    next,
    nowIso(),
    bookId,
    next,
  );
}

// ------------------------------------------------------------------ Hedefler

function periodBounds(period: GoalPeriod): [string, string] {
  const now = new Date();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (period === 'yearly') return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
  if (period === 'monthly') {
    return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  }
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // hafta Pazartesi başlar (Carbon varsayılanı)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [ymd(monday), ymd(sunday)];
}

const PERIOD_LABELS: Record<GoalPeriod, string> = { weekly: 'Haftalık', monthly: 'Aylık', yearly: 'Yıllık' };

type GoalRow = { id: string; period_type: GoalPeriod; period_start: string; period_end: string; target_books: number; created_at: string };

function dayBreakdown(goal: GoalRow): [number, number, number] {
  const total = daysBetween(goal.period_start, goal.period_end) + 1;
  const elapsed = Math.max(0, Math.min(total, daysBetween(goal.period_start, todayYmd()) + 1));
  return [total, elapsed, Math.max(1, total - elapsed)];
}

async function averagePagesPerBook(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ avg: number | null }>(
    `SELECT AVG(page_count) AS avg FROM (
       SELECT b.page_count FROM reading_sessions s JOIN books b ON b.id = s.book_id WHERE s.status = 'finished' AND b.page_count IS NOT NULL
       UNION ALL
       SELECT page_count FROM borrowed_books WHERE reading_status = 'finished' AND page_count IS NOT NULL)`,
  );
  return row?.avg ?? 250;
}

async function computeGoal(goal: GoalRow): Promise<ReadingGoal> {
  const db = await getDb();
  const items = await db.getAllAsync<{ id: string; book_id: string | null; borrowed_book_id: string | null; title: string | null; page_count: number | null }>(
    `SELECT gi.id, gi.book_id, gi.borrowed_book_id,
            COALESCE(b.title, bb.title) AS title, COALESCE(b.page_count, bb.page_count) AS page_count
     FROM reading_goal_books gi
     LEFT JOIN books b ON b.id = gi.book_id
     LEFT JOIN borrowed_books bb ON bb.id = gi.borrowed_book_id
     WHERE gi.goal_id = ? ORDER BY gi.sort_order`,
    goal.id,
  );
  const [total, elapsed, remainingDays] = dayBreakdown(goal);
  const range = [goal.period_start, goal.period_end];

  let completed: number;
  let target: number;
  let suggested: number;
  let finishedBookIds = new Set<string>();
  let finishedBorrowedIds = new Set<string>();

  if (items.length) {
    const bookIds = items.map((i) => i.book_id).filter((x): x is string => !!x);
    const borrowedIds = items.map((i) => i.borrowed_book_id).filter((x): x is string => !!x);
    if (bookIds.length) {
      const rows = await db.getAllAsync<{ book_id: string }>(
        `SELECT DISTINCT book_id FROM reading_sessions WHERE status = 'finished' AND finished_at BETWEEN ? AND ? AND book_id IN (${placeholders(bookIds.length)})`,
        ...range,
        ...bookIds,
      );
      finishedBookIds = new Set(rows.map((r) => r.book_id));
    }
    if (borrowedIds.length) {
      const rows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM borrowed_books WHERE reading_status = 'finished' AND finished_at BETWEEN ? AND ? AND id IN (${placeholders(borrowedIds.length)})`,
        ...range,
        ...borrowedIds,
      );
      finishedBorrowedIds = new Set(rows.map((r) => r.id));
    }
    completed = finishedBookIds.size + finishedBorrowedIds.size;
    target = items.length;
    const remainingPages = items
      .filter((i) => !(i.book_id && finishedBookIds.has(i.book_id)) && !(i.borrowed_book_id && finishedBorrowedIds.has(i.borrowed_book_id)))
      .reduce((sum, i) => sum + (i.page_count ?? 0), 0);
    suggested = remainingPages > 0 ? Math.ceil(remainingPages / remainingDays) : 0;
  } else {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM reading_sessions WHERE status = 'finished' AND finished_at BETWEEN ? AND ?)
            + (SELECT COUNT(*) FROM borrowed_books WHERE reading_status = 'finished' AND finished_at BETWEEN ? AND ?) AS n`,
      ...range,
      ...range,
    );
    completed = row?.n ?? 0;
    target = goal.target_books;
    const remainingBooks = Math.max(0, target - completed);
    suggested = remainingBooks > 0 ? Math.ceil((remainingBooks * (await averagePagesPerBook())) / remainingDays) : 0;
  }

  const expectedByNow = total > 0 ? target * (elapsed / total) : 0;
  const books: GoalBook[] = items.map((i) => ({
    item_id: i.id,
    source: i.book_id ? 'book' : 'borrowed',
    target_id: (i.book_id ?? i.borrowed_book_id)!,
    title: i.title ?? 'Silinmiş kayıt',
    page_count: i.page_count,
    is_finished: i.book_id ? finishedBookIds.has(i.book_id) : finishedBorrowedIds.has(i.borrowed_book_id!),
  }));

  return {
    id: goal.id,
    period_type: goal.period_type,
    period_type_label: PERIOD_LABELS[goal.period_type],
    period_start: goal.period_start,
    period_end: goal.period_end,
    target_books: target,
    completed_books: completed,
    remaining_books: Math.max(0, target - completed),
    percent_complete: target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0,
    days_remaining: remainingDays,
    suggested_daily_pages: suggested,
    is_on_track: completed >= Math.floor(expectedByNow),
    books,
    created_at: goal.created_at,
  };
}

export async function listGoals(): Promise<ReadingGoal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>('SELECT * FROM reading_goals ORDER BY period_start DESC');
  return Promise.all(rows.map(computeGoal));
}

export async function createGoal(period: GoalPeriod, targetBooks: number): Promise<void> {
  if (!Number.isInteger(targetBooks) || targetBooks < 1 || targetBooks > 1000) {
    throw new LocalError('VALIDATION_FAILED', 'Hedef 1 ile 1000 arasında olmalı.', { field: 'target_books' });
  }
  const db = await getDb();
  const [start, end] = periodBounds(period);
  await db.runAsync(
    'INSERT INTO reading_goals (id, period_type, period_start, period_end, target_books, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ulid(),
    period,
    start,
    end,
    targetBooks,
    nowIso(),
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reading_goals WHERE id = ?', id);
}

// ------------------------------------------------------------- İstatistikler

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

type Finished = { title: string; page_count: number | null; started_at: string | null; finished_at: string | null; rating: number | null; total_minutes: number };

async function collectFinished(): Promise<Finished[]> {
  const db = await getDb();
  const own = await db.getAllAsync<Finished>(
    `SELECT COALESCE(b.title, 'Silinmiş kitap') AS title, b.page_count, s.started_at, s.finished_at, s.rating,
            COALESCE((SELECT SUM(duration_minutes) FROM reading_time_logs t WHERE t.reading_session_id = s.id), 0) AS total_minutes
     FROM reading_sessions s LEFT JOIN books b ON b.id = s.book_id WHERE s.status = 'finished'`,
  );
  const borrowed = await db.getAllAsync<Finished>(
    `SELECT title, page_count, started_at, finished_at, rating,
            COALESCE((SELECT SUM(duration_minutes) FROM reading_time_logs t WHERE t.borrowed_book_id = bb.id), 0) AS total_minutes
     FROM borrowed_books bb WHERE reading_status = 'finished'`,
  );
  return [...own, ...borrowed];
}

export async function computeStats(year?: number): Promise<ReadingStats> {
  const finished = await collectFinished();
  const today = todayYmd();
  const currentYear = Number(today.slice(0, 4));
  const selectedYear = year ?? currentYear;

  const totalPages = finished.reduce((s, i) => s + (i.page_count ?? 0), 0);
  const totalMinutes = finished.reduce((s, i) => s + i.total_minutes, 0);
  const ratings = finished.map((i) => i.rating).filter((r): r is number => !!r);
  const timed = finished.filter((i) => i.total_minutes > 0);
  const timedPages = timed.reduce((s, i) => s + (i.page_count ?? 0), 0);
  const timedMinutes = timed.reduce((s, i) => s + i.total_minutes, 0);

  const years = [...new Set([...finished.filter((i) => i.finished_at).map((i) => Number(i.finished_at!.slice(0, 4))), currentYear])].sort((a, b) => b - a);

  // Seçili yıl
  const inYear = finished.filter((i) => i.finished_at?.startsWith(String(selectedYear)));
  const yearPages = inYear.reduce((s, i) => s + (i.page_count ?? 0), 0);
  const yearStart = `${selectedYear}-01-01`;
  const effectiveEnd = today < yearStart ? null : selectedYear === currentYear ? today : `${selectedYear}-12-31`;
  const daysElapsed = effectiveEnd ? Math.max(1, daysBetween(yearStart, effectiveEnd) + 1) : 0;

  // Tempo
  const durations = finished
    .filter((i) => i.started_at && i.finished_at)
    .map((i) => ({ title: i.title, days: daysBetween(i.started_at!, i.finished_at!) + 1 }));
  const sortedDurations = [...durations].sort((a, b) => a.days - b.days);

  // Aylık dağılım
  const lastMonth = selectedYear === currentYear ? Number(today.slice(5, 7)) : 12;
  const monthly = [];
  for (let m = 1; m <= lastMonth; m++) {
    const items = inYear.filter((i) => Number(i.finished_at!.slice(5, 7)) === m);
    const pages = items.reduce((s, i) => s + (i.page_count ?? 0), 0);
    const isCurrentMonth = selectedYear === currentYear && m === lastMonth;
    const daysInMonth = isCurrentMonth ? Number(today.slice(8, 10)) : new Date(selectedYear, m, 0).getDate();
    monthly.push({ month: MONTHS_TR[m - 1], books_finished: items.length, pages_read: pages, average_daily_pages: daysInMonth > 0 ? round1(pages / daysInMonth) : 0 });
  }

  return {
    total_books_finished: finished.length,
    total_pages_read: totalPages,
    total_minutes_read: totalMinutes,
    pages_per_hour: timed.length ? round1(timedPages / (timedMinutes / 60)) : null,
    pages_per_minute: timed.length ? round2(timedPages / timedMinutes) : null,
    average_rating: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    selected_year: selectedYear,
    available_years: years,
    year_stats: {
      books_finished: inYear.length,
      pages_read: yearPages,
      average_daily_pages: daysElapsed > 0 ? round1(yearPages / daysElapsed) : 0,
      days_elapsed: daysElapsed,
      is_current_year: selectedYear === currentYear,
    },
    pace: durations.length
      ? {
          average_days_to_finish: round1(durations.reduce((s, d) => s + d.days, 0) / durations.length),
          fastest_book: sortedDurations[0],
          slowest_book: sortedDurations[sortedDurations.length - 1],
        }
      : { average_days_to_finish: null, fastest_book: null, slowest_book: null },
    monthly_breakdown: monthly,
  };
}

// --------------------------------------------------------- Kütüphane özeti

function topN(names: string[], n = 8): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const result = sorted.slice(0, n).map(([name, count]) => ({ name, count }));
  const other = sorted.slice(n).reduce((s, [, c]) => s + c, 0);
  if (other > 0) result.push({ name: 'Diğer', count: other });
  return result;
}

export async function computeOverview() {
  const db = await getDb();
  const books = await db.getAllAsync<{ id: string; title: string; page_count: number | null; publisher: string | null; is_read: number }>(
    `SELECT b.id, b.title, b.page_count, p.name AS publisher,
            EXISTS (SELECT 1 FROM reading_sessions s WHERE s.book_id = b.id AND s.status = 'finished') AS is_read
     FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id
     WHERE b.deleted_at IS NULL AND b.status != 'gifted'`,
  );
  const authors = await db.getAllAsync<{ book_id: string; name: string }>(
    `SELECT ba.book_id, a.name FROM book_author ba JOIN authors a ON a.id = ba.author_id
     JOIN books b ON b.id = ba.book_id WHERE b.deleted_at IS NULL AND b.status != 'gifted'`,
  );
  const read = books.filter((b) => b.is_read);
  const unread = books.filter((b) => !b.is_read);
  const sumPages = (list: typeof books) => list.reduce((s, b) => s + (b.page_count ?? 0), 0);
  const authorNames = books.flatMap((b) => {
    const names = authors.filter((a) => a.book_id === b.id).map((a) => a.name);
    return names.length ? names : ['Belirtilmemiş'];
  });

  return {
    total_books: books.length,
    read_books: read.length,
    unread_books: unread.length,
    total_pages: sumPages(books),
    read_pages: sumPages(read),
    unread_pages: sumPages(unread),
    publisher_distribution: topN(books.map((b) => b.publisher ?? 'Belirtilmemiş')),
    author_distribution: topN(authorNames),
  };
}
