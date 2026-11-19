package com.lilieslib.targetpicker

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import java.io.File
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Answers Target's `com.ridvan.target.action.PICK_BOOK` (contract v1, defined in the
 * Target repo: docs/lilies-lib-contract.md).
 *
 * Lists the books from Lilies Lib's own SQLite file, opened READ-ONLY, so the picker can
 * never change the library. Tapping a book returns RESULT_OK with the contract extras;
 * back returns RESULT_CANCELED. No network, no extra permissions.
 */
class PickBookActivity : Activity() {

  private data class Book(
    val id: String,
    val title: String,
    val author: String?,
    val pageCount: Int?,
    val publisher: String?,
    val publishedYear: Int?,
    val reading: Boolean,
    val fold: String,
  )

  private data class Palette(
    val background: Int,
    val surface: Int,
    val border: Int,
    val text: Int,
    val textMuted: Int,
    val accent: Int,
    val accentSoft: Int,
  )

  private val light = Palette(
    background = Color.parseColor("#F5F3EE"),
    surface = Color.parseColor("#FFFEFB"),
    border = Color.parseColor("#E6E1D7"),
    text = Color.parseColor("#2B2A27"),
    textMuted = Color.parseColor("#77736B"),
    accent = Color.parseColor("#5E8A6D"),
    accentSoft = Color.parseColor("#E2EBE4"),
  )

  private val dark = Palette(
    background = Color.parseColor("#151614"),
    surface = Color.parseColor("#1E1F1C"),
    border = Color.parseColor("#31322E"),
    text = Color.parseColor("#ECEAE4"),
    textMuted = Color.parseColor("#A19D94"),
    accent = Color.parseColor("#8DB59A"),
    accentSoft = Color.parseColor("#243028"),
  )

  private lateinit var palette: Palette
  private var isDark = false
  private val turkish = Locale.getDefault().language == "tr"

  private var allBooks: List<Book> = emptyList()
  private var shownBooks: List<Book> = emptyList()
  private var query = ""

  private lateinit var listView: ListView
  private lateinit var emptyView: TextView
  private val adapter = BookAdapter()
  private val executor = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Default answer: back / finish without picking = cancelled.
    setResult(RESULT_CANCELED)

    isDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES
    palette = if (isDark) dark else light

