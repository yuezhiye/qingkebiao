/**
 * 导出：把当前课程导出为「标准文本 v2」格式
 *
 * 设计依据：方案书 3.6 节 / 4.1 节
 *   导出后用户可分享/备份，也能再次粘贴回导入页（往返无损）
 */

import { WEEKDAY_LABELS } from '../config/times.js'
import { formatWeeksShort } from './week.js'

/**
 * 把周次三元组转回标准文本字段
 * [[6,9],[10,12,"单"]] → "6-9,10-12单"
 */
function weeksToText(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) return '1-16'
  return formatWeeksShort(weeks)
}

/**
 * 单门课 → 一行标准文本
 * @param {object} c
 * @returns {string}
 */
export function courseToLine(c) {
  const day = WEEKDAY_LABELS[c.day - 1] || '一'
  const section =
    c.sectionStart === c.sectionEnd
      ? String(c.sectionStart)
      : `${c.sectionStart}-${c.sectionEnd}`

  return [
    c.name || '未命名',
    c.place || '未知',
    c.teacher || '未知',
    day,
    section,
    weeksToText(c.weeks)
  ].join('|')
}

/**
 * 导出的表头行 —— **必须以 `#` 开头**。
 * 解析器（parser.js#parseText）会把 `#` 开头的行当作注释跳过，
 * 这样导出的文本才能原样粘回导入页（往返无损）。
 * ⚠️ 旧版这里漏了 `#`，导致导出的文本粘回来必报 1 条格式错误、导入按钮被禁用。
 */
export const EXPORT_HEADER = '#课程名|地点|老师|星期|节次|周次'

/**
 * 全部课程 → 标准文本（表头以 # 开头，属注释行，解析时可安全忽略）
 * @param {object[]} courses
 * @param {{withHeader?: boolean}} [opts]
 * @returns {string}
 */
export function exportToText(courses, opts = {}) {
  const { withHeader = true } = opts
  const list = Array.isArray(courses) ? courses : []

  // 排序：按天 → 节次，导出的文本更规整
  const sorted = list.slice().sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.sectionStart - b.sectionStart
  })

  const lines = sorted.map(courseToLine)
  if (!withHeader) return lines.join('\n')

  return [EXPORT_HEADER, ...lines].join('\n')
}

/**
 * 生成导出文件名（含日期，便于用户区分多份备份）
 * @param {Date} [d]
 */
export function exportFileName(d = new Date()) {
  const p = (n) => (n < 10 ? '0' + n : String(n))
  return `轻课表-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.txt`
}

/**
 * 全部课程 → JSON（结构化备份，借鉴 shiguangschedule 的 JSON 导入/导出思路）
 * 导出结果可整段粘贴回导入页还原（parseJson 会重新生成 id）
 * @param {object[]} courses
 * @returns {string} 缩进 2 空格的 JSON 文本
 */
export function exportToJson(courses) {
  const list = Array.isArray(courses) ? courses : []

  const sorted = list.slice().sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.sectionStart - b.sectionStart
  })

  return JSON.stringify(
    {
      app: '轻课表',
      version: 1,
      courses: sorted.map((c) => ({
        name: c.name || '未命名',
        place: c.place || '未知',
        teacher: c.teacher || '未知',
        day: c.day,
        sectionStart: c.sectionStart,
        sectionEnd: c.sectionEnd,
        weeks: Array.isArray(c.weeks) && c.weeks.length ? c.weeks : [[1, 30]],
        colorSeed: c.colorSeed || c.name || '未命名'
      }))
    },
    null,
    2
  )
}

/** JSON 备份文件名 */
export function exportJsonFileName(d = new Date()) {
  const p = (n) => (n < 10 ? '0' + n : String(n))
  return `轻课表-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
}
