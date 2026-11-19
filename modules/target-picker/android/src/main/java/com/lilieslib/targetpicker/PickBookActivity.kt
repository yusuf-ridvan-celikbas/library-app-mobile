package com.lilieslib.targetpicker

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import com.lilieslib.targetpicker.TargetContract as C
import java.util.concurrent.Executors

/**
 * Answers Target's `com.ridvan.target.action.PICK_BOOK` (contract v1).
 * Lists the library READ-ONLY; tapping a book returns RESULT_OK with the contract extras,
 * back returns RESULT_CANCELED. Runs in the `:target` process (see LiliesDb).
 */
class PickBookActivity : Activity() {

  private lateinit var ui: TargetUi
  private var allBooks: List<LiliesDb.LibraryBook> = emptyList()
  private var shownBooks: List<LiliesDb.LibraryBook> = emptyList()
  private var query = ""

  private lateinit var emptyView: TextView
  private val adapter = BookAdapter()
  private val executor = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED) // default answer: back / close = cancelled
    ui = TargetUi(this)
    val root = buildLayout()
    setContentView(root)
    ui.setUpWindow(root)
    loadBooks()
  }

  override fun onDestroy() {
    executor.shutdownNow()
    super.onDestroy()
  }

  private fun buildLayout(): View {
    val p = ui.p
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(p.background)
    }
    root.addView(ui.header(ui.tr("Pick a book", "Kitap seç"), ui.tr("From Lilies Lib, for Target", "Lilies Lib'den, Target için")))

    val search = EditText(this).apply {
      hint = ui.tr("Search title or author", "Başlık veya yazar ara")
      setHintTextColor(p.textMuted)
      setTextColor(p.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      isSingleLine = true
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
      setPadding(ui.dp(16), ui.dp(12), ui.dp(16), ui.dp(12))
      background = ui.rounded(p.surface, p.border)
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        override fun afterTextChanged(s: Editable?) {
          query = s?.toString() ?: ""
          applyFilter()
        }
      })
    }
    root.addView(search, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      setMargins(ui.dp(16), ui.dp(8), ui.dp(16), ui.dp(8))
    })

    val body = FrameLayout(this)
    val listView = ListView(this).apply {
      // Transparent divider = spacing between the card rows (ListView ignores item margins).
      divider = ColorDrawable(Color.TRANSPARENT)
      dividerHeight = ui.dp(8)
      clipToPadding = false
      setPadding(ui.dp(16), ui.dp(4), ui.dp(16), ui.dp(16))
      selector = ColorDrawable(Color.TRANSPARENT)
      adapter = this@PickBookActivity.adapter
      setOnItemClickListener { _, _, position, _ -> pick(shownBooks[position]) }
    }
    emptyView = ui.text(ui.tr("Loading…", "Yükleniyor…"), 15f, p.textMuted).apply {
      gravity = Gravity.CENTER
      setPadding(ui.dp(32), ui.dp(32), ui.dp(32), ui.dp(32))
    }
    body.addView(listView)
    body.addView(emptyView)
    listView.emptyView = emptyView
    root.addView(body, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    return root
  }

  private inner class BookAdapter : BaseAdapter() {
    override fun getCount() = shownBooks.size
    override fun getItem(position: Int) = shownBooks[position]
    override fun getItemId(position: Int) = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
      val row = (convertView as? LinearLayout) ?: makeRow()
      val book = shownBooks[position]
      (row.getChildAt(0) as TextView).text = book.title
      val meta = row.getChildAt(1) as TextView
      val parts = mutableListOf<String>()
      if (book.reading) parts += ui.tr("Reading now", "Okunuyor")
      book.author?.let { parts += it }
      book.pageCount?.let { parts += ui.tr("$it pages", "$it sayfa") }
      meta.text = parts.joinToString(" · ")
      meta.visibility = if (parts.isEmpty()) View.GONE else View.VISIBLE
      meta.setTextColor(if (book.reading) ui.p.accent else ui.p.textMuted)
      return row
    }

    private fun makeRow() = LinearLayout(this@PickBookActivity).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(ui.dp(16), ui.dp(12), ui.dp(16), ui.dp(12))
      background = ui.card()
      layoutParams = AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
      addView(ui.text("", 16f, ui.p.text, bold = true).apply {
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
      })
      addView(ui.text("", 13f, ui.p.textMuted).apply {
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setPadding(0, ui.dp(2), 0, 0)
      })
    }
  }

  private fun loadBooks() {
    executor.execute {
      val result = try {
        LiliesDb.readBooks(this)
      } catch (e: Exception) {
        Log.w(TAG, "Could not read the Lilies Lib database", e)
        null
      }
      main.post {
        if (isFinishing || isDestroyed) return@post
        allBooks = result ?: emptyList()
        emptyView.text = if (result == null)
          ui.tr("Couldn't open your library. Open Lilies Lib once and try again.", "Kütüphane açılamadı. Lilies Lib'i bir kez açıp tekrar deneyin.")
        else ui.tr("No books in Lilies Lib yet.", "Lilies Lib'de henüz kitap yok.")
        applyFilter()
      }
    }
  }

  private fun applyFilter() {
    val words = LiliesDb.fold(query).split(' ').filter { it.isNotEmpty() }
    shownBooks = if (words.isEmpty()) allBooks else allBooks.filter { b ->
      val hay = LiliesDb.fold("${b.title} ${b.author ?: ""}")
      words.all { hay.contains(it) }
    }
    if (allBooks.isNotEmpty() && shownBooks.isEmpty()) emptyView.text = ui.tr("No matching books.", "Eşleşen kitap yok.")
    adapter.notifyDataSetChanged()
  }

  private fun pick(book: LiliesDb.LibraryBook) {
    val data = Intent().apply {
      putExtra(C.EXTRA_CONTRACT_VERSION, C.VERSION)
      putExtra(C.EXTRA_BOOK_ID, book.id)
      putExtra(C.EXTRA_TITLE, book.title)
      book.author?.let { putExtra(C.EXTRA_AUTHOR, it) }
      book.pageCount?.let { putExtra(C.EXTRA_PAGE_COUNT, it) }
      book.publisher?.let { putExtra(C.EXTRA_PUBLISHER, it) }
      book.publishedYear?.let { putExtra(C.EXTRA_PUBLISHED_YEAR, it) }
      // cover_uri: not sent in v1 (Target ignores it; covers are remote URLs here).
    }
    Log.i(TAG, "Picked ${book.id}: page_count=${book.pageCount}")
    setResult(RESULT_OK, data)
    finish()
  }

  private companion object {
    const val TAG = "LiliesTargetPicker"
  }
}
