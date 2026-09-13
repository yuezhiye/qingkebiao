/**
 * 冲突检测与网格构建（纯函数）
 *
 * 设计依据：方案书 3.4 节
 *   - 连堂渲染：sectionStart-sectionEnd 跨多节的课程渲染为一个跨行色块（非拆成多格）
 *   - 冲突显示：同一格同节次多门课，按当前周过滤；同周冲突时上下分半显示 + 角标标注周次
 *
 * 网格模型：5 行 × 7 列
 *   行 = 每 2 节合成一行：1-2 / 3-4 / 5-6 / 7-8 / 9-10
 *   列 = 周一 ~ 周日
 */

import { GRID_ROWS } from '../config/times.js'
import { isCourseInWeek } from './week.js'

/**
 * 判断某门课是否落入某个网格行
 * @param {object} course
 * @param {{from: number, to: number}} row
 */
export function courseInRow(course, row) {
  // 有交集即算落入该行
  return !(course.sectionEnd < row.from || course.sectionStart > row.to)
}

/**
 * 构建单周网格数据
 *
 * @param {object[]} courses 全部课程
 * @param {number} week 要显示的周次
 * @param {{showWeekend?: boolean, showEvening?: boolean}} [opts]
 * @returns {{
 *   rows: Array<{
 *     rowIndex: number,
 *     from: number, to: number,
 *     cells: Array<{
 *       day: number,
 *       courses: object[],       // 该格命中的课程（0 / 1 / 多门）
 *       conflict: boolean,       // 是否同格多门（需上下分半 + 角标）
 *       spanRows: number         // 该课跨几行（连堂时 > 1）
 *     }>
 *   }>
 * }}
 */
export function buildGrid(courses, week, opts = {}) {
  const { showWeekend = true, showEvening = true } = opts

  // 1. 先按周过滤
  const active = (courses || []).filter((c) => isCourseInWeek(c, week))

  // 2. 按显示设置过滤
  const visible = active.filter((c) => {
    if (!showWeekend && c.day >= 6) return false
    if (!showEvening && c.sectionStart >= 9) return false
    return true
  })

  const dayCount = showWeekend ? 7 : 5

  const rows = GRID_ROWS
    // 隐藏晚间时去掉最后一行（9-10 节）
    .filter((r) => showEvening || r.from < 9)
    .map((row, rowIndex) => {
      const cells = []
      for (let day = 1; day <= dayCount; day++) {
        const hits = visible.filter(
          (c) => c.day === day && courseInRow(c, row)
        )
        cells.push({
          day,
          rowIndex,
          courses: hits,
          conflict: hits.length > 1,
          // 该格内是否存在跨越本行的连堂课（用于高度渲染）
          spanRows: hits.length
            ? Math.max(...hits.map((c) => countSpanRows(c)))
            : 1
        })
      }
      return { rowIndex, from: row.from, to: row.to, cells }
    })

  return { rows, dayCount }
}

/** 某门课跨越多少个网格行（连堂 1-2 节 = 1 行；1-4 节 = 2 行） */
export function countSpanRows(course) {
  let n = 0
  for (const r of GRID_ROWS) {
    if (courseInRow(course, r)) n++
  }
  return Math.max(n, 1)
}

/**
 * 取「今日课程」列表：今天的课，按开始节次排序
 * @param {object[]} courses
 * @param {number} day 1~7
 * @param {number} week
 * @returns {object[]}
 */
export function getTodayCourses(courses, day, week) {
  return (courses || [])
    .filter((c) => c.day === day && isCourseInWeek(c, week))
    .sort((a, b) => a.sectionStart - b.sectionStart)
}

/**
 * 计算「距下节课还有 xx 分钟」
 *
 * 设计依据：方案书 3.6 节 —— 今日课程卡片含距离下节课开始的实时倒计时
 * 约束：离线零权限、零网络，纯本地时间计算
 *
 * @param {object[]} todayCourses 今日课程（已按节次排序）
 * @param {Array<{section:number,start:string,end:string}>} timeSlots
 * @param {Date} [now]
 * @returns {{
 *   status: 'before' | 'ongoing' | 'break' | 'ended' | 'none',
 *   text: string,          // 展示文案
 *   minutes: number|null,  // 剩余分钟（before/ongoing 时有意义）
 *   current: object|null,  // 正在上的课
 *   next: object|null      // 下一节课
 * }}
 */
export function getCountdown(todayCourses, timeSlots, now = new Date()) {
  const list = todayCourses || []
  if (list.length === 0) {
    return { status: 'none', text: '今天没有课', minutes: null, current: null, next: null }
  }

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const slotOf = (sec) => timeSlots.find((s) => s.section === sec)
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }

  // 找正在上的课
  let current = null
  for (const c of list) {
    const s = slotOf(c.sectionStart)
    const e = slotOf(c.sectionEnd)
    if (!s || !e) continue
    const start = toMin(s.start)
    const end = toMin(e.end)
    if (start == null || end == null) continue
    if (nowMin >= start && nowMin <= end) {
      current = c
      break
    }
  }

  if (current) {
    const e = slotOf(current.sectionEnd)
    const end = toMin(e.end)
    const left = Math.max(0, end - nowMin)
    return {
      status: 'ongoing',
      text: `正在上 · 还有 ${left} 分钟下课`,
      minutes: left,
      current,
      next: null
    }
  }

  // 找下一节课
  const next = list.find((c) => {
    const s = slotOf(c.sectionStart)
    if (!s) return false
    const start = toMin(s.start)
    return start != null && start > nowMin
  })

  if (next) {
    const s = slotOf(next.sectionStart)
    const start = toMin(s.start)
    const left = start - nowMin
    const text = left >= 60
      ? `距下节课还有 ${Math.floor(left / 60)} 小时 ${left % 60} 分钟`
      : `距下节课还有 ${left} 分钟`
    return { status: 'before', text, minutes: left, current: null, next }
  }

  // 全部上完
  return { status: 'ended', text: '今日课程已结束', minutes: null, current: null, next: null }
}
