/*
 * 轻课表 · 桌面小组件 · 横向课程列表（RemoteViewsService + Factory）
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️⚠️ 本文件当前**未被使用**（2026-09-18 起停用），保留以备阶段 B 复用。
 *
 * 为什么停用：
 *   真机（vivo OriginOS / Android 13）实测，`ListView + setRemoteAdapter`
 *   这条 collection 链路**从未被系统绑定** ——
 *   `dumpsys activity services | grep QkbWidget` 恒为空，
 *   桌面只显示 launcher 的默认占位（白卡片 + 转圈），点击也无反应。
 *
 *   并且从源码看，**横向滚动在 RemoteViews 里本来就只有这一条路**：
 *     · HorizontalScrollView / ScrollView —— 没有 @RemoteView 注解，不能出现
 *     · ListView / AdapterViewFlipper     —— 有注解，但必须配 RemoteViewsService
 *     · ViewFlipper 有注解，但 RemoteViews.addView() 只允许在 collection item
 *       里用 → 根布局无法动态加子视图
 *
 *   → 所以 4×2 小组件这一版改成了**静态 3 槽位**（见 WidgetData.kt 与
 *     res/layout/qkb_widget_static.xml）。若将来要恢复翻页，先做的事是
 *     **先验证 RemoteViewsService 能被系统绑定**（`adb shell dumpsys activity services`），
 *     绑不上就别往下做。
 * ═══════════════════════════════════════════════════════════════════
 *
 * 【当初为什么需要这个文件】
 *   需求：4×2 小组件里横向滑动查看今天的全部课程（第 3、4 节…不断往后）。
 *
 *   ⚠️ **RemoteViews 不支持 HorizontalScrollView / RecyclerView / ViewPager**
 *      （不是带 @RemoteView 注解的类，inflate 时直接被过滤器拒掉）。
 *      唯一官方支持的滚动集合是 **ListView / GridView**，
 *      而 widget 里的 ListView **只允许一行**（item 横向排列）
 *      → 正好就是我们要的「横向滑动」。
 *
 *   但 ListView 的数据不能直接从 App 进程取 —— 桌面读不到 uni storage。
 *   所以走 Android 官方的 **RemoteViewsService** 机制：
 *     provider.onUpdate() → setRemoteAdapter(intent)  绑定
 *     → 系统在**主进程**里回调本 Service 的 Factory.getViewAt()
 *     → Factory 自己读 SharedPreferences（与 WidgetData.kt 同一个 SP）
 *     → 返回每一节课的 RemoteViews
 *
 * 【为什么是 .kt 而不是 .uts】
 *   同 DoAppWidget.kt —— 需要在 AndroidManifest 注册的组件，必须写原生类。
 *
 * 【为什么在这里重写一遍 hash 取色】
 *   App 侧 utils/color.js 用 djb2 变体给课程名取色，保证「同一门课永远同色」。
 *   桌面要显示**同样的颜色**，就必须用**同样的算法**。
 *   djb2 只有两行，重写比跨语言传函数简单得多，也避免了 IPC 传参。
 *   ⚠️ 改任意一侧的算法，必须同步改另一侧，否则 App 与桌面会不同色。
 *
 * 【容错原则】
 *   小组件是展示末端，任何异常都不能崩 —— 崩了桌面显示「无法加载微件」，
 *   比显示「今天没有课」糟糕得多。所以全程 try-catch，解析失败降级为空列表。
 */

package uts.sdk.modules.qkbWidget

import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject
// R 类与本文件同包（uts.sdk.modules.qkbWidget），直接引用即可，无需 import。
// 资源来自插件目录 uni_modules/qkb-widget/utssdk/app-android/res/

/** 日志标签，与 WidgetData.kt / DoAppWidget.kt 保持一致 */
private const val TAG = "QkbWidget"

/**
 * 课程色块 drawable 资源表。
 *
 * ⚠️ **长度必须与 utils/widget.js 的 COLOR_POOL_SIZE 一致（当前 6）**，
 *    顺序也必须与 utils/color.js 的 COLOR_POOL 一致。
 *    多一个少一个都会导致取色错位。
 *
 * 为什么建成数组而不是 when(seed)：
 *   以后加到 8 色池时，只要往数组里加一项 + 加一个 qkb_block_N.xml 即可，
 *   不用改多处分支。
 */
private val BLOCK_DRAWABLES = intArrayOf(
    R.drawable.qkb_block_0,  // 淡青 #E8F4F4
    R.drawable.qkb_block_1,  // 淡蓝 #EAF0F8
    R.drawable.qkb_block_2,  // 淡绿 #E4F2E8
    R.drawable.qkb_block_3,  // 淡黄 #F6EFE2
    R.drawable.qkb_block_4,  // 淡粉 #F4EAF2
    R.drawable.qkb_block_5   // 淡紫 #F2ECF4
)

