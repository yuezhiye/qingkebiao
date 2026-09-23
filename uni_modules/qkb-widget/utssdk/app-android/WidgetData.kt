/*
 * 轻课表 · 桌面小组件 · 数据读取与渲染（头部 + 静态课程卡）
 *
 * 【为什么是 .kt 而不是 .uts】
 *   本文件里的 `QkbWidgetProvider` 需要在 AndroidManifest.xml 里
 *   注册成系统组件。**UTS 编译器的产物是 UTS 模块（JS 桥接层），不保证把其中的
 *   class 编译成可被系统实例化的原生 Kotlin 类** —— 官方文档只说「UTS 会被编译为
 *   Kotlin 源码」，从未承诺 UTS 里定义的 class 能作为 Android 组件注册。
 *   实测：写在 .uts 里时，打包后的 APK 中 AndroidManifest 只有 receiver 标签，
 *   却没有目标类，系统静默忽略 → 桌面上找不到小组件。
 *   → 结论：**需要在 Manifest 注册的组件类，必须写在原生 .kt 文件里。**
 *     （.kt 放在 utssdk/app-android/ 下，文件名任意，但**不能叫 index.kt**，
 *       `index` 是 UTS 插件的保留文件名）
 *
 * 【为什么需要这个文件】
 *   小组件跑在**桌面 launcher 进程**里，而 uni-app 的数据在 App 自己的进程里，
 *   两边内存不共享 → 小组件**读不到 uni.setStorageSync 写的数据**。
 *   唯一可行的桥是**原生侧共享存储**：App 运行时把课表写进 SharedPreferences，
 *   小组件从这个 SP 里读。
 *
 * 【🔥 2026-09-18 架构变更：从「ListView 翻页」退回「静态卡片」】
 *   上一版用 `ListView + setRemoteAdapter + RemoteViewsService` 做「左右滑动
 *   一次一屏」。真机（vivo OriginOS）实测**整条 collection 链路从未被系统绑定**
 *   （`dumpsys activity services` 里查不到 QkbWidgetService），桌面只显示
 *   launcher 的默认占位（白卡片 + 转圈），点击也无反应。
 *
 *   源码级原因（`core/java/android/widget/` 下各控件的 `@RemoteView` 注解）：
 *     · HorizontalScrollView / ScrollView —— **没有注解，根本不能出现在 RemoteViews**
 *     · ListView / AdapterViewFlipper     —— 有注解，但**必须**配 RemoteViewsService
 *     · ViewFlipper 有注解，可 RemoteViews.addView() 只允许在 collection item 里用，
 *       根布局无法动态加子视图
 *   → 纯靠布局是**做不到横向滚动**的。所以这一版回到「静态 3 槽位」，
 *     换来「一定能渲染出来」。翻页方案留待后续（可能走 ViewFlipper + 点击往返）。
 *
 * 【容错原则】
 *   小组件是**展示末端**，任何异常都不能崩 —— 崩了用户看到的就是一片空白或
 *   "无法加载组件"，比显示"今天没有课"糟糕得多。所以这里全程 try-catch，
 *   解析失败一律降级为"今天没有课"。
 */

package uts.sdk.modules.qkbWidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
// R 类与本文件同包（uts.sdk.modules.qkbWidget），直接引用即可，无需 import。
// 资源来自插件目录 uni_modules/qkb-widget/utssdk/app-android/res/

/** 日志标签，便于 `adb logcat -s QkbWidget` 过滤 */
private const val TAG = "QkbWidget"

/** SharedPreferences 键 —— 与 utils/widget.js 的 WIDGET_KEY 必须一致 */
const val WIDGET_KEY = "qkb_widget_v1"

