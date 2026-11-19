package com.lilieslib.targetpicker

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.security.SecureRandom
import java.text.Normalizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Access to Lilies Lib's own SQLite file for the Target extension.
 *
 * IMPORTANT: everything that uses this class runs in the separate `:target` process (see
 * AndroidManifest.xml). The app itself opens the same file with expo-sqlite, which bundles its own
 * SQLite library; two SQLite copies in ONE process break each other's POSIX file locks and can
 * corrupt the database (sqlite.org/howtocorrupt.html, "multiple copies of SQLite"). Across processes
 * normal SQLite locking applies, so the app and this code can safely share the file (WAL mode).
 *
 * Writes mirror the app's own code (src/db/repo/books.ts saveBook, reference.ts findOrCreateByName)
 * so a book added here looks exactly like one added in the app.
 */
object LiliesDb {
  const val DB_NAME = "eighteeneleven.db" // must match src/db/index.ts

  /** Lowest app schema (PRAGMA user_version) this code knows how to read/write. */
  private const val MIN_SCHEMA = 2

  data class LibraryBook(
    val id: String,
    val title: String,
    val author: String?,
    val pageCount: Int?,
    val publisher: String?,
    val publishedYear: Int?,
    val reading: Boolean,
  )

  data class NewBook(
    val title: String,
    val author: String?,
    val pageCount: Int?,
    val publisher: String?,
  )

  fun file(context: Context) = File(context.filesDir, "SQLite/$DB_NAME")

  /** Null when the app has never been opened (no database / old schema yet). */
  private fun open(context: Context, write: Boolean): SQLiteDatabase? {
    val f = file(context)
    if (!f.exists()) return null
    val flags = SQLiteDatabase.NO_LOCALIZED_COLLATORS or
      if (write) SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING
      else SQLiteDatabase.OPEN_READONLY
    val db = SQLiteDatabase.openDatabase(f.path, null, flags)
    try {
      // The app may be writing at the same moment: wait for its lock instead of failing.
      db.rawQuery("PRAGMA busy_timeout = 5000", null).use { it.moveToFirst() }
      if (db.version < MIN_SCHEMA) {
        db.close()
        return null
      }
      if (write) db.setForeignKeyConstraintsEnabled(true)
      return db
    } catch (e: Exception) {
      db.close()
      throw e
    }
  }

  /** All non-deleted books; the ones being read first, then by title. Empty if there's no library yet. */
  fun readBooks(context: Context): List<LibraryBook> {
    val db = open(context, write = false) ?: return emptyList()
    db.use { return readBooks(it, null) }
  }

  /** Non-deleted books with the same (folded) title, for duplicate detection. */
  fun findSameTitle(context: Context, title: String): List<LibraryBook> {
    val db = open(context, write = false) ?: return emptyList()
    db.use { return readBooks(it, fold(title.trim())) }
  }

  private fun readBooks(db: SQLiteDatabase, titleFold: String?): List<LibraryBook> {
    val authors = HashMap<String, MutableList<String>>()
    db.rawQuery(
      """SELECT ba.book_id, a.name FROM book_author ba
         JOIN authors a ON a.id = ba.author_id
         ORDER BY ba.book_id, ba.sort_order""",
      null,
    ).use { c ->
      while (c.moveToNext()) {
        val name = c.getString(1)?.trim()
        if (!name.isNullOrEmpty()) authors.getOrPut(c.getString(0)) { mutableListOf() } += name
      }
    }

    val where = if (titleFold != null) " AND b.title_fold = ?" else ""
    val books = ArrayList<LibraryBook>()
    db.rawQuery(
      """SELECT b.id, b.title, b.status, b.page_count, b.published_at, p.name
         FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id
         WHERE b.deleted_at IS NULL$where""",
      if (titleFold != null) arrayOf(titleFold) else null,
    ).use { c ->
      while (c.moveToNext()) {
        val id = c.getString(0) ?: continue
        val title = c.getString(1)?.trim()
        if (title.isNullOrEmpty()) continue // contract: title is required, non-blank
        books += LibraryBook(
          id = id,
          title = title,
          author = authors[id]?.joinToString(", "),
          pageCount = intOrNull(c.getString(3))?.takeIf { it > 0 },
          publisher = c.getString(5)?.trim()?.takeIf { it.isNotEmpty() },
          publishedYear = c.getString(4)?.trim()?.take(4)?.toIntOrNull()?.takeIf { it in 1..9999 },
          reading = c.getString(2) == "reading",
        )
      }
    }
    books.sortWith(compareBy<LibraryBook> { !it.reading }.thenBy { fold(it.title) })
    return books
  }

