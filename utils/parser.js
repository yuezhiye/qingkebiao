/**
 * 标准文本解析器 + JSON 结构化解析器（纯函数，无副作用，便于单元测试）
 *
 * 输入一：标准文本（人工手写 / 旧版 AI 输出）
 *   格式：课程名|地点|老师|星期|节次|周次
 *   示例：形势与政策|某某教学楼101教室|张老师|一|1-2|1-16
 *
 * 输入二：JSON 结构化数据（AI 按提示词生成 / 设置页导出的备份）
 *   格式：{"courses":[{"name","place","teacher","day","sectionStart","sectionEnd","weeks"}]}
 *   优点：结构无歧义、逐字段校验报错、跨学校通用（格式适配交给 AI）
 *
 * 健壮性要求（方案书 4.3）：
 *   - 逐条解析，非法字段 → 报「第 N 条错误」并说明原因
 *   - 星期 / 节次 / 周次全部走白名单校验
 *   - 不做任何 DOM / storage 操作
 */

import { makeCourseId } from './id.js'

/** 星期汉字 → 数字（1~7） */
const WEEKDAY_MAP = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7
}

/** 周次令牌的白名单正则 */
const RE_WEEK_TOKEN = /^(\d{1,2})(?:-(\d{1,2}))?(单|双)?$/
/** 节次令牌：单节 `5` 或连堂 `1-2` */
const RE_SECTION_TOKEN = /^(\d{1,2})(?:-(\d{1,2}))?$/

/**
 * 解析单个周次令牌 → 三元组 [起周, 止周, 单双?]
 * 支持：`1-16` / `15` / `1-8` / `10-12单` / `3双`
 * @param {string} token
 * @returns {[number, number] | [number, number, string] | null}
 */
export function parseWeekToken(token) {
  const t = String(token).trim()
  if (!t) return null
  const m = RE_WEEK_TOKEN.exec(t)
  if (!m) return null

  const start = Number(m[1])
  const end = m[2] === undefined ? start : Number(m[2])
  const parity = m[3]

  if (start < 1 || start > 30 || end < 1 || end > 30) return null
  if (end < start) return null

  return parity ? [start, end, parity] : [start, end]
}

/**
 * 解析周次字段 → 三元组数组
 * 支持逗号分隔的多个片段：`1-8,10-16` / `2-3,6-13` / `1-16单`
 * 也支持 `全` / `每周` / `全周` 表示全学期每周（回退为 [[1, 全学期周数]]）
 * @param {string} raw
 * @returns {Array<[number, number] | [number, number, string]> | null} null 表示非法
 */
export function parseWeeks(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return null

  // 全学期写法：AI 生成文本时偶尔会写「全」
  if (/^(全|全周|每周|全部)$/.test(s)) return [[1, 30]]

  // 全角逗号 / 顿号容错
  const parts = s.replace(/[，、]/g, ',').split(',').filter(Boolean)
  if (parts.length === 0) return null

  const out = []
  for (const p of parts) {
    const tuple = parseWeekToken(p)
    if (!tuple) return null
    out.push(tuple)
  }
  return out
}

/**
 * 解析节次字段 → { sectionStart, sectionEnd }
 * 支持：`1-2`（连堂）/ `5`（单节）
 * @param {string} raw
 * @returns {{sectionStart: number, sectionEnd: number} | null}
 */
export function parseSections(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return null
  const m = RE_SECTION_TOKEN.exec(s)
  if (!m) return null

  const start = Number(m[1])
  const end = m[2] === undefined ? start : Number(m[2])
  if (start < 1 || start > 10 || end < 1 || end > 10) return null
  if (end < start) return null

  return { sectionStart: start, sectionEnd: end }
}

/**
 * 生成课程 id —— 统一走 utils/id.js，避免各处重复实现导致碰撞
 * （曾因本文件与 course-edit.vue 各写一份、都用 Date.now()+随机数而撞 id）
 */
function makeId() {
  return makeCourseId()
}

/**
 * 解析一行标准文本
 * @param {string} line 已 trim 的原始行
 * @param {number} lineNo 行号（1-based，用于报错文案）
 * @returns {{ok: true, course: object} | {ok: false, line: number, reason: string, raw: string}}
 */