/**
 * SP 里缓存「当前桌面上的实例 id」的键（逗号分隔的字符串）。
 *
 * 【为什么要缓存】
 *   App 侧想主动刷新桌面时，拿实例 id 的正规 API 是
 *   `AppWidgetManager.getAppWidgetIds(ComponentName)`。
 *   但真机实测（2026-09-19 / vivo OriginOS / Android 13）这条路**取不到东西**：
 *   `syncData` 写完 SP 后调 `renderAllWidgets`，日志一条都不出
 *   （详见本文件 `renderAllWidgets` 的注释）。
 *
 *   而**系统的 `onUpdate` 回调是稳的** —— 它把 `appWidgetIds` 直接传进来，
 *   根本不经过 `getAppWidgetIds`。所以这里让 `onUpdate` 顺手把 id 存下来，
 *   App 侧刷新时直接读，绕开那个不可靠的 API。
 *
 * ⚠️ 只是个**缓存**：读不到时会回退去查系统，So 不会成为新的失败点。
 */
private const val KEY_WIDGET_IDS = "widgetIds"

/**
 * 组件全限定名。
 * ⚠️ 必须与 AndroidManifest.xml 里 receiver 的 android:name 完全一致，
 *    否则组件明明在桌面上显示了，点击却打不开 App，刷新广播也送不到。
 */
private const val PROVIDER_CLASS = "uts.sdk.modules.qkbWidget.QkbWidgetProvider"

/**
 * 课程卡槽位数。
 * ⚠️ **必须与 res/layout/qkb_widget_static.xml 里 qkb_card_N 的数量一致**，
 *    否则下标越界（下方 CARD_IDS 会直接崩）。改布局时两边一起改。
 */
private const val CARD_SLOTS = 3

/** 星期文案，下标 = todayDay - 1（1=周一 … 7=周日） */
private val WEEKDAY_LABELS = arrayOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

/**
 * 每个槽位用到的控件 id，顺序：
 *   [0] 卡片根（设背景色 / 显隐）
 *   [1] 时间行
 *   [2] 节次（右对齐）
 *   [3] 课名
 *   [4] 地点
 *
 * ⚠️ RemoteViews **不支持动态增删子视图**（`addView` 仅允许在 collection item
 *    里用），所以槽位只能**写死在 XML 里**，这里用数组把它们串起来按序号填。
 */
private val CARD_IDS = arrayOf(
    intArrayOf(
        R.id.qkb_card_0, R.id.qkb_time_0, R.id.qkb_section_0, R.id.qkb_name_0, R.id.qkb_place_0
    ),
    intArrayOf(
        R.id.qkb_card_1, R.id.qkb_time_1, R.id.qkb_section_1, R.id.qkb_name_1, R.id.qkb_place_1
    ),
    intArrayOf(
        R.id.qkb_card_2, R.id.qkb_time_2, R.id.qkb_section_2, R.id.qkb_name_2, R.id.qkb_place_2
    )
)

/**
 * 课程色块 drawable 资源表。
 *
 * ⚠️ **长度必须与 utils/widget.js 的 COLOR_POOL_SIZE 一致（当前 6）**，
 *    顺序也必须与 utils/color.js 的 COLOR_POOL 一致。
 *    多一个少一个都会导致取色错位。
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
 * 取 SharedPreferences 里的原始 JSON 串
 * @return 原始字符串；无数据 / 异常时返回空串
 */
fun readWidgetJson(context: Context): String {
    return try {
        val sp = context.getSharedPreferences(WIDGET_KEY, Context.MODE_PRIVATE)
        sp.getString("data", "") ?: ""
    } catch (e: Throwable) {
        Log.e(TAG, "读取 SharedPreferences 失败", e)
        ""
    }
}

/* ══════════════════ 文本 / 取色 小工具 ══════════════════ */

/** 从 JSONObject 取字符串，统一兜底空串 */
private fun str(obj: JSONObject?, key: String): String {
    if (obj == null) return ""
    return obj.optString(key, "")
}

/** 节次文案：sectionStart == sectionEnd 时显示「第 N 节」，否则「第 N-M 节」 */
private fun sectionText(course: JSONObject?): String {
    if (course == null) return ""
    val from = course.optInt("sectionStart", 0)
    val to = course.optInt("sectionEnd", 0)
    return when {
        from <= 0 -> ""
        from == to -> "第 $from 节"
        else -> "第 $from-$to 节"
    }
}

