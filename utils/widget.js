/**
 * 桌面小组件 · App 侧数据桥（纯函数，可被自测覆盖）
 *
 * 职责：把课表数据组装成小组件需要的精简 JSON，然后交给 UTS 插件落盘。
 *
 * 【为什么单独一个文件，而不是塞进 index.vue】
 *   1. 组装逻辑是纯函数 → 能在 Node 自测里跑，不依赖真机
 *   2. UTS 插件在 H5 / 小程序端不存在，条件编译只留在这个文件里，不污染页面代码
 *   3. 「写什么给桌面」是可审计的一处 —— 桌面会暴露在锁屏前，必须是我们要给的那点信息
 *
 * 【隐私边界（重要）】
 *   传给桌面的**只有**：课程名、地点、起止时间、节次、色号。
 *   不含教师姓名 —— 桌面可能被旁人看到，教师姓名没必要外露（也少一份暴露面）。
 *   这条边界写在 toWidgetCourse 里，改的时候请注意。
 */

import { getCurrentWeek, getTodayWeekday, isCourseInWeek } from './week.js'
import { hashString, COLOR_POOL } from './color.js'

/** SharedPreferences 键 —— 与 UTS 侧 WidgetData.WIDGET_KEY 必须一致 */
export const WIDGET_KEY = 'qkb_widget_v1'

/**
 * 色号池长度 —— 与 res/drawable/qkb_block_0..5.xml 的数量**必须一致**。
 * 原生侧按 colorSeed 选 `R.drawable.qkb_block_<seed>`，
 * 若这里改了池长而没同步 drawable，原生会退化成默认色（不崩，但颜色会错）。
 */
export const COLOR_POOL_SIZE = COLOR_POOL.length

/**
 * 取课程色号（0 ~ COLOR_POOL_SIZE-1）
 *
 * ⚠️ **算法必须与原生侧 Kotlin 版的 hashWidgetColor 保持一致**，
 *    否则 App 里显示淡青、桌面却显示淡粉。
 *    这里复用 utils/color.js 的 hashString（djb2 变体），
 *    Kotlin 侧逐位照抄同样的位移与加法。
 *
 * 为什么要传「色号」而不是「色值」：
 *    RemoteViews 不能动态改 drawable 颜色，只能 `setBackgroundResource(预置资源id)`。
 *    所以预置 6 个圆角 drawable，传下标让原生自己选。
 *
 * @param {{colorSeed?: string, name?: string}} c
 * @returns {number} 0 ~ COLOR_POOL_SIZE-1
 */
export function pickColorSeed(c) {
  const seed = (c && (c.colorSeed || c.name)) || ''
  return hashString(seed) % COLOR_POOL_SIZE
}

/**
 * 单门课 → 精简对象
 *
 * 【字段说明】
 *   name / place / start / end —— 展示用（隐私边界：**不含教师姓名**）
 *   colorSeed                  —— 色号 0~5，原生据此选圆角背景 drawable
 *   sectionStart / sectionEnd  —— 节次号，原生用于显示「第 N-M 节」
 *
 * @param {object} c 完整课程对象
 * @param {Array} timeSlots 节次时间表
 * @returns {object|null}
 */
function toWidgetCourse(c, timeSlots) {
  if (!c || !c.name) return null
  const s = (timeSlots || []).find((x) => x.section === c.sectionStart)
  const e = (timeSlots || []).find((x) => x.section === c.sectionEnd)
  return {
    name: String(c.name),
    // 地点可能为空（某些课没有教室）→ 给空串，由展示侧决定要不要省掉分隔符
    place: c.place ? String(c.place) : '',
    start: s ? s.start : '',
    end: e ? e.end : '',
    colorSeed: pickColorSeed(c),
    sectionStart: c.sectionStart,
    sectionEnd: c.sectionEnd
  }
}

/**
 * 取某一天的课程（按开始节次排序），转成小组件格式
 *
 * @param {object[]} courses 全部课程
 * @param {number} day 1~7
 * @param {number} week 当前周
 * @param {Array} timeSlots
 * @returns {object[]}
 */
export function pickDay(courses, day, week, timeSlots) {
  return (courses || [])
    .filter((c) => c.day === day && isCourseInWeek(c, week))
    .sort((a, b) => a.sectionStart - b.sectionStart)
    .map((c) => toWidgetCourse(c, timeSlots))
    .filter(Boolean)
}

