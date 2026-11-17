/**
 * Telefondaki SQLite şeması — Laravel backend'deki tabloların aynısı
 * (users / tokens / audit hariç). Kimlikler backend'deki gibi metin
 * (ULID) tutulur; böylece PC'den içe aktarılan veriler kimliklerini korur.
 *
 * `*_fold` sütunları aramalar içindir: Türkçe karakter ve aksanlardan
 * arındırılmış küçük harfli kopya (bkz. fold() — db/index.ts).
 */
export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  birth_country TEXT,
  bio TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  country TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY NOT NULL,
  room TEXT NOT NULL,
  shelf TEXT NOT NULL,
  position TEXT,
  label TEXT
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#7C9A82'
);
CREATE TABLE IF NOT EXISTS borrowers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  title_fold TEXT NOT NULL DEFAULT '',
  subtitle TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  isbn10 TEXT UNIQUE,
  isbn13 TEXT UNIQUE,
  language TEXT,
  page_count INTEGER,
  published_at TEXT,
  edition TEXT,
  translator TEXT,
  cover_image_source_url TEXT,
  publisher_id TEXT REFERENCES publishers(id) ON DELETE SET NULL,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS books_status ON books(status);
CREATE INDEX IF NOT EXISTS books_title_fold ON books(title_fold);
CREATE TABLE IF NOT EXISTS book_author (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);
CREATE TABLE IF NOT EXISTS book_tag (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);
CREATE TABLE IF NOT EXISTS reading_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned',
  started_at TEXT,
  finished_at TEXT,
  rating INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_book ON reading_sessions(book_id);
CREATE TABLE IF NOT EXISTS borrowed_books (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  author_name TEXT,
  page_count INTEGER,
  borrower_id TEXT NOT NULL REFERENCES borrowers(id),
  borrowed_at TEXT NOT NULL,
  due_at TEXT,
  returned_at TEXT,
  notes TEXT,
  reading_status TEXT,
  started_at TEXT,
  finished_at TEXT,
  rating INTEGER,
  reading_notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_time_logs (
  id TEXT PRIMARY KEY NOT NULL,
  reading_session_id TEXT REFERENCES reading_sessions(id) ON DELETE CASCADE,
  borrowed_book_id TEXT REFERENCES borrowed_books(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  pages_read INTEGER,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  borrower_id TEXT NOT NULL REFERENCES borrowers(id),
  status TEXT NOT NULL DEFAULT 'active',
  loaned_at TEXT NOT NULL,
  due_at TEXT,
  returned_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS loans_book_status ON loans(book_id, status);
CREATE TABLE IF NOT EXISTS book_gifts (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
  borrower_id TEXT NOT NULL REFERENCES borrowers(id),
  gifted_at TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS reading_goals (
  id TEXT PRIMARY KEY NOT NULL,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  target_books INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_goal_books (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES reading_goals(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
  borrowed_book_id TEXT REFERENCES borrowed_books(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  author_name TEXT,
  isbn TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
`;

/** Yedek dosyası / içe aktarma sırası (yabancı anahtarlara göre). */
export const TABLES_IN_ORDER = [
  'authors',
  'publishers',
  'locations',
  'tags',
  'borrowers',
  'books',
  'book_author',
  'book_tag',
  'reading_sessions',
  'borrowed_books',
  'reading_time_logs',
  'loans',
  'book_gifts',
  'reading_goals',
  'reading_goal_books',
  'wishlist_items',
] as const;

export type TableName = (typeof TABLES_IN_ORDER)[number];