/**
 * 时间文案：「08:00 - 09:40」
 * 容错：只有 start 时只显示 start；都没有时返回空串。
 */
private fun timeRange(course: JSONObject?): String {
    if (course == null) return ""
    val start = str(course, "start")
    val end = str(course, "end")
    return when {
        start.isNotEmpty() && end.isNotEmpty() -> "$start - $end"
        start.isNotEmpty() -> start
        else -> ""
    }
}

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
 * 🔥 【数据契约】App 侧 `utils/widget.js#toWidgetCourse` 传下来的 `colorSeed`
 *     **已经是色号**（0 ~ COLOR_POOL_SIZE-1 的整数），**不是**原始种子串。
 *     App 侧已用 `pickColorSeed(c) = hashString(c.colorSeed || c.name) % 6` 算好；
 *     之所以只传下标：RemoteViews 不能动态改 drawable 颜色，只能
 *     `setBackgroundResource(预置资源 id)`，所以预置 6 个圆角 drawable 让原生选。
 *
 * ⚠️ 历史 bug（2026-09-23 真机验收发现，已修）：本函数曾把 `colorSeed` 当**种子串**
 *     再哈希一次，造成**双重哈希** → 桌面颜色与 App 整体错位。
 *     实证：App 算出色号 5（淡紫），到桌面却显示 `hashString("5") % 6 = 2`（淡绿）；
 *     色号 2 则变成 5。两门课的颜色正好互换，肉眼一看就是错的。
 *
 * ⚠️ 兜底：旧版本数据可能没有 colorSeed / 值不是合法下标 →
 *     退回按课程名哈希，绝不越界崩溃。
 */
private fun pickColorIndex(course: JSONObject?): Int {
    if (course == null) return 0
    // ① 正常路径：colorSeed 就是色号，直接用
    val idx = course.optInt("colorSeed", -1)
    if (idx in BLOCK_DRAWABLES.indices) return idx
    // ② 兜底：按课程名哈希（兼容旧数据 / 字段缺失 / 非法值）
    val seed = course.optString("name", "")
    if (seed.isEmpty()) return 0
    val mod = hashString(seed) % BLOCK_DRAWABLES.size
    return if (mod in BLOCK_DRAWABLES.indices) mod else 0
}

/* ══════════════════ PendingIntent ══════════════════ */

/**
 * 构建点击打开 App 的 PendingIntent
 *
 * 【为什么用包名 + 启动 Intent】
 *   不用 `getLaunchIntentForPackage` 的结果直接用的原因：它拿到的 Intent 有时不带
 *   FLAG_ACTIVITY_NEW_TASK，从小部件（非 Activity 上下文）启动会抛 AndroidRuntimeException。
 *   这里显式设置 flag，保证从桌面点得动。
 *
 * 【⚠️ flags 必须用 or 累加，不要整体赋值】
 *   早先写成 `launch.flags = NEW_TASK or CLEAR_TOP` 会把 launch intent 自带的
 *   flags 抹掉（如 FLAG_ACTIVITY_RESET_TASK_IF_NEEDED），在部分 ROM 上表现为
 *   「点了没反应」或「打开了但白屏」。这里改成 or 上去，只增不减。
 *
 * 【⚠️ requestCode 必须唯一且稳定】
 *   早先用固定 requestCode=0，若 App 别处也用 0 创建过 PendingIntent，
 *   Android 会认为「同一个 PendingIntent」而复用它（参数不同也照复用），
 *   导致点击行为被前一个 intent 顶替。这里用 widgetId 作 requestCode ——
 *   同一个小部件实例稳定、不同实例互不干扰。
 *
 * 【FLAG_IMMUTABLE】
 *   Android 12+ 强制要求显式声明 IMMUTABLE / MUTABLE，否则直接抛异常。
 *   FLAG_IMMUTABLE 是 API 23 引入，minSdk 21 → 需版本判断。
 */