export function parseLine(line, lineNo) {
  const raw = String(line == null ? '' : line).trim()

  // 空行单独处理（调用方通常会先过滤）
  if (!raw) {
    return { ok: false, line: lineNo, reason: '空行', raw }
  }

  // 全角竖线容错
  const parts = raw.replace(/｜/g, '|').split('|').map((x) => x.trim())

  if (parts.length !== 6) {
    return {
      ok: false,
      line: lineNo,
      reason: `字段数应为 6，实际 ${parts.length} 个（用竖线 | 分隔）`,
      raw
    }
  }

  const [name, place, teacher, dayRaw, sectionRaw, weekRaw] = parts

  if (!name) {
    return { ok: false, line: lineNo, reason: '课程名为空', raw }
  }

  // ── 星期白名单 ──
  const dayKey = dayRaw.replace(/周|星期/g, '').trim()
  const day = WEEKDAY_MAP[dayKey]
  if (!day) {
    return {
      ok: false,
      line: lineNo,
      reason: `星期「${dayRaw}」无法识别，应为 一~日 中的单个汉字`,
      raw
    }
  }

  // ── 节次 ──
  const sections = parseSections(sectionRaw)
  if (!sections) {
    return {
      ok: false,
      line: lineNo,
      reason: `节次「${sectionRaw}」无法识别，应写 1-2 / 3-4 / 5-6 / 7-8 / 9-10（每 2 节一行）；也兼容单个数字如 5`,
      raw
    }
  }

  // ── 周次 ──
  const weeks = parseWeeks(weekRaw)
  if (!weeks) {
    return {
      ok: false,
      line: lineNo,
      reason: `周次「${weekRaw}」无法识别，应为 1-16 / 15 / 1-8,10-16 / 3-16单 / 全 等写法`,
      raw
    }
  }

  return {
    ok: true,
    course: {
      id: makeId(),
      name,
      place: place || '未知',
      teacher: teacher || '未知',
      day,
      sectionStart: sections.sectionStart,
      sectionEnd: sections.sectionEnd,
      weeks,
      // colorSeed 存课程名，保证同一门课跨学期/跨导入稳定同色
      colorSeed: name
    }
  }
}

/**
 * 解析整段标准文本
 * @param {string} text 用户粘贴的原文
 * @returns {{
 *   courses: object[],
 *   errors: Array<{line: number, reason: string, raw: string}>,
 *   total: number,      // 参与解析的非空行数
 *   okCount: number,    // 成功行数
 *   courseNames: number // 去重后的课程门数
 * }}
 */
/** 表头字段名（按序），用于识别「导出的表头行」 */
const HEADER_FIELDS = ['课程名', '地点', '老师', '星期', '节次', '周次']

/**
 * 这一行是不是「表头」？
 *
 * ⚠️ 必须**字段级**判定，不能用整行字符串精确比对：
 *    用户手里的导出文本可能带空格（`课程名 | 地点 | …`）、全角竖线（`课程名｜地点｜…`），
 *    或经过编辑器中转。精确比对会漏 → 表头被当数据行 → 报「星期「星期」无法识别」
 *    → `canImport=false` → **导入按钮被禁用**（实测确认）。
 *    同时兼容新版导出（表头带 `#` 前缀）。
 */
