package com.lilieslib.targetpicker

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.lilieslib.targetpicker.TargetContract as C
import java.util.concurrent.Executors

/**
 * Answers Target's `com.ridvan.target.action.ADD_BOOK` (contract v1): the user sends one of their
 * Target books to Lilies Lib by hand. Shows the book and asks to confirm; if a book with the same title
 * already exists it is offered instead of making a duplicate.
 *
 * Confirm → RESULT_OK with contract_version + book_id (new or existing). Back / close → RESULT_CANCELED.
 * Runs in the `:target` process (see LiliesDb).
 */
class AddBookActivity : Activity() {

  private lateinit var ui: TargetUi
  private lateinit var book: LiliesDb.NewBook
  private lateinit var content: LinearLayout
  private val executor = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var busy = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)
    val extras = intent.extras
    val version = intOf(extras?.get(C.EXTRA_CONTRACT_VERSION)) ?: 1
    val title = textOf(extras?.get(C.EXTRA_TITLE))
    if (version < 1 || title == null) {
      // Not something this contract version understands: answer "cancelled".
      finish()
      return
    }
    book = LiliesDb.NewBook(
      title = title,
      author = textOf(extras?.get(C.EXTRA_AUTHOR)),
      pageCount = intOf(extras?.get(C.EXTRA_PAGE_COUNT))?.takeIf { it > 0 },
      publisher = textOf(extras?.get(C.EXTRA_PUBLISHER)),
    )

    ui = TargetUi(this)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(ui.p.background)
    }
    root.addView(ui.header(ui.tr("Add to Lilies Lib", "Lilies Lib'e ekle"), ui.tr("Sent from Target", "Target'tan gönderildi")))
    content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(ui.dp(16), ui.dp(8), ui.dp(16), ui.dp(24))
    }
    root.addView(ScrollView(this).apply { addView(content) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    setContentView(root)
    ui.setUpWindow(root)

    content.addView(bookCard(book.title, details(book.author, book.pageCount, book.publisher), clickable = false))
    content.addView(note(ui.tr("Checking your library…", "Kütüphane kontrol ediliyor…")))
    executor.execute {
      val matches = try {
        LiliesDb.findSameTitle(this, book.title)
      } catch (e: Exception) {
        Log.w(TAG, "Duplicate check failed", e)
        emptyList()
      }
      main.post { if (!isFinishing && !isDestroyed) showChoices(matches) }
    }
  }

  override fun onDestroy() {
    executor.shutdownNow()
    super.onDestroy()
  }

  private fun showChoices(matches: List<LiliesDb.LibraryBook>) {
    content.removeViewAt(content.childCount - 1) // "Checking…"
    if (matches.isNotEmpty()) {
      content.addView(note(ui.tr(
        "A book with this title is already in your library. Tap it to link Target to that book:",
        "Bu başlıkta bir kitap zaten kütüphanenizde. Target'ı o kitaba bağlamak için dokunun:",
      )))
      for (m in matches) {
        content.addView(bookCard(m.title, details(m.author, m.pageCount, m.publisher), clickable = true) { answer(m.id) })
      }
      content.addView(spacer(16))
      content.addView(ui.button(ui.tr("Add as a new book", "Yeni kitap olarak ekle"), primary = false) { add() })
    } else {
      content.addView(spacer(16))
      content.addView(ui.button(ui.tr("Add to my library", "Kütüphaneme ekle"), primary = true) { add() })
    }
    content.addView(spacer(8))
    content.addView(ui.button(ui.tr("Cancel", "Vazgeç"), primary = false) { finish() })
  }

  private fun add() {
    if (busy) return
    busy = true
    executor.execute {
      val id = try {
        LiliesDb.addBook(this, book)
      } catch (e: Exception) {
        Log.w(TAG, "Adding the book failed", e)
        null
      }
      main.post {
        if (isFinishing || isDestroyed) return@post
        if (id != null) answer(id) else {
          busy = false
          content.addView(note(ui.tr(
            "Couldn't add the book. Open Lilies Lib once and try again.",
            "Kitap eklenemedi. Lilies Lib'i bir kez açıp tekrar deneyin.",
          )), 1)
        }
      }
    }
  }

  private fun answer(bookId: String) {
    setResult(RESULT_OK, Intent().apply {
      putExtra(C.EXTRA_CONTRACT_VERSION, C.VERSION)
      putExtra(C.EXTRA_BOOK_ID, bookId)
    })
    finish()
  }

  // ------------------------------------------------------------------ Views

  private fun details(author: String?, pages: Int?, publisher: String?): String =
    listOfNotNull(author, pages?.let { ui.tr("$it pages", "$it sayfa") }, publisher).joinToString(" · ")

  private fun bookCard(title: String, meta: String, clickable: Boolean, onClick: (() -> Unit)? = null): View =
    LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(ui.dp(16), ui.dp(14), ui.dp(16), ui.dp(14))
      background = if (clickable) ui.card() else ui.rounded(ui.p.surface, ui.p.border)
      addView(ui.text(title, 17f, ui.p.text, bold = true))
      if (meta.isNotEmpty()) addView(ui.text(meta, 14f, ui.p.textMuted).apply { setPadding(0, ui.dp(2), 0, 0) })
      if (clickable) {
        isClickable = true
        setOnClickListener { onClick?.invoke() }
      }
      layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        topMargin = ui.dp(8)
      }
    }

  private fun note(value: String): TextView = ui.text(value, 14f, ui.p.textMuted).apply {
    setPadding(ui.dp(4), ui.dp(16), ui.dp(4), 0)
  }

  private fun spacer(heightDp: Int) = View(this).apply {
    layoutParams = LinearLayout.LayoutParams(1, ui.dp(heightDp))
  }

  private companion object {
    const val TAG = "LiliesTargetAdd"

    /** Lenient like Target: any number type or numeric text. */
    fun intOf(value: Any?): Int? = when (value) {
      is Int -> value
      is Number -> value.toDouble().takeIf { it % 1.0 == 0.0 && it <= Int.MAX_VALUE && it >= Int.MIN_VALUE }?.toInt()
      is String -> value.trim().toDoubleOrNull()?.let { intOf(it) }
      else -> null
    }

    fun textOf(value: Any?): String? = value?.toString()?.trim()?.ifEmpty { null }
  }
}