/**
 * 组装小组件数据包
 *
 * 【当前小组件形态】4×2 · **只显示今天** · 每节课一个 2×2 圆角色块 ·
 *   横向可滑动查看第 3、4、… 节。
 *   → 因此 `today` 是原生侧真正消费的数组；`tomorrow` 仍保留在包里
 *     （体积可忽略，且未来若加「明天」模式不必再改数据契约）。
 *
 * @param {object} state { courses, semester, timeSlots }
 * @param {Date} [now]
 * @returns {object} 可直接 JSON.stringify 的数据包
 */
export function buildWidgetPayload(state, now = new Date()) {
  const { courses = [], semester = {}, timeSlots = [] } = state || {}

  let week = 1
  try {
    week = getCurrentWeek(semester.startDate, semester.totalWeeks || 20, now)
  } catch {
    week = 1
  }

  let today = 1
  try {
    today = getTodayWeekday(now)
  } catch {
    today = 1
  }

  return {
    updatedAt: now.getTime(),
    week,
    today: pickDay(courses, today, week, timeSlots),
    todayDay: today
  }
}

/**
 * 把数据包推给桌面小组件
 *
 * 条件编译说明：
 *   · APP-PLUS（App 端）→ 走 UTS 插件写 SharedPreferences
 *   · 其他端（H5 / 小程序）→ 整个函数体为空，不报错
 *
 * ⚠️ 【本文件保持「纯函数」，原生调用由调用方注入】
 *   UTS 插件必须靠**顶层静态 import** 才会被编译（见 widget-bridge.js 头注释），
 *   但那条 import 会污染 Node 自测（Node 不认识 #ifdef，会去解析该路径并报错）。
 *   所以这里**不**直接 import 桥接层，而是把「推送」这一步作为参数传进来：
 *
 *     syncWidget(state, pushToNative)   ← 调用方注入
 *
 *   调用方（App 端页面）从 widget-bridge.js 取 pushToNative 传进来即可。
 *   这样：① 插件被静态 import → 编译得进去；② 本文件仍能被自测直接 import。
 *
 * @param {object} state
 * @param {(json: string) => boolean} [push] 推送实现；缺省时视为不支持的平台，返回 false
 * @returns {boolean} 是否同步成功
 */
export function syncWidget(state, push) {
  let payload
  try {
    payload = buildWidgetPayload(state)
  } catch (e) {
    console.warn('[widget] 组装数据失败，跳过桌面同步', e)
    return false
  }
  if (typeof push !== 'function') return false
  return push(JSON.stringify(payload))
}

/**
 * 清空桌面小组件数据（清空全部课程 / 恢复默认时调用）
 *
 * 同 syncWidget：清空实现由调用方从 widget-bridge.js 注入。
 *
 * @param {() => boolean} [clear] 清空实现；缺省时返回 false
 * @returns {boolean}
 */
export function clearWidget(clear) {
  if (typeof clear !== 'function') return false
  return clear()
}

/**
 * 生成「一行一门课」的展示文案（供自测校核，真机渲染在原生侧）
 *
 * ⚠️ 这不是给原生用的 —— 原生侧有自己的 item 渲染实现（QkbWidgetService.kt）。
 *    这里存在的意义是：**让"要显示成什么样"这件事在 JS 侧也有唯一真源可测**，
 *    避免原生模板与 JS 预期脱节却无人察觉。
 *    当前生产代码**没有**调用它（渲染已全在原生侧），保留供文案类测试使用。
 *
 * @param {object[]} list pickDay 的返回值
 * @param {number} [max=3] 最多显示几条
 * @param {string} [emptyText='暂无课程']
 * @returns {string[]} 每行一条，长度 = max + (有溢出时 1，否则 0)
 */
export function courseLines(list, max = 3, emptyText = '暂无课程') {
  const arr = list || []
  if (arr.length === 0) return [emptyText]

  const lines = []
  for (let i = 0; i < Math.min(max, arr.length); i++) {
    const c = arr[i]
    const time = c.start ? `${c.start} ` : ''
    const line = c.place ? `${time}${c.name} · ${c.place}` : `${time}${c.name}`
    lines.push(line)
  }
  if (arr.length > max) lines.push(`共 ${arr.length} 节`)
  return lines
}