private fun buildOpenAppIntent(context: Context, appWidgetId: Int): PendingIntent? {
    return try {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return null
        // or 上去，只增不减（见上面注释）
        launch.flags = launch.flags or
            Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        // data 加一个唯一 Uri：让不同 widgetId 的 PendingIntent 真正区分开。
        // 不加的话，即使 requestCode 不同，Intent 相同仍可能被判定为同一实例。
        launch.data = Uri.parse("qkb://widget/$appWidgetId")

        var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
        }
        PendingIntent.getActivity(context, appWidgetId, launch, piFlags)
    } catch (e: Throwable) {
        Log.e(TAG, "构建打开 App 的 PendingIntent 失败", e)
        null
    }
}

/* ══════════════════ RemoteViews 组装 ══════════════════ */

/**
 * 组装一个完整的 RemoteViews（头部 + 静态课程卡 + 点击）。
 *
 * ⚠️ 布局用 `qkb_widget_static`。**改布局「结构」时必须换一个 layout 文件名**：
 *    launcher 会先问 `RemoteViews.canRecycleView(View)`「这棵新树能复用在旧视图上吗」，
 *    布局 id 相同就只做 reapply（等价 patch）→ 新控件 id 在旧树里找不到 → **静默无效**。
 *    换了文件名 → 布局 id 变 → 强制 apply() 重新 inflate。
 *
 * @return 组装好的 RemoteViews；构建失败时抛异常，由调用方兜底
 */
private fun buildRemoteViews(context: Context, appWidgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.qkb_widget_static)

    // ── 解析数据 ──
    var todayDay = 1
    var week = 1
    var today: JSONArray? = null
    val raw = readWidgetJson(context)
    if (raw.isNotEmpty()) {
        try {
            val root = JSONObject(raw)
            todayDay = root.optInt("todayDay", 1)
            week = root.optInt("week", 1)
            today = root.optJSONArray("today")
        } catch (e: Throwable) {
            // 数据损坏（写入中断 / 手工改坏）→ 降级，不能崩
            Log.e(TAG, "数据解析失败，降级为无课表", e)
        }
    }
    val count = today?.length() ?: 0

    // ── 头部：今天 + 周次 ──
    val dayLabel = WEEKDAY_LABELS.getOrElse(todayDay - 1) { "今天" }
    val title = if (count > 0) "今天 · $dayLabel · $count 节" else "今天 · $dayLabel"
    views.setTextViewText(R.id.qkb_head_title, title)
    views.setTextViewText(R.id.qkb_head_week, "第 $week 周")

    // ── 逐槽填充课程卡 ──
    // 槽位写死在 XML 里（RemoteViews 不能动态加视图）：够用的显示、不够的 GONE。
    // GONE 掉的卡片不占高度，剩下的会因 weight=1 自动摊满 ——
    // 所以「今天只有 1 节课」时那张卡就是**整屏大卡片**。
    val shown = minOf(count, CARD_SLOTS)
    for (i in 0 until CARD_SLOTS) {
        val ids = CARD_IDS[i]
        when {
            i < shown -> {
                val c = today?.optJSONObject(i)
                views.setViewVisibility(ids[0], View.VISIBLE)
                views.setTextViewText(ids[1], timeRange(c))
                views.setTextViewText(ids[2], sectionText(c))
                views.setTextViewText(ids[3], str(c, "name"))
                views.setTextViewText(ids[4], str(c, "place"))
                // 圆角背景按课程色号切换（同课同色，与 App 一致）
                try {
                    val idx = pickColorIndex(c)
                    views.setInt(ids[0], "setBackgroundResource", BLOCK_DRAWABLES[idx])
                } catch (e: Throwable) {
                    // 设色失败不影响内容显示 —— 用 XML 里的默认色继续
                    Log.w(TAG, "设置课程色块背景失败", e)
                }
            }
            i == 0 && count == 0 -> {
                // ── 空态：第 0 张卡占满整个区域，给一句明确提示 ──
                views.setViewVisibility(ids[0], View.VISIBLE)
                views.setTextViewText(ids[1], "今天没有课")
                views.setTextViewText(ids[2], "")
                views.setTextViewText(ids[3], "好好休息")
                views.setTextViewText(ids[4], "")
                try {
                    views.setInt(ids[0], "setBackgroundResource", BLOCK_DRAWABLES[0])
                } catch (e: Throwable) {
                    Log.w(TAG, "设置空态背景失败", e)
                }
            }
            else -> {
                views.setViewVisibility(ids[0], View.GONE)
            }
        }
    }

    // ── 溢出提示：今天课程多于槽位时，底部提示还有几节 ──
    if (count > CARD_SLOTS) {
        views.setViewVisibility(R.id.qkb_more, View.VISIBLE)
        views.setTextViewText(R.id.qkb_more, "还有 ${count - CARD_SLOTS} 节 · 点开查看")
    } else {
        views.setViewVisibility(R.id.qkb_more, View.GONE)
    }

    // ── 点击打开 App（几乎全区域可点）──
    // ⚠️ RemoteViews **没有「根布局点击」API**，只能逐个 setOnClickPendingIntent。
    //    早先只给标题挂了点击 → 用户点课程内容（占 90% 面积）毫无反应。
    //    GONE 的视图挂点击无害，所以这里不做显隐判断。
    val pi = buildOpenAppIntent(context, appWidgetId)
    if (pi != null) {
        views.setOnClickPendingIntent(R.id.qkb_root, pi)
        views.setOnClickPendingIntent(R.id.qkb_header, pi)
        views.setOnClickPendingIntent(R.id.qkb_head_title, pi)
        views.setOnClickPendingIntent(R.id.qkb_head_week, pi)
        views.setOnClickPendingIntent(R.id.qkb_more, pi)
        for (ids in CARD_IDS) {
            views.setOnClickPendingIntent(ids[0], pi)
        }
    }

    return views
}

