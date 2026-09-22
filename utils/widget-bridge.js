/**
 * 桌面小组件 · 原生桥接层（**仅 App 端编译**）
 *
 * 【为什么要单独一个文件，而不是写在 widget.js 里】
 *   uni-app 的 UTS 插件编译，是靠**静态分析 import 语句**触发的。
 *   也就是说，`import * as QkbWidget from '@/uni_modules/qkb-widget'`
 *   必须是一个**顶层静态 import**，插件才会进入构建期依赖图 → 才会真正被编译。
 *
 *   但这条 import 有两个副作用：
 *     1. H5 / 小程序端没有该插件 → 必须靠 `#ifdef APP-PLUS` 编译期剔除
 *     2. **Node 不认识 `#ifdef`** → 自测里一旦 import 到含该语句的文件，
 *        Node 会尝试解析 `@/uni_modules/qkb-widget` 并报 ERR_MODULE_NOT_FOUND
 *
 *   所以把「静态 import + 桥接调用」单独关在本文件里，
 *   只由 App 端真正需要的代码引用；纯函数（组装/裁剪）留在 widget.js，
 *   继续被 Node 自测直接 import。两边互不污染。
 *
 * ⚠️ 本文件**不要**被 H5 / 小程序 或 Node 自测直接 import。
 */

// #ifdef APP-PLUS
import * as QkbWidget from '@/uni_modules/qkb-widget'
// #endif

/**
 * 把组装好的数据包推给原生侧（写 SharedPreferences + 通知桌面重绘）
 *
 * @param {string} json 由 buildWidgetPayload 组装的 JSON 串
 * @returns {boolean} 是否同步成功
 */
export function pushToNative(json) {
  // #ifdef APP-PLUS
  try {
    if (QkbWidget && typeof QkbWidget.syncWidgetData === 'function') {
      return QkbWidget.syncWidgetData(json)
    }
    // 插件未安装 / 未打自定义基座时走到这里 —— 静默返回，不影响 App 主流程
    return false
  } catch (e) {
    console.warn('[widget] UTS 插件不可用（未打自定义基座？），跳过桌面同步', e)
    return false
  }
  // #endif

  // #ifndef APP-PLUS
  return false
  // #endif
}

/**
 * 清空原生侧的小组件数据（清空全部课程 / 恢复默认时调用）
 * @returns {boolean}
 */
export function clearNative() {
  // #ifdef APP-PLUS
  try {
    if (QkbWidget && typeof QkbWidget.clearWidgetData === 'function') {
      return QkbWidget.clearWidgetData()
    }
    return false
  } catch (e) {
    console.warn('[widget] UTS 插件不可用，跳过桌面清理', e)
    return false
  }
  // #endif

  // #ifndef APP-PLUS
  return false
  // #endif
}