    setContentView(buildLayout())
    setUpWindow()
    loadBooks()
  }

  override fun onDestroy() {
    executor.shutdownNow()
    super.onDestroy()
  }

  // ------------------------------------------------------------------ UI

  private fun tr(en: String, trText: String) = if (turkish) trText else en

  private fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun buildLayout(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(palette.background)
    }

    // Header: back arrow + title + subtitle
    val header = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(8), dp(16), dp(4))
    }
    val back = ImageButton(this).apply {
      setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
      setColorFilter(palette.text)
      background = null
      contentDescription = tr("Cancel", "Vazgeç")
      setOnClickListener { finish() }
    }
    header.addView(back, LinearLayout.LayoutParams(dp(48), dp(48)))
    val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    titles.addView(TextView(this).apply {
      text = tr("Pick a book", "Kitap seç")
      setTextColor(palette.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      typeface = Typeface.DEFAULT_BOLD
    })
    titles.addView(TextView(this).apply {
      text = tr("From Lilies Lib, for Target", "Lilies Lib'den, Target için")
      setTextColor(palette.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    })
    header.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = dp(4)
    })
    root.addView(header)

    // Search box
    val search = EditText(this).apply {
      hint = tr("Search title or author", "Başlık veya yazar ara")
      setHintTextColor(palette.textMuted)
      setTextColor(palette.text)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      isSingleLine = true
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
      setPadding(dp(16), dp(12), dp(16), dp(12))
      background = rounded(palette.surface, palette.border, dp(12))
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
      setMargins(dp(16), dp(8), dp(16), dp(8))
    })

    // List + empty state share the remaining space
    val body = android.widget.FrameLayout(this)
    listView = ListView(this).apply {
      // Transparent divider = spacing between the card rows (ListView ignores item margins).
      divider = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
      dividerHeight = dp(8)
      clipToPadding = false
      setPadding(dp(16), dp(4), dp(16), dp(16))
      selector = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
      adapter = this@PickBookActivity.adapter
      setOnItemClickListener { _, _, position, _ -> pick(shownBooks[position]) }
    }
    emptyView = TextView(this).apply {
      text = tr("Loading…", "Yükleniyor…")
      setTextColor(palette.textMuted)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      gravity = Gravity.CENTER
      setPadding(dp(32), dp(32), dp(32), dp(32))
    }
    body.addView(listView)
    body.addView(emptyView)
    listView.emptyView = emptyView
    root.addView(body, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    return root
  }

  private fun rounded(fill: Int, stroke: Int?, radius: Int) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = radius.toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  @Suppress("DEPRECATION")
  private fun setUpWindow() {
    val root = findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Edge-to-edge (enforced on Android 15+): pad for system bars and the keyboard.
      window.setDecorFitsSystemWindows(false)
      window.statusBarColor = Color.TRANSPARENT
      window.navigationBarColor = Color.TRANSPARENT
      root.setOnApplyWindowInsetsListener { v, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        WindowInsets.CONSUMED
      }
      val light = if (isDark) 0 else
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      window.insetsController?.setSystemBarsAppearance(
        light,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
      )
    } else {
      window.statusBarColor = palette.background
      window.navigationBarColor = palette.background
      if (!isDark) window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }
  }

  private inner class BookAdapter : BaseAdapter() {
    override fun getCount() = shownBooks.size
    override fun getItem(position: Int) = shownBooks[position]
    override fun getItemId(position: Int) = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
      val row = (convertView as? LinearLayout) ?: makeRow()
      val book = shownBooks[position]
      val title = row.getChildAt(0) as TextView
      val meta = row.getChildAt(1) as TextView
      title.text = book.title
      val parts = mutableListOf<String>()
      if (book.reading) parts += tr("Reading now", "Okunuyor")
      book.author?.let { parts += it }
      book.pageCount?.let { parts += tr("$it pages", "$it sayfa") }
      meta.text = parts.joinToString(" · ")
      meta.visibility = if (parts.isEmpty()) View.GONE else View.VISIBLE
      meta.setTextColor(if (book.reading) palette.accent else palette.textMuted)
      return row
    }

    private fun makeRow(): LinearLayout {
      val row = LinearLayout(this@PickBookActivity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(12), dp(16), dp(12))
        background = android.graphics.drawable.RippleDrawable(
          android.content.res.ColorStateList.valueOf(palette.accentSoft),
          rounded(palette.surface, palette.border, dp(12)),
          null,
        )
        layoutParams = android.widget.AbsListView.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        )
      }
      row.addView(TextView(this@PickBookActivity).apply {
        setTextColor(palette.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        typeface = Typeface.DEFAULT_BOLD
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
      })
      row.addView(TextView(this@PickBookActivity).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setPadding(0, dp(2), 0, 0)
      })
      return row
    }
  }

  // ------------------------------------------------------------------ Data

  private fun loadBooks() {
    executor.execute {
      val result = try {
        readBooks()
      } catch (e: Exception) {
        android.util.Log.w(TAG, "Could not read the Lilies Lib database", e)
        null
      }
      main.post {
        if (isFinishing || isDestroyed) return@post
        allBooks = result ?: emptyList()
        emptyView.text = when {
          result == null -> tr("Couldn't open your library. Open Lilies Lib once and try again.",
            "Kütüphane açılamadı. Lilies Lib'i bir kez açıp tekrar deneyin.")
          else -> tr("No books in Lilies Lib yet.", "Lilies Lib'de henüz kitap yok.")
        }
        applyFilter()
      }
    }
  }

  /** Reads all non-deleted books. Returns empty if the app's DB was never created. */
  private fun readBooks(): List<Book> {
    val file = File(filesDir, "SQLite/$DB_NAME")
    if (!file.exists()) return emptyList()

    val db = SQLiteDatabase.openDatabase(
      file.path, null,
      SQLiteDatabase.OPEN_READONLY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
    )
    try {
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

      val books = ArrayList<Book>()
      db.rawQuery(
        """SELECT b.id, b.title, b.status, b.page_count, b.published_at, p.name
           FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id
           WHERE b.deleted_at IS NULL""",
        null,
      ).use { c ->
        while (c.moveToNext()) {
          val id = c.getString(0) ?: continue
          val title = c.getString(1)?.trim()
          if (title.isNullOrEmpty()) continue // contract: title is required, non-blank
          val author = authors[id]?.joinToString(", ")
          val pages = if (c.isNull(3)) null else c.getInt(3).takeIf { it > 0 }
          val year = c.getString(4)?.trim()?.take(4)?.toIntOrNull()?.takeIf { it in 1..9999 }
          val publisher = c.getString(5)?.trim()?.takeIf { it.isNotEmpty() }
          books += Book(
            id = id,
            title = title,
            author = author,
            pageCount = pages,
            publisher = publisher,
            publishedYear = year,
            reading = c.getString(2) == "reading",
            fold = fold("$title ${author ?: ""}"),
          )
        }
      }
      // Books being read first, then alphabetical (Turkish-aware via fold).
      books.sortWith(compareBy<Book> { !it.reading }.thenBy { fold(it.title) })
      return books
    } finally {
      db.close()
    }
  }

  private fun applyFilter() {
    val words = fold(query).split(' ').filter { it.isNotEmpty() }
    shownBooks = if (words.isEmpty()) allBooks else allBooks.filter { b -> words.all { b.fold.contains(it) } }
    if (allBooks.isNotEmpty() && shownBooks.isEmpty()) {
      emptyView.text = tr("No matching books.", "Eşleşen kitap yok.")
    }
    adapter.notifyDataSetChanged()
  }

  // ------------------------------------------------------------------ Answer

  private fun pick(book: Book) {
    val data = Intent().apply {
      putExtra(EXTRA_CONTRACT_VERSION, CONTRACT_VERSION)
      putExtra("book_id", book.id)
      putExtra("title", book.title)
      book.author?.let { putExtra("author", it) }
      book.pageCount?.let { putExtra("page_count", it) }
      book.publisher?.let { putExtra("publisher", it) }
      book.publishedYear?.let { putExtra("published_year", it) }
      // cover_uri: not sent in v1 (Target ignores it; covers are remote URLs here).
    }
    setResult(RESULT_OK, data)
    finish()
  }

  companion object {
    private const val TAG = "LiliesTargetPicker"
    private const val DB_NAME = "eighteeneleven.db" // must match src/db/index.ts
    private const val EXTRA_CONTRACT_VERSION = "contract_version"

    /** Highest contract version this picker speaks. Always answer <= what Target asked for. */
    private const val CONTRACT_VERSION = 1

    /** Same idea as fold() in src/db/index.ts: lower case, no Turkish letters or accents. */
    fun fold(s: String): String {
      val lower = s.replace('İ', 'i').replace('I', 'ı').lowercase(Locale.ROOT)
        .replace('ı', 'i').replace('ş', 's').replace('ğ', 'g')
        .replace('ü', 'u').replace('ö', 'o').replace('ç', 'c')
      return Normalizer.normalize(lower, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
    }
  }
}