  /** "412", "412.0", " 412 " → 412. Whatever type SQLite stored the number as. */
  private fun intOrNull(raw: String?): Int? =
    raw?.trim()?.toDoubleOrNull()?.takeIf { it % 1.0 == 0.0 && it <= Int.MAX_VALUE }?.toInt()

  /**
   * Adds a book like the app's saveBook() does (status 'available'). Authors/publishers are found by
   * slug or created, the same way the app does it. Returns the new book id, or null if there's no library yet.
   *
   * The published year is NOT stored: the app keeps a full date (YYYY-MM-DD) there, and making up a
   * day and month would be wrong data.
   */
  fun addBook(context: Context, book: NewBook): String? {
    val db = open(context, write = true) ?: return null
    db.use {
      val now = nowIso()
      val bookId = ulid()
      db.beginTransaction()
      try {
        val authorId = book.author?.let { findOrCreate(db, "authors", it) }
        val publisherId = book.publisher?.let { findOrCreate(db, "publishers", it) }
        db.insertOrThrow("books", null, ContentValues().apply {
          put("id", bookId)
          put("title", book.title)
          put("title_fold", fold(book.title))
          put("status", "available")
          if (book.pageCount != null) put("page_count", book.pageCount) else putNull("page_count")
          if (publisherId != null) put("publisher_id", publisherId) else putNull("publisher_id")
          put("created_at", now)
          put("updated_at", now)
        })
        if (authorId != null) {
          db.insertOrThrow("book_author", null, ContentValues().apply {
            put("book_id", bookId)
            put("author_id", authorId)
            put("sort_order", 0)
          })
        }
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
      return bookId
    }
  }

  /** Same as findOrCreateByName + saveReference in src/db/repo/reference.ts. */
  private fun findOrCreate(db: SQLiteDatabase, table: String, name: String): String {
    val slug = slugify(name)
    db.rawQuery("SELECT id FROM $table WHERE slug = ? AND deleted_at IS NULL", arrayOf(slug)).use {
      if (it.moveToFirst()) return it.getString(0)
    }
    // A deleted (hidden) record with the same name comes back — the slug column is unique.
    db.rawQuery("SELECT id FROM $table WHERE slug = ? AND deleted_at IS NOT NULL", arrayOf(slug)).use {
      if (it.moveToFirst()) {
        val id = it.getString(0)
        db.execSQL("UPDATE $table SET name = ?, deleted_at = NULL WHERE id = ?", arrayOf(name, id))
        return id
      }
    }
    val id = ulid()
    db.insertOrThrow(table, null, ContentValues().apply {
      put("id", id)
      put("name", name)
      put("slug", slug)
    })
    return id
  }

  // ------------------------------------------------------- Same helpers as src/db/index.ts

  /** Lower case, no Turkish letters or accents. */
  fun fold(s: String): String {
    val lower = s.replace('İ', 'i').replace('I', 'ı').lowercase(Locale.ROOT)
      .replace('ı', 'i').replace('ğ', 'g').replace('ş', 's')
      .replace('ç', 'c').replace('ö', 'o').replace('ü', 'u')
    return Normalizer.normalize(lower, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "")
  }

  fun slugify(s: String): String =
    fold(s).replace(Regex("[^a-z0-9]+"), "-").trim('-')

  private const val ULID_CHARS = "0123456789abcdefghjkmnpqrstvwxyz"
  private val random = SecureRandom()

  fun ulid(): String {
    var time = System.currentTimeMillis()
    val timePart = CharArray(10)
    for (i in 9 downTo 0) {
      timePart[i] = ULID_CHARS[(time % 32).toInt()]
      time /= 32
    }
    val rand = CharArray(16) { ULID_CHARS[random.nextInt(32)] }
    return String(timePart) + String(rand)
  }

  /** Same format as JS `new Date().toISOString()` (always 3 millisecond digits, UTC). */
  fun nowIso(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
      .apply { timeZone = TimeZone.getTimeZone("UTC") }
      .format(Date())
}
