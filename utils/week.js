/**
 * 周次工具：当前周计算、课程是否在第 N 周上课、周次文案格式化
 *
 * 设计依据：方案书 3.3 节
 *   当前周 = floor((今天 - 2026-08-31) / 7) + 1，钳制在 [1, totalWeeks]
 *   weeks 三元组：[起周, 止周] 或 [起周, 止周, "单"|"双"]
 */

/**
 * 将 "YYYY-MM-DD" 解析为本地零点的 Date（避免时区偏移导致差一天）
 * @param {string} s
 * @returns {Date|null}
 */
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 取某天的零点（本地时区），消除时分秒干扰 */
export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 相差天数（b - a），按本地零点计算 */
export function diffDays(a, b) {
  const MS = 24 * 60 * 60 * 1000
  return Math.round((startOfDay(b) - startOfDay(a)) / MS)
}

/**
 * 计算今天是第几周
 * @param {string} startDate 第 1 周周一，"YYYY-MM-DD"
 * @param {number} totalWeeks 总周数
 * @param {Date} [today]
 * @returns {number} 1 ~ totalWeeks（超出范围时钳制）
 */
export function getCurrentWeek(startDate, totalWeeks = 20, today = new Date()) {
  const start = parseDate(startDate)
  if (!start) return 1

  const days = diffDays(start, today)
  // 开学前也显示第 1 周（避免出现 0 或负周）
  if (days < 0) return 1

  const week = Math.floor(days / 7) + 1
  return Math.min(Math.max(week, 1), totalWeeks)
}

/**
 * 判断某门课在第 week 周是否上课
 * @param {{weeks: Array<[number, number] | [number, number, string]>}} course
 * @param {number} week
 * @returns {boolean}
 */
export function isCourseInWeek(course, week) {
  const weeks = course && course.weeks
  if (!Array.isArray(weeks) || weeks.length === 0) return true // 无周次信息 = 每周

  for (const tuple of weeks) {
    if (!Array.isArray(tuple) || tuple.length < 2) continue
    const [from, to, parity] = tuple
    if (week < from || week > to) continue

    if (parity === '单' && week % 2 === 0) continue
    if (parity === '双' && week % 2 === 1) continue
    return true
  }
  return false
}

/**
 * 把 weeks 三元组格式化为可读文案
 * [[6,9],[10,12,"单"]] → "第 6-9 周 + 第 10-12 周（单）"
 * @param {Array} weeks
 * @returns {string}
 */
export function formatWeeks(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) return '每周'

  // 「全」解析出的 [[1,30]] 归一显示为「每周」
  if (weeks.length === 1 && weeks[0][0] === 1 && weeks[0][1] >= 30) return '每周'

  const parts = weeks.map((t) => {
    if (!Array.isArray(t) || t.length < 2) return ''
    const [from, to, parity] = t
    const range = from === to ? `第 ${from} 周` : `第 ${from}-${to} 周`
    return parity ? `${range}（${parity}）` : range
  })

  return parts.filter(Boolean).join(' + ') || '每周'
}

/**
 * 短文案（网格内色块用，空间紧张）
 * [[6,9],[10,12,"单"]] → "6-9周 + 10-12单"
 */
export function formatWeeksShort(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) return '每周'

  // 「全」解析出的 [[1,30]] 归一显示为「每周」
  if (weeks.length === 1 && weeks[0][0] === 1 && weeks[0][1] >= 30) return '每周'

  const parts = weeks.map((t) => {
    if (!Array.isArray(t) || t.length < 2) return ''
    const [from, to, parity] = t
    const range = from === to ? `${from}` : `${from}-${to}`
    return parity ? `${range}${parity}` : range
  })

  return parts.filter(Boolean).join(',')
}

/**
 * 角标文案：冲突格显示各课周次（方案书 3.4 节「角标标注各自周次」）
 * @param {object[]} courses 该格内的多门课
 * @returns {string[]} 每门课一个短文案，如 ["15周", "16-18周"]
 */
export function conflictBadges(courses) {
  return (courses || []).map((c) => {
    const txt = formatWeeksShort(c.weeks)
    return txt === '每周' ? '每周' : `${txt}周`
  })
}

/**
 * 求今天是星期几（1=周一 … 7=周日）
 * JS 原生 getDay() 里 0=周日，需转换
 */
export function getTodayWeekday(d = new Date()) {
  const g = d.getDay()
  return g === 0 ? 7 : g
}

/** 网格表头用的日期号（两位），如 "31" / "01" */
export function formatDayNumber(date) {
  const n = date.getDate()
  return n < 10 ? '0' + n : String(n)
}
