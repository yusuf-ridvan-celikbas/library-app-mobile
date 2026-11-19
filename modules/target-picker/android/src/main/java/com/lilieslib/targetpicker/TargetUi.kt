package com.lilieslib.targetpicker

import android.app.Activity
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale

/** Contract constants shared by the picker, ADD_BOOK and the library provider (Target: docs/lilies-lib-contract.md). */
object TargetContract {
  /** Highest contract version Lilies Lib speaks. Always answer <= what Target asked for. */
  const val VERSION = 1
  const val EXTRA_CONTRACT_VERSION = "contract_version"
  const val EXTRA_BOOK_ID = "book_id"
  const val EXTRA_TITLE = "title"
  const val EXTRA_AUTHOR = "author"
  const val EXTRA_PAGE_COUNT = "page_count"
  const val EXTRA_PUBLISHER = "publisher"
  const val EXTRA_PUBLISHED_YEAR = "published_year"
}

/** Lilies Lib's colours (src/theme/tokens.ts) and small view helpers for the native Target screens. */
class TargetUi(private val activity: Activity) {
  data class Palette(
    val background: Int,
    val surface: Int,
    val border: Int,
    val text: Int,
    val textMuted: Int,
    val accent: Int,
    val accentSoft: Int,
    val onAccent: Int,
  )

  val isDark = (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
    Configuration.UI_MODE_NIGHT_YES

  val p: Palette = if (isDark) Palette(
    background = Color.parseColor("#151614"),
    surface = Color.parseColor("#1E1F1C"),
    border = Color.parseColor("#31322E"),
    text = Color.parseColor("#ECEAE4"),
    textMuted = Color.parseColor("#A19D94"),
    accent = Color.parseColor("#8DB59A"),
    accentSoft = Color.parseColor("#243028"),
    onAccent = Color.parseColor("#132017"),
  ) else Palette(
    background = Color.parseColor("#F5F3EE"),
    surface = Color.parseColor("#FFFEFB"),
    border = Color.parseColor("#E6E1D7"),
    text = Color.parseColor("#2B2A27"),
    textMuted = Color.parseColor("#77736B"),
    accent = Color.parseColor("#5E8A6D"),
    accentSoft = Color.parseColor("#E2EBE4"),
    onAccent = Color.parseColor("#FFFFFF"),
  )

  private val turkish = Locale.getDefault().language == "tr"

  fun tr(en: String, trText: String) = if (turkish) trText else en

  fun dp(v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()

  fun rounded(fill: Int, stroke: Int?, radius: Int = dp(12)) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = radius.toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  fun card(fill: Int = p.surface) = RippleDrawable(ColorStateList.valueOf(p.accentSoft), rounded(fill, p.border), null)

  fun text(value: CharSequence, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(activity).apply {
    text = value
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  /** Close button + title + subtitle. */
  fun header(title: String, subtitle: String): View {
    val header = LinearLayout(activity).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(8), dp(16), dp(4))
    }
    header.addView(ImageButton(activity).apply {
      setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
      setColorFilter(p.text)
      background = null
      contentDescription = tr("Cancel", "Vazgeç")
      setOnClickListener { activity.finish() }
    }, LinearLayout.LayoutParams(dp(48), dp(48)))
    val titles = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    titles.addView(text(title, 20f, p.text, bold = true))
    titles.addView(text(subtitle, 13f, p.textMuted))
    header.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
      marginStart = dp(4)
    })
    return header
  }

  /** Full-width button; [primary] = filled accent, otherwise outlined. */
  fun button(label: String, primary: Boolean, onClick: () -> Unit) = TextView(activity).apply {
    text = label
    gravity = Gravity.CENTER
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    typeface = Typeface.DEFAULT_BOLD
    setPadding(dp(16), dp(14), dp(16), dp(14))
    setTextColor(if (primary) p.onAccent else p.accent)
    background = RippleDrawable(
      ColorStateList.valueOf(if (primary) p.accentSoft else p.accentSoft),
      if (primary) rounded(p.accent, null) else rounded(Color.TRANSPARENT, p.accent),
      null,
    )
    isClickable = true
    isFocusable = true
    setOnClickListener { onClick() }
  }

  /** Edge-to-edge on Android 11+ (enforced on 15+): pad [root] for system bars and the keyboard. */
  @Suppress("DEPRECATION")
  fun setUpWindow(root: View) {
    val window = activity.window
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
      window.statusBarColor = Color.TRANSPARENT
      window.navigationBarColor = Color.TRANSPARENT
      root.setOnApplyWindowInsetsListener { v, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        WindowInsets.CONSUMED
      }
      val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      window.insetsController?.setSystemBarsAppearance(if (isDark) 0 else mask, mask)
    } else {
      window.statusBarColor = p.background
      window.navigationBarColor = p.background
      if (!isDark) window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }
  }
}
