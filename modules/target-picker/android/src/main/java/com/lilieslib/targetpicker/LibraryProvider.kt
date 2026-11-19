package com.lilieslib.targetpicker

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.util.Log
import com.lilieslib.targetpicker.TargetContract as C

/**
 * Read-only library for Target's sync / "Refresh from Lilies Lib" (contract v1):
 * `content://com.anonymous.eighteeneleven.target/books` → one row per non-deleted book with the
 * same fields as the picker extras. Protected by the dangerous-level permission
 * `com.anonymous.eighteeneleven.permission.READ_LIBRARY` (the user allows it in an Android dialog).
 * insert/update/delete are not supported. Runs in the `:target` process (see LiliesDb).
 */
class LibraryProvider : ContentProvider() {

  private val matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
    addURI(AUTHORITY, "books", BOOKS)
  }

  override fun onCreate() = true

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? {
    if (matcher.match(uri) != BOOKS) return null
    val columns = projection?.filter { it in ALL_COLUMNS }?.toTypedArray()?.takeIf { it.isNotEmpty() } ?: ALL_COLUMNS
    val cursor = MatrixCursor(columns)
    val books = try {
      LiliesDb.readBooks(context!!)
    } catch (e: Exception) {
      Log.w(TAG, "Could not read the Lilies Lib database", e)
      emptyList()
    }
    for (b in books) {
      cursor.addRow(columns.map { col ->
        when (col) {
          C.EXTRA_CONTRACT_VERSION -> C.VERSION
          C.EXTRA_BOOK_ID -> b.id
          C.EXTRA_TITLE -> b.title
          C.EXTRA_AUTHOR -> b.author
          C.EXTRA_PAGE_COUNT -> b.pageCount
          C.EXTRA_PUBLISHER -> b.publisher
          C.EXTRA_PUBLISHED_YEAR -> b.publishedYear
          else -> null
        }
      })
    }
    return cursor
  }

  override fun getType(uri: Uri): String? =
    if (matcher.match(uri) == BOOKS) "vnd.android.cursor.dir/vnd.lilieslib.book" else null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

  private companion object {
    const val TAG = "LiliesLibraryProvider"
    const val AUTHORITY = "com.anonymous.eighteeneleven.target"
    const val BOOKS = 1
    val ALL_COLUMNS = arrayOf(
      C.EXTRA_CONTRACT_VERSION, C.EXTRA_BOOK_ID, C.EXTRA_TITLE, C.EXTRA_AUTHOR,
      C.EXTRA_PAGE_COUNT, C.EXTRA_PUBLISHER, C.EXTRA_PUBLISHED_YEAR,
    )
  }
}