/**
 * 渲染单个小组件实例。
 *
 * ⚠️ 下面那行 Log 是**刻意留的**：`onUpdate` / `renderAllWidgets` 这条链路
 *    以前成功时完全不打日志，导致「组件不刷新」时无法判断到底是没跑到、
 *    还是跑到了但 launcher 不渲染。留一行 INFO，`adb logcat -s QkbWidget` 就能看见。
 */
fun renderWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
    try {
        appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, appWidgetId))
        Log.i(TAG, "已渲染小组件 #$appWidgetId")
    } catch (e: Throwable) {
        Log.e(TAG, "渲染小组件失败", e)
    }
}

/**
 * 由 `QkbWidgetProvider.onUpdate` 调用：把系统给过来的实例 id 缓存进 SP。
 *
 * ⚠️ 这是 `renderAllWidgets` 能可靠拿到实例 id 的**唯一稳定来源**
 *    —— 系统的 `onUpdate` 直接把 `appWidgetIds` 传来，不经过
 *    `getAppWidgetIds`（那个 API 在本机取不到东西，见 KEY_WIDGET_IDS 的注释）。
 */
fun cacheWidgetIds(context: Context, appWidgetIds: IntArray) {
    try {
        val text = appWidgetIds.joinToString(",")
        val sp = context.getSharedPreferences(WIDGET_KEY, Context.MODE_PRIVATE)
        sp.edit().putString(KEY_WIDGET_IDS, text).commit()
        Log.i(TAG, "已缓存实例 id=[$text]")
    } catch (e: Throwable) {
        Log.w(TAG, "缓存实例 id 失败", e)
    }
}

/**
 * 读取缓存的实例 id。解析失败 / 没缓存过 → 返回空数组（由调用方回退去查系统）。
 */
private fun readCachedWidgetIds(context: Context): IntArray {
    return try {
        val sp = context.getSharedPreferences(WIDGET_KEY, Context.MODE_PRIVATE)
        val raw = sp.getString(KEY_WIDGET_IDS, "") ?: ""
        if (raw.isEmpty()) {
            intArrayOf()
        } else {
            // 逗号分隔 → int 数组。非法片段直接丢掉，不抛异常。
            val out = ArrayList<Int>()
            for (piece in raw.split(",")) {
                val n = piece.trim().toIntOrNull()
                if (n != null) out.add(n)
            }
            out.toIntArray()
        }
    } catch (e: Throwable) {
        Log.w(TAG, "读取缓存实例 id 失败", e)
        intArrayOf()
    }
}

