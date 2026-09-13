/**
 * 教务系统「学生课表」本地解析器（纯函数，无副作用）
 *
 * ── 为什么需要它 ──
 * 教务系统导出的 `.xls` 其实是一个 **HTML 表格**，用 `rowspan` 表达连堂课
 * （`rowspan="4"` = 一次连上 4 节 = 2 个节次块）。
 * 但这份信息一旦经过「AI 的文件通道」或「WPS 另存为文本」，`rowspan` 就会丢掉，
 * 连堂课会被压成 2 节。本模块直接解析原始内容，绕开中间环节，把连堂完整还原。
 *
 * ── 支持的输入（上层用 looksLikeHtmlTable 自动识别）──
 *   HTML 原文 —— 记事本打开 .xls 复制而来，含 rowspan → **100% 准确**
 *   ⚠️ 不支持 WPS「另存为文本」等丢失 rowspan 的通道：
 *      那类文本里「真没课的空格」与「被合并吃掉的格子」长得一模一样，
 *      空行推断法有约 5% 误判，已按项目维护者 2026-09-12 裁定整体移除（原 parseGridTable）。
 *
 * ── 输出结构与 parser.js 的 parseText() 完全一致 ──
 * 便于 import.vue 无感切换解析器。
 */

import { makeCourseId } from './id.js'
import { parseWeeks } from './parser.js'

/** 网格行：每 2 节一行，与 App 渲染的 5 行严格对应（见方案书 3.4） */
const GRID_ROWS = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [9, 10]
]

/** 星期文案：网格列号 0~6 → 周一~周日（仅用于报错定位，不参与解析） */
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** 单元格里一门课的写法：课程名 (课程代码) (老师) (周次 地点) */
const RE_COURSE = /([^()]+?)\s*\(([A-Za-z0-9._-]+)\)\s*\(([^()]+)\)\s*\(([^()]+)\)/g

/** 节次行标签 */
const RE_PERIOD_LABEL = /^第([一二三四五六七八九十]+)节$/

/* ────────────────────────── 输入识别 ────────────────────────── */

/**
 * 是否像「教务系统导出的 HTML 表格」
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeHtmlTable(text) {
  const s = String(text == null ? '' : text)
  if (/manualArrangeCourseTable/i.test(s)) return true
  return /<t[dh][\s>]/i.test(s) && /<tr[\s>]/i.test(s)
}

/* ────────────────────────── 工具 ────────────────────────── */

