/*
 * 轻课表 · 桌面小组件 · AppWidgetProvider
 *
 * 【为什么是 .kt 而不是 .uts】
 *   Android 系统要通过 AndroidManifest.xml 里的 android:name 反射实例化这个类
 *   （`uts.sdk.modules.qkbWidget.QkbWidgetProvider`）。UTS 编译器的产物是 UTS 模块，
 *   **不保证**其中定义的 class 会变成可被系统实例化的 Kotlin 类 —— 实测打包后
 *   Manifest 里 receiver 指向的类并不存在，系统静默忽略，桌面上就找不到小组件。
 *   → 必须在原生 .kt 文件里定义。（不能叫 index.kt，`index` 是 UTS 保留名）
 *
 * 这是 Android 系统真正调度的那个类。系统在下列时机回调它：
 *   onUpdate        — 到达 updatePeriodMillis（最短 30 分钟）、或用户刚把组件加到桌面
 *   onEnabled       — 第一个该组件的实例被添加到桌面
 *   onDisabled      — 最后一个实例被移除
 *
 * ⚠️ 本类**不覆盖 `onReceive`** —— 系统那几个 action（APPWIDGET_UPDATE 等）
 *    由 `AppWidgetProvider` 基类已经处理好了，我们不需要插手。
 *    曾经还覆盖过 `onReceive` 去处理一个自定义的「刷新」广播，
 *    但那条链路在真机上不生效（见 `WidgetData.kt#renderAllWidgets` 上方的长注释），
 *    已改为 App 写完 SP 后**直接调用** `renderAllWidgets`，广播机制整体删除。
 *
 * 【4×2 · 今天课程 · 静态卡片】
 *   组件只显示**今天**的课，最多 3 张圆角课程卡，每张含 时间 / 节次 / 课名 / 地点。
 *   全部渲染在 `WidgetData.kt#buildRemoteViews` 里，本文件只负责调度。
 *   （上一版用 ListView 做横向翻页，真机上 collection 链路不工作，已回退，见 WidgetData.kt）
 *
 * 【⚠️ 类名不能随便改】
 *   AndroidManifest.xml 里 receiver 的 android:name 写的是
 *   uts.sdk.modules.qkbWidget.QkbWidgetProvider —— 包名 uts.sdk.modules.qkbWidget
 *   由插件目录 qkb-widget 驼峰化而来；类名 QkbWidgetProvider 必须与之完全一致。
 *   三处（本文件类名 / AndroidManifest / WidgetData.PROVIDER_CLASS）必须同步改。
 *
 * 【线程注意】
 *   onUpdate 回调发生在主线程。这里只读 SharedPreferences + 组装 RemoteViews，
 *   都是毫秒级操作，不需要切线程。**不要在这里做网络/耗时计算**（本项目也不联网）。
 */

package uts.sdk.modules.qkbWidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.util.Log
// R 类与本文件同包（uts.sdk.modules.qkbWidget），直接引用即可，无需 import。
// ⚠️ 本文件**不再**引用任何 R.id：内容全部由 WidgetData.kt#buildRemoteViews 组装。

/** 日志标签，与 WidgetData.kt 保持一致 */
private const val TAG = "QkbWidget"

class QkbWidgetProvider : AppWidgetProvider() {

    /**
     * 系统周期回调 / 组件首次添加。
     * appWidgetIds 是「当前需要更新的实例 id 数组」——桌面摆了多个就多个。
     *
     * ⚠️ 这里刻意**不用 renderAllWidgets**，而是逐个传 appWidgetId：
     *    每个实例要绑定**自己的** PendingIntent（requestCode = widgetId），
     *    否则多个小组件会共用同一个 PendingIntent。
     *
     * 【🔥 2026-09-18 起：不再有 collection 相关的调用】
     *   上一版这里还会调 `notifyAppWidgetViewDataChanged(appWidgetIds, R.id.qkb_list)`
     *   去刷 ListView 的数据源。改成静态布局后，RemoteViews 里已经没有 ListView，
     *   那个调用一并去掉（`R.id.qkb_list` 只存在于已停用的旧布局里）。
     *   详见 WidgetData.kt 头部「架构变更」说明。
     */
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // ⚠️ 这行日志是刻意留的：以前这条链路成功时完全静默，
        //    出问题时无法区分「onUpdate 没跑到」和「跑了但 launcher 不渲染」。
        //
        // ⚠️ 注意写法：**先把拼接结果取出到局部变量，再放进字符串模板**。
        //    UTS 的 Kotlin 前端**不支持模板里嵌套双引号**
        //    （写成 `"${ids.joinToString(",")}"` 会报 Syntax error: Expecting ')'）。
        val idText = appWidgetIds.joinToString(",")
        Log.i(TAG, "onUpdate 触发，实例=[$idText]")

        // ★ 把系统给过来的 id 缓存进 SP。
        //   这是 App 侧主动刷新时唯一稳定可靠的「实例 id 来源」
        //   —— 系统的 onUpdate 直接传 id，不经过 getAppWidgetIds
        //   （那个 API 在本机取不到东西，见 WidgetData.kt 的 KEY_WIDGET_IDS 注释）。
        cacheWidgetIds(context, appWidgetIds)

        for (id in appWidgetIds) {
            renderWidget(context, appWidgetManager, id)
        }
    }

    /** 第一个实例被添加到桌面 */
    override fun onEnabled(context: Context) {
        Log.i(TAG, "小组件已添加到桌面")
    }

    /** 最后一个实例被移除。本项目不占资源（无服务、无定时器），无需清理。 */
    override fun onDisabled(context: Context) {
        Log.i(TAG, "小组件已从桌面移除")
    }
}