/**
 * djb2 变体 hash —— **必须与 utils/color.js#hashString 逐位一致**。
 *
 * JS 版：
 *   let h = 5381
 *   for (...) h = ((h << 5) + h + s.charCodeAt(i)) | 0
 *   return Math.abs(h)
 *
 * ⚠️ 三个必须对齐的细节（任一错位就会「App 里淡青、桌面淡粉」）：
 *   1. `| 0` = 截断到 **32 位有符号整数**。Kotlin 的 `Int` 本身就是 32 位，
 *      `shl 5` 会自然溢出回绕，与 JS 的 `<<` 行为一致 → 无需额外处理。
 *   2. `charCodeAt` 返回 **UTF-16 code unit**；Kotlin `for (ch in s)` 的 `ch` 也是
 *      UTF-16 code unit → `ch.code` 与之等价，中文可对齐。
 *   3. **`Math.abs` 必须用 `Math.abs` 的语义，不能用 `and 0x7FFFFFFF`！**
 *      —— 这是踩过的坑：对负数而言 `abs(x) = -x`，而 `x and 0x7FFFFFFF` 是
 *      **保留低位、抹掉符号位**，两者相差极大（不是差 1）。
 *      实测 `毛泽东思想`：abs = 455830743，and = 1691652905 → 取模后 3 vs 5，
 *      颜色直接错到另一个色号。
 *      Kotlin 对应写法就是 `kotlin.math.abs(h)`。
 *      （`abs(Int.MIN_VALUE)` 仍为负是理论边界 —— JS 的 Math.abs 对 -2^31 返回正数
 *        2^31，但这需要 hash 恰好等于 -2^31，概率约 20 亿分之一，且只会导致
 *        颜色取到池外下标 → 下方 pickColorIndex 有兜底，不会崩。）
 *
 * @param s 种子串（课程 colorSeed 或课程名）
 * @return 非负 hash（见上面第 3 点的边界说明）
 */
private fun hashString(s: String): Int {
    var h = 5381
    for (ch in s) {
        // h * 33 + c ，用 shl+add 复刻 JS 的 (h << 5) + h + c
        h = (h shl 5) + h + ch.code
    }
    // 必须用 abs，不能用 and 掩码（见注释第 3 点）
    return kotlin.math.abs(h)
}

/**
 * 取课程色号（0 ~ BLOCK_DRAWABLES.size-1）
 *
 * ⚠️ 取值顺序必须与 utils/color.js#pickColor 一致：**colorSeed 优先，回退 name**。
 *    否则 App 与桌面会选到不同的颜色。
 *
 * ⚠️ `hashString` 在极端边界（hash 恰为 Int.MIN_VALUE）可能返回负数
 *    → 取模后为负 → 数组越界崩溃。这里做一次兜底修正。
 */
private fun pickColorIndex(course: JSONObject?): Int {
    if (course == null) return 0
    val seed = course.optString("colorSeed", "").ifEmpty {
        course.optString("name", "")
    }
    if (seed.isEmpty()) return 0
    val mod = hashString(seed) % BLOCK_DRAWABLES.size
    // 兜底：负数 / 越界都退回 0 号色（绝不因为取色把小组件搞崩）
    return if (mod in BLOCK_DRAWABLES.indices) mod else 0
}

/** 从 JSONObject 取字符串，统一兜底空串 */
private fun str(obj: JSONObject?, key: String): String {
    if (obj == null) return ""
    return obj.optString(key, "")
}

/**
 * 节次文案：sectionStart == sectionEnd 时显示「第 N 节」，否则「第 N-M 节」
 */
private fun sectionText(course: JSONObject): String {
    val from = course.optInt("sectionStart", 0)
    val to = course.optInt("sectionEnd", 0)
    return when {
        from <= 0 -> ""
        from == to -> "第 $from 节"
        else -> "第 $from-$to 节"
    }
}

/**
 * 时间文案：「08:00 – 09:40」
 *
 * ⚠️ 分隔符用**短横线加空格**（en dash 前后的普通连字符），
 *    不用破折号 —— 保持与 App 内 timeRangeOf() 的视觉一致。
 *
 * 容错：只有 start 时只显示 start；都没有时返回空串（由调用方决定隐藏）。
 */
private fun timeRange(course: JSONObject): String {
    val start = str(course, "start")
    val end = str(course, "end")
    return when {
        start.isNotEmpty() && end.isNotEmpty() -> "$start - $end"
        start.isNotEmpty() -> start
        else -> ""
    }
}

/**
 * 横向课程列表的 Adapter 工厂
 *
 * 系统会在**每次需要刷新列表时**新建一个 factory 实例（不是复用的），
 * 所以构造函数里读数据是安全的做法。
 */
class QkbWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    /** 今天要显示的课程。空列表表示「今天没有课」 */
    private var courses: MutableList<JSONObject> = mutableListOf()

    /**
     * 数据准备。系统在 getViewAt 之前调用一次。
     * 这里读 SharedPreferences 并解出 today 数组。
     */
    override fun onCreate() {
        load()
    }

    /** 系统在数据可能变化时调用（下拉刷新 / notifyAppWidgetViewDataChanged）。 */
    override fun onDataSetChanged() {
        load()
    }

    override fun onDestroy() {
        courses = mutableListOf()
    }

    private fun load() {
        courses = mutableListOf()
        try {
            val raw = readWidgetJson(context)
            if (raw.isEmpty()) return
            val root = JSONObject(raw)
            val today: JSONArray = root.optJSONArray("today") ?: return
            for (i in 0 until today.length()) {
                val item = today.optJSONObject(i)
                if (item != null) courses.add(item)
            }
        } catch (e: Exception) {
            // 解析失败 → 降级为空列表（显示「今天没有课」），绝不崩
            Log.e(TAG, "列表数据解析失败，降级为无课", e)
            courses = mutableListOf()
        }
    }

    /**
     * 项数。
     * ⚠️ 空列表时返回 **1**（而不是 0）—— 那 1 项是「今天没有课」提示卡片。
     *    返回 0 会让列表区域变成一块空白，观感差且用户不知道是没课还是坏了。
     */
    override fun getCount(): Int = if (courses.isEmpty()) 1 else courses.size

    /**
     * ⚠️ 必须返回稳定且唯一的 id。
     * 用 position 即可 —— 列表内容每次刷新都是全量重建，不需要 diff。
     *
     * 【「一次一屏」的做法】
     *   item 布局的宽高都是 match_parent（见 qkb_widget_4x2_item.xml）：
     *   宽度由 ListView 可视宽决定 → 一屏正好 1 节课；
     *   高度由列表区高度决定（主布局里是 0dp + weight=1）→ 卡片自适应组件高度。
     *   这里不需要再设尺寸，只填内容即可。
     */
    override fun getViewAt(position: Int): RemoteViews {
        // 每一项都用同一份 item 布局；内容在下面按数据改
        val views = RemoteViews(context.packageName, R.layout.qkb_widget_4x2_item)

        if (courses.isEmpty()) {
            // ── 空态：整项变成「今天没有课」提示卡片 ──
            views.setTextViewText(R.id.qkb_item_time, "今天没有课")
            views.setTextViewText(R.id.qkb_item_section, "")
            views.setTextViewText(R.id.qkb_item_name, "好好休息")
            views.setTextViewText(R.id.qkb_item_place, "")
            views.setTextViewText(R.id.qkb_item_page, "")
            return views
        }

        // ── 正常态：填一节课 ──
        val c = courses[position]
        views.setTextViewText(R.id.qkb_item_time, timeRange(c))
        views.setTextViewText(R.id.qkb_item_section, sectionText(c))
        views.setTextViewText(R.id.qkb_item_name, str(c, "name"))

        val place = str(c, "place")
        if (place.isNotEmpty()) {
            views.setTextViewText(R.id.qkb_item_place, place)
            views.setViewVisibility(R.id.qkb_item_place, android.view.View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.qkb_item_place, android.view.View.GONE)
        }

        // 分页指示：「2 / 4」—— 让用户知道现在看到第几门、共几门。
        // ListView 没有系统分页点（RemoteViews 不支持 ViewPager），
        // 这是最接近「分页指示」的表达方式。
        // 用「N / M」而非「第 N 节」：这里的 M 是**课程门数**不是节次，
        // 说「第 N 节」会和卡片里的「第 3-4 节」（真实节次）语义打架。
        views.setTextViewText(
            R.id.qkb_item_page,
            "${position + 1} / ${courses.size}"
        )

        // 圆角背景按课程色号切换（同课同色，与 App 一致）
        try {
            val idx = pickColorIndex(c)
            views.setInt(
                R.id.qkb_root_item,
                "setBackgroundResource",
                BLOCK_DRAWABLES[idx]
            )
        } catch (e: Exception) {
            // 设色失败不影响内容显示 —— 用默认色继续
            Log.w(TAG, "设置课程色块背景失败", e)
        }

        return views
    }

    /** 列表项滑动的加载动画，widget 里无意义 → 返回 null */
    override fun getLoadingView(): RemoteViews? = null

    /** ⚠️ 必须返回 **0**（ListView 的位置 id 列）—— 返回别的值系统会找不到列 */
    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    /** 数据是本地 SP，读取是毫秒级 → 不设稳定 id */
    override fun hasStableIds(): Boolean = false
}

/**
 * 供 ListView 的 setRemoteAdapter 绑定的 Service。
 *
 * ⚠️ **必须在 AndroidManifest.xml 里注册**，且带：
 *      android:permission="android.permission.BIND_REMOTEVIEWS"
 *      android:exported="false"
 *    ——BIND_REMOTEVIEWS 是系统绑定该 Service 的必要权限；
 *      不写系统不会绑定，列表就是空的（且**没有报错**）。
 */
class QkbWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return QkbWidgetFactory(applicationContext)
    }
}
