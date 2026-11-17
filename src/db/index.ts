import * as SQLite from 'expo-sqlite';

import { SCHEMA_V1 } from './schema';

/**
 * Tek bir SQLite bağlantısı (uygulama ömrü boyunca açık). İlk çağrıda
 * açılır ve şema göçleri (PRAGMA user_version) uygulanır.
 */
const DB_NAME = 'eighteeneleven.db';
const TARGET_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= TARGET_VERSION) return;
  if (version === 0) {
    await db.execAsync(SCHEMA_V1);
    version = 1;
  }
  await db.execAsync(`PRAGMA user_version = ${TARGET_VERSION}`);
}

// ------------------------------------------------------------- Yardımcılar

const ULID_CHARS = '0123456789abcdefghjkmnpqrstvwxyz';

/** Backend'deki ULID'lerle aynı biçimde (26 karakter, zamana göre sıralı) kimlik. */
export function ulid(): string {
  let time = Date.now();
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = ULID_CHARS[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += ULID_CHARS[Math.floor(Math.random() * 32)];
  return timePart + rand;
}

/** Arama için: küçük harf, Türkçe karakter ve aksansız. */
export function fold(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Laravel'in Str::slug() karşılığı (yazar/yayınevi/etiket tekilliği için). */
export function slugify(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Uygulamaya özel, kullanıcıya gösterilecek iş kuralı hatası (ör. "kitap zaten ödünçte"). */
export class LocalError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LocalError';
  }
}

/** SQL `IN (?, ?, ...)` yer tutucuları. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