/** 去标签 + 解实体 + 压缩空白 */
function cleanHtml(raw) {
  return String(raw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 把「占几节」拆成若干条网格行记录（App 不做跨行渲染，见方案甲） */
function splitByGridRows(start, span) {
  const end = start + span - 1
  const out = []
  for (const [a, b] of GRID_ROWS) {
    if (start <= a && b <= end) out.push([a, b])
  }
  return out
}

/**
 * 把一格文本里的所有课程抽出来，生成课程对象
 * @param {string} text 已清洗的格内文本
 * @param {number} dayIdx 0-based 列号
 * @param {number} start 起始节
 * @param {number} span 占几节
 * @returns {object[]}
 */
/**
 * 把一格文本里的所有课程抽出来，生成课程对象
 *
 * ⚠️ 跨度对不齐网格时**不能返回空**：`splitByGridRows` 只认「完整网格行」，
 *    所以 `span=1`（单节课 / 无 rowspan）和「起始节为偶数」都拿不到任何网格行。
 *    旧行为是直接 `return []` → 这门课**静默消失**（或被下游判成解析失败）。
 *    现在退化为「按原始跨度建一条」——与 `parser.js`「兼容单节」的约定一致
 *    （`parseSections('5')` → `{5,5}`），渲染按 `from` 落进 5 行网格。
 *
 * @param {string} text 已清洗的格内文本
 * @param {number} dayIdx 0-based 列号
 * @param {number} start 起始节
 * @param {number} span 占几节
 * @returns {{courses: object[], courseLike: boolean, failedWeeks: number}}
 *   `courseLike` —— 这格文本「看起来像课程」（含 ≥2 组括号）。
 *   用来区分「**本来就不是课**」（如「上午」「见通知」「（待定）」→ 安静忽略）
 *   与「**像课却没解析出来**」（→ 必须报错，别静默丢课）。
 */
function extractCourses(text, dayIdx, start, span) {
  const out = []
  const slots = splitByGridRows(start, span)
  const effSlots = slots.length ? slots : [[start, Math.min(start + span - 1, 10)]]

  // 课程写法 `名 (课程代码) (老师) (周次 地点)` 至少 2 组括号；「（待定）」只有 1 组，不算
  const courseLike = (text.match(/\(/g) || []).length >= 2
  let failedWeeks = 0

  RE_COURSE.lastIndex = 0
  let m
  while ((m = RE_COURSE.exec(text + ' ')) !== null) {
    const name = m[1].trim()
    if (!name) continue

    const rest = m[4].trim()
    const sp = rest.indexOf(' ')
    const weekRaw = sp === -1 ? rest : rest.slice(0, sp)
    const place = sp === -1 ? '' : rest.slice(sp + 1).trim()

    const weeks = parseWeeks(weekRaw)
    if (!weeks) {
      failedWeeks += 1
      continue
    }

    for (const [a, b] of effSlots) {
      out.push({
        id: makeCourseId(),
        name,
        place: place || '未知',
        teacher: m[3].trim() || '未知',
        day: dayIdx + 1,
        sectionStart: a,
        sectionEnd: b,
        weeks,
        colorSeed: name
      })
    }
  }
  return { courses: out, courseLike, failedWeeks }
}

/** 组装与 parseText 一致的返回结构 */
function buildResult(courses, errors, total) {
  const names = new Set(courses.map((c) => c.name))
  return {
    courses,
    errors,
    total,
    okCount: courses.length,
    courseNames: names.size
  }
}

/* ────────────────────────── HTML 表格 ────────────────────────── */

/**
 * 解析教务系统导出的 HTML 表格（严格按 rowspan 展开）
 *
 * ⚠️ 关键：rowspan 会让**后续行少掉那个 <td>**，
 *    因此必须维护 carry[col]（该列还被上面占用几行），占用期间不消耗 td。
 *    若按「第 N 个 td = 星期 N」直接取值，列号会整体错位。
 *
 * ── 真实表格形状（2026-09-13 用一份真实教务 .xls 实测确认，请勿"简化"掉这些防御）──
 *   · 表格前 3 行是 `colspan="8"` 的横幅行（标题 / 学年学期 / 学号），第 4 行是空行，
 *     之后才是 10 个节次行（第一节 ~ 第十节）。
 *   · **`colspan` 确实存在**，但只出现在上面那些**非节次行**上；
 *     本函数只处理 `cells[0]` 匹配 `第X节` 的行，所以横幅行被整体跳过、不影响列号。
 *     ⚠️ 这条免疫是**靠"节次标签过滤"换来的**，不是靠处理 colspan：
 *        若将来教务把 colspan 用到**节次行**里，carry 状态机会错位 —— 届时必须真正实现 colspan 占位。
 *   · 节次行的 td 数各不相同（实测 8/5/7/4/8/3/5/3/8/4），**carry 机制不可省**。
 *   · 实测 `rowspan` 只有 `2` 与 `4`，起始节清一色奇数 → 不会踩到「跨度对不齐网格」那条退化分支。
 *
 * @param {string} html
 * @returns {{courses: object[], errors: object[], total: number, okCount: number, courseNames: number}}
 */
export function parseHtmlTable(html) {
  const text = String(html == null ? '' : html)
  const tableStart = text.search(/<table[^>]*manualArrangeCourseTable/i)
  const body = tableStart >= 0 ? text.slice(tableStart) : text

  const trs = body.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || body.match(/<tr>[\s\S]*?<\/tr>/gi) || []

  // 先定位「节次行」
  const rows = trs.map((tr) => {
    const cells = (tr.match(/<td([^>]*)>([\s\S]*?)<\/td>/gi) || []).map((c) => {
      const mA = /^<td([^>]*)>/i.exec(c)
      const attrs = mA ? mA[1] : ''
      const inner = c.replace(/^<td[^>]*>/i, '').replace(/<\/td>$/i, '')
      return { attrs, text: cleanHtml(inner) }
    })
    return cells
  })

  const periodRowIdx = []
  rows.forEach((cells, i) => {
    if (cells.length && RE_PERIOD_LABEL.test(cells[0].text)) periodRowIdx.push(i)
  })

  if (periodRowIdx.length === 0) {
    return buildResult([], [{ line: 1, reason: '没找到课表表格（应含 第一节~第十节 的行）', raw: '' }], 0, [])
  }

  const courses = []
  const errors = []
  const carry = {} // col -> 还被上面占用几行
  let total = 0

  periodRowIdx.forEach((ri, pi) => {
    const period = pi + 1
    const cells = rows[ri]
    const queue = cells.slice(1) // 去掉节次标签格
    let qi = 0

    for (let col = 0; col < 7; col++) {
      if (carry[col] > 0) {
        carry[col] -= 1
        continue
      }
      if (qi >= queue.length) break

      const cell = queue[qi]
      qi += 1

      const mSpan = /rowspan[^0-9]*([0-9]+)/i.exec(cell.attrs || '')
      const span = mSpan ? Number(mSpan[1]) : 1
      if (span > 1) carry[col] = span - 1

      if (!cell.text) continue
      total += 1
      // HTML 里 rowspan 就是标准答案，无需推断
      const r = extractCourses(cell.text, col, period, span)

      if (r.courses.length === 0) {
        // 只有在「这格看着像课」时才报错：否则「上午」「见通知」「（待定）」这类
        // 非课程文本会凭空产生 error → canImport=false → **把本来能导入的课表拦下**。
        if (!r.courseLike) continue

        errors.push({
          line: period,
          reason:
            `周${DAY_LABELS[col] || '?'} 第 ${period} 节 这一格` +
            (r.failedWeeks > 0 ? '有课但周次无法识别，没能导入' : '有课程内容但没能解析出来') +
            `（原文：「${cell.text.slice(0, 40)}」），请对照原课表核对后手动补录`,
          raw: cell.text.slice(0, 60)
        })
        continue
      }

      for (const c of r.courses) courses.push(c)
    }
  })

  if (courses.length === 0) {
    errors.push({ line: 1, reason: '表格里没解析出任何课程，请确认复制的是完整课表', raw: '' })
  }

  return buildResult(courses, errors, total)
}