/**
 * 刷新「所有」该组件的实例。
 * 桌面可能同时摆了多个 4×2，updatePeriodMillis 到点时系统只会唤醒 provider，
 * 需要我们遍历所有 id 逐个更新。
 *
 * ─────────────────────────────────────────────────────────────
 * 🔥🔥 **为什么是直接调用，而不是「发广播让 Provider 去刷」**
 *
 * 早先的写法是：App 写完 SP → `sendBroadcast(ACTION_REFRESH)` →
 * 想由 `QkbWidgetProvider.onReceive` 收到后再刷新。
 * **在真机（vivo OriginOS / Android 13）上实测这条链路不生效**：
 * 用 `adb shell am broadcast -a com.qingkebiao.widget.REFRESH -n <Provider>`
 * 显式广播（连 `setComponent` 都设好了）照样 `Broadcast completed: result=0`，
 * 但 `onReceive` 里的日志一条都不出现，桌面也不更新。
 * （App 在前台、进程存活、`stopped=false` 的情况下同样如此，已逐一排除。）
 *
 * 而 `AppWidgetManager.updateAppWidget(...)` **本来就允许组件所属 App 自己直接调用**
 * —— 我们刚写完 SP，进程正活着，直接刷新是最短、最可靠的一条路，
 * **完全不需要跨进程广播**。少一个环节就少一类「静默失败」。
 *
 * ── 2026-09-20 补：**实例 id 从哪来**（这一版才真正修好） ──
 *   换成直接调用后，日志**仍然一条不出**。排查排除了「代码没编进包」
 *   （dex 里 `批量刷新完成`/`已渲染小组件` 都在、旧广播串已归零）
 *   和「日志被缓冲刷掉」（用 `logcat -s QkbWidget` 实时流式抓过）。
 *
 *   剩下的可能只剩**静默提前返回** —— 原写法是：
 *     `val ids = mgr.getAppWidgetIds(cn) ?: return`     ← 返回 null 就无声退出
 *   `getAppWidgetIds` 是**平台类型**，底层返回 null 时 Kotlin 直接 `return`，
 *   **既不报错也不打日志**。本机（vivo）大概率就是这种情况。
 *
 *   ✅ 所以这一版：
 *     ① **id 优先读 `onUpdate` 缓存**（SP 里的 `widgetIds`）—— 不经过那个 API；
 *     ② 缓存没有才回退去查系统；
 *     ③ **所有提前返回都先打日志**，以后再看日志就能直接定位卡在哪一步。
 *
 * ⚠️ 另一条独立的刷新通路仍然保留：系统按 `updatePeriodMillis`（30 分钟）
 *    回调 `QkbWidgetProvider.onUpdate`，它内部也会走本函数。
 * ─────────────────────────────────────────────────────────────
 */