function isHeaderLine(trimmed) {
  const fields = trimmed
    .replace(/｜/g, '|')
    .split('|')
    .map((x) => x.trim().replace(/^#/, ''))
  return fields.length === HEADER_FIELDS.length && fields.every((f, i) => f === HEADER_FIELDS[i])
}

export function parseText(text) {
  const rawLines = String(text == null ? '' : text).split(/\r\n|\r|\n/)

  const courses = []
  const errors = []
  let total = 0

  rawLines.forEach((line, idx) => {
    const trimmed = line.trim()
    // 完全空行跳过，不计入 total（避免末尾换行产生假报错）
    if (!trimmed) return
    // 表头行（带 # 前缀 / 带空格 / 全角竖线等各种写法）→ 跳过，不计入 total
    if (isHeaderLine(trimmed)) return

    const res = parseLine(trimmed, idx + 1)

    // `#` 开头的行：**解析不了才当注释**。
    // 这样既保住「课程名本身以 # 开头的合法数据行」（如 `#3号楼实训|实验楼|王老师|一|1-2|1-16`，
    // 字段齐全 → 正常导入），又让用户随手写的 `# 备注` 被安静跳过。
    if (!res.ok && trimmed.startsWith('#')) return

    total += 1
    if (res.ok) {
      courses.push(res.course)
    } else {
      errors.push({ line: res.line, reason: res.reason, raw: res.raw })
    }
  })

  const names = new Set(courses.map((c) => c.name))

  return {
    courses,
    errors,
    total,
    okCount: courses.length,
    courseNames: names.size
  }
}

/* ────────────────────────── JSON 结构化导入 ────────────────────────── */

/** 剥掉 AI 可能包裹的 markdown 代码栏（```json … ```） */
function stripCodeFence(text) {
  return String(text == null ? '' : text)
    .replace(/^\s*```[a-zA-Z]*[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

/**
 * 是否像 JSON 导入内容（剥掉代码栏后以 { 或 [ 开头）
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeJson(text) {
  const s = stripCodeFence(text)
  return s.startsWith('{') || s.startsWith('[')
}

/** 星期字段容错：数字 1~7 / 「一」~「日」/ 「周一」/「星期三」 */
function normalizeJsonDay(raw) {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : null
  }
  if (typeof raw === 'string') {
    return WEEKDAY_MAP[raw.replace(/周|星期/g, '').trim()] || null
  }
  return null
}

/**
 * 周次字段容错：
 *   · 字符串 → 走 parseWeeks（"1-16" / "1-8,10-16" / "3-16单" / "全"）
 *   · 数组   → [[1,16]] / [[3,16,"单"]] / [{from,to,parity?}] 逐段校验
 */
function normalizeJsonWeeks(raw) {
  if (typeof raw === 'string') return parseWeeks(raw)
  if (!Array.isArray(raw) || raw.length === 0) return null

  const out = []
  for (const seg of raw) {
    let tuple = null
    if (Array.isArray(seg)) {
      const [a, b, p] = seg
      if (typeof a !== 'number' || typeof b !== 'number') return null
      if (p !== undefined && p !== '单' && p !== '双') return null
      tuple = p ? [a, b, p] : [a, b]
    } else if (seg && typeof seg === 'object') {
      const a = seg.from != null ? seg.from : seg.start
      const b = seg.to != null ? seg.to : seg.end
      if (typeof a !== 'number' || typeof b !== 'number') return null
      if (seg.parity !== undefined && seg.parity !== '单' && seg.parity !== '双') return null
      tuple = seg.parity ? [a, b, seg.parity] : [a, b]
    } else if (typeof seg === 'string') {
      tuple = parseWeekToken(seg)
    }
    if (!tuple) return null
    const [a, b] = tuple
    if (a < 1 || a > 30 || b < 1 || b > 30 || b < a) return null
    out.push(tuple)
  }
  return out
}

/** 节次字段容错：sectionStart/sectionEnd 数字，或 section 字符串 "1-2" / "5" */
function normalizeJsonSections(item) {
  if (item.sectionStart != null || item.sectionEnd != null) {
    const s = Number(item.sectionStart)
    const e = Number(item.sectionEnd)
    if (!Number.isInteger(s) || !Number.isInteger(e)) return null
    if (s < 1 || s > 10 || e < 1 || e > 10 || e < s) return null
    return { sectionStart: s, sectionEnd: e }
  }
  return parseSections(item.section != null ? item.section : item.sections)
}

/** 错误信息里附带的原文片段（截断，防止超长 JSON 刷屏） */
function jsonSnippet(item) {
  try {
    const s = JSON.stringify(item)
    return s.length > 60 ? s.slice(0, 60) + '…' : s
  } catch (e) {
    return ''
  }
}

/** 组装与 parseText 一致的返回结构 */
function buildJsonResult(courses, errors, total) {
  const names = new Set(courses.map((c) => c.name))
  return { courses, errors, total, okCount: courses.length, courseNames: names.size }
}

/**
 * 解析 JSON 结构化课表
 * 接受三种顶层形态：{"courses":[…]} / {"courseList":[…]} / […]
 * 逐条校验，错误定位到「第 N 条」；任何一条非法都不影响其他条目
 *
 * @param {string} text 用户粘贴的 JSON（允许带 markdown 代码栏）
 * @returns {{courses: object[], errors: Array<{line:number, reason:string, raw:string}>, total:number, okCount:number, courseNames:number}}
 */
export function parseJson(text) {
  const stripped = stripCodeFence(text)

  let data = null
  try {
    data = JSON.parse(stripped)
  } catch (e) {
    return buildJsonResult([], [
      {
        line: 1,
        reason: 'JSON 无法解析：请检查括号、引号、逗号是否完整（只粘贴 JSON 本身，不要带代码块标记）',
        raw: stripped.slice(0, 60)
      }
    ], 0)
  }

  const list = Array.isArray(data)
    ? data
    : data && Array.isArray(data.courses)
      ? data.courses
      : data && Array.isArray(data.courseList)
        ? data.courseList
        : null

  if (!list) {
    return buildJsonResult([], [
      {
        line: 1,
        reason: 'JSON 顶层应为 {"courses": [...]}，或直接一个课程数组 [...]',
        raw: stripped.slice(0, 60)
      }
    ], 0)
  }

  const courses = []
  const errors = []

  list.forEach((item, idx) => {
    const no = idx + 1
    const fail = (reason) => errors.push({ line: no, reason, raw: jsonSnippet(item) })

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('该条不是对象，应为 {"name":…, "day":…, …}')
      return
    }

    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) {
      fail('缺少课程名 name')
      return
    }

    const day = normalizeJsonDay(item.day != null ? item.day : item.weekday)
    if (!day) {
      fail(`day「${JSON.stringify(item.day != null ? item.day : item.weekday)}」无法识别，应为 1~7（周一~周日）`)
      return
    }

    const sections = normalizeJsonSections(item)
    if (!sections) {
      fail(`节次无法识别，应填 sectionStart/sectionEnd（1~10 的整数），或 section 写 "1-2" / "5"`)
      return
    }

    const weeks = normalizeJsonWeeks(item.weeks)
    if (!weeks) {
      fail(`weeks「${JSON.stringify(item.weeks)}」无法识别，应为 [[1,16]] / [[3,16,"单"]] / "1-8,10-16" / "全"`)
      return
    }

    const place = typeof item.place === 'string' ? item.place.trim()
      : typeof item.location === 'string' ? item.location.trim()
      : typeof item.room === 'string' ? item.room.trim() : ''
    const teacher = typeof item.teacher === 'string' ? item.teacher.trim() : ''

    courses.push({
      id: makeId(),
      name,
      place: place || '未知',
      teacher: teacher || '未知',
      day,
      sectionStart: sections.sectionStart,
      sectionEnd: sections.sectionEnd,
      weeks,
      colorSeed: name
    })
  })

  return buildJsonResult(courses, errors, list.length)
}

/**
 * 检测课程集合中的时段冲突
 * 冲突定义：同一天 + 节次区间有交集（说明同格多门课）
 * @param {object[]} courses
 * @returns {{格子: string, count: number}[]} 仅返回有冲突的格子
 */
export function detectConflicts(courses) {
  const buckets = new Map()

  for (const c of courses) {
    for (let s = c.sectionStart; s <= c.sectionEnd; s++) {
      const key = `${c.day}-${s}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(c)
    }
  }

  // 按「天-起始节」聚合去重，避免连堂课在同一格被数多次
  const conflictSlots = new Map()
  for (const [key, list] of buckets) {
    if (list.length < 2) continue
    const [day, sec] = key.split('-').map(Number)
    const slotKey = `${day}-${sec}`
    if (!conflictSlots.has(slotKey)) {
      conflictSlots.set(slotKey, new Set(list.map((c) => c.id)))
    } else {
      list.forEach((c) => conflictSlots.get(slotKey).add(c.id))
    }
  }

  return Array.from(conflictSlots.entries()).map(([k, ids]) => {
    const [day, section] = k.split('-').map(Number)
    return { day, section, count: ids.size }
  })
}
