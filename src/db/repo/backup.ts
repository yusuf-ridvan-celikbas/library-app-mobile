import { fold, getDb, LocalError, nowIso } from '../index';
import { TABLES_IN_ORDER, type TableName } from '../schema';

/**
 * Yedek dosyası biçimi (sürüm 1): her tablonun ham satırları, gerçek
 * kimlikleriyle. Aynı biçimi backend'deki `php artisan library:export-mobile`
 * komutu da üretir — PC'deki veriler telefona bu dosyayla bir kez taşınır.
 */
export type Backup = {
  app: 'eighteeneleven';
  version: 1;
  exported_at: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
};

export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  const tables: Backup['tables'] = {};
  for (const table of TABLES_IN_ORDER) {
    tables[table] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  return { app: 'eighteeneleven', version: 1, exported_at: nowIso(), tables };
}

/** Yedeği doğrular ve TÜM verinin yerine koyar (tek transaction — hata olursa hiçbir şey değişmez). */
export async function importBackup(raw: unknown): Promise<Record<string, number>> {
  const backup = raw as Partial<Backup>;
  if (!backup || backup.app !== 'eighteeneleven' || backup.version !== 1 || typeof backup.tables !== 'object') {
    throw new LocalError('INVALID_BACKUP', 'Bu dosya geçerli bir EighteenEleven yedeği değil.');
  }
  const db = await getDb();
  const counts: Record<string, number> = {};

  await db.withTransactionAsync(async () => {
    for (const table of [...TABLES_IN_ORDER].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of TABLES_IN_ORDER) {
      const rows = backup.tables![table] ?? [];
      // Sadece tabloda gerçekten var olan sütunlar yazılır (ileriye dönük uyumluluk).
      const columns = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => columns.includes(k));
        if (!keys.length) continue;
        await db.runAsync(
          `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          ...keys.map((k) => (row[k] ?? null) as string | number | null),
        );
      }
      counts[table] = rows.length;
    }
    // Arama sütunu telefondaki fold() ile yeniden hesaplanır (dosyadaki değere güvenilmez).
    const books = await db.getAllAsync<{ id: string; title: string }>('SELECT id, title FROM books');
    for (const b of books) {
      await db.runAsync('UPDATE books SET title_fold = ? WHERE id = ?', fold(b.title), b.id);
    }
  });
  return counts;
}