fun renderAllWidgets(context: Context) {
    // 🔬 探针①：函数入口。**必须在 try 之外** ——
    //    万一下面某行抛的是 Error（catch(Exception) 接不住），也一定能留下痕迹。
    Log.i(TAG, "[renderAllWidgets] 进入")
    try {
        val mgr = AppWidgetManager.getInstance(context)
        if (mgr == null) {
            Log.w(TAG, "[renderAllWidgets] 拿不到 AppWidgetManager → 跳过刷新")
            return
        }
        Log.i(TAG, "[renderAllWidgets] 拿到 AppWidgetManager")

        // ① 首选：onUpdate 缓存下来的 id
        var ids = readCachedWidgetIds(context)
        var source = "缓存"

        // ② 回退：向系统查询
        if (ids.isEmpty()) {
            source = "查询"
            val cn = ComponentName(context.packageName, PROVIDER_CLASS)
            val queried = mgr.getAppWidgetIds(cn)
            if (queried == null) {
                Log.w(TAG, "[renderAllWidgets] getAppWidgetIds 返回 null 且无缓存 → 跳过")
                return
            }
            ids = queried
        }

        val idText = ids.joinToString(",")
        Log.i(TAG, "[renderAllWidgets] 来源=$source 实例=[$idText]")

        if (ids.isEmpty()) {
            Log.w(TAG, "[renderAllWidgets] 无实例（来源=$source）→ 桌面没摆组件？跳过")
            return
        }

        for (id in ids) {
            renderWidget(context, mgr, id)
        }
        Log.i(TAG, "[renderAllWidgets] 全部完成")
    } catch (e: Throwable) {
        // ⚠️ catch **Throwable**：详见 syncData 里的同名说明。
        Log.e(TAG, "[renderAllWidgets] 异常", e)
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 供 UTS 侧（index.uts）调用的入口。
 *
 * 【为什么包一层 object】
 *   UTS 调用原生 Kotlin 的规范做法是：Kotlin 侧把能力以**静态方法**（object）
 *   暴露，UTS 侧 import 后直接调用。这样不需要在 UTS 里做任何 Android 类型操作，
 *   也就绕开了「UTS 与 Kotlin 类型系统不一致」的各种坑。
 *
 * 【包名必须与 UTS 插件默认包名一致】
 *   uts.sdk.modules.qkbWidget（由插件目录 qkb-widget 驼峰化而来）→ 一致时可以
 *   直接 import，无需额外配置。
 * ─────────────────────────────────────────────────────────────
 */
object QkbNative {

    /**
     * 写入小组件数据并立即刷新桌面。
     *
     * @param json 形如 {"today":[...],"todayDay":3,"week":3,"updatedAt":...}
     *             —— 结构见 utils/widget.js 的 buildWidgetPayload
     * @return 是否写入成功
     */
    fun syncData(context: Context?, json: String): Boolean {
        // 🔬 探针：这是「App 主动刷新」链路的入口，必须能看见它有没有跑到。
        //    用 Log.i（与其它正常流日志同级）—— 同级日志在本机已验证可见。
        //    ⚠️ 长度先取到局部变量：UTS 的 Kotlin 前端对字符串模板里的复杂表达式较敏感。
        val jsonLen = json.length
        Log.i(TAG, "[syncData] 进入，json 长度=$jsonLen")
        if (context == null) {
            Log.e(TAG, "拿不到 App 上下文，跳过同步")
            return false
        }
        return try {
            val sp = context.getSharedPreferences(WIDGET_KEY, Context.MODE_PRIVATE)
            // commit 而非 apply：要确保落盘后再喊刷新，否则组件可能读到旧值
            val ok = sp.edit().putString("data", json).commit()
            Log.i(TAG, "[syncData] SP 已写入 ok=$ok")
            if (!ok) {
                Log.e(TAG, "SharedPreferences 写入失败")
                return false
            }
            // ★ 直接刷新桌面，**不经过广播**（理由见 renderAllWidgets 上方的长注释）
            renderAllWidgets(context)
            true
        } catch (e: Throwable) {
            // ⚠️ 必须 catch **Throwable** 而不是 Exception：
            //    `NoSuchMethodError` / `LinkageError` / `ExceptionInInitializerError`
            //    都是 Error 不是 Exception，用 `catch (e: Exception)` **接不住**，
            //    会被 UTS 桥接层悄悄兜走 → **零日志、零报错**，极难排查。
            Log.e(TAG, "syncData 异常", e)
            false
        }
    }

    /**
     * 清除小组件数据（App 内「清空全部课程」时调用）。
     * 让桌面立刻显示"暂无课程"，而不是残留旧课表。
     */
    fun clearData(context: Context?): Boolean {
        if (context == null) return false
        return try {
            val sp = context.getSharedPreferences(WIDGET_KEY, Context.MODE_PRIVATE)
            sp.edit().remove("data").commit()
            // ★ 同上：直接刷新，不走广播
            renderAllWidgets(context)
            true
        } catch (e: Throwable) {
            Log.e(TAG, "clearData 异常", e)
            false
        }
    }
}
