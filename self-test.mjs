/**
 * 解析器自测（Node 环境直接运行，验证核心逻辑）
 * 运行：node self-test.mjs
 *
 * 注意：这是开发期自测脚本，不参与 App 打包。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import {
  parseText,
  parseWeeks,
  parseSections,
  parseWeekToken,
  looksLikeJson,
  parseJson
} from './utils/parser.js'
import { looksLikeHtmlTable, parseHtmlTable } from './utils/htmlTable.js'
import { exportToText, EXPORT_HEADER } from './utils/exporter.js'

import { decodeText } from './utils/fileImport.js'

let pass = 0
let fail = 0

function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}\n      期望 ${e}\n      实际 ${a}`)
  }
}

console.log('\n── 周次令牌解析 ──')
eq(parseWeekToken('6-9'), [6, 9], '区间 6-9')
eq(parseWeekToken('15'), [15, 15], '单周 15')
eq(parseWeekToken('10-12单'), [10, 12, '单'], '带单周标记')
eq(parseWeekToken('3-16双'), [3, 16, '双'], '带双周标记')
eq(parseWeekToken('abc'), null, '非法输入返回 null')
eq(parseWeekToken('16-3'), null, '倒序区间返回 null')

console.log('\n── 周次字段多段解析 ──')
eq(parseWeeks('2-3,6-13'), [[2, 3], [6, 13]], '逗号分隔两段')
eq(parseWeeks('1-16'), [[1, 16]], '单段')
eq(parseWeeks('1-8，10-16'), [[1, 8], [10, 16]], '全角逗号容错')
eq(parseWeeks('2-13'), [[2, 13]], '两端都多位数')

console.log('\n── 节次解析 ──')
eq(parseSections('1-2'), { sectionStart: 1, sectionEnd: 2 }, '连堂 1-2')
eq(parseSections('5'), { sectionStart: 5, sectionEnd: 5 }, '单节 5')
eq(parseSections('9-10'), { sectionStart: 9, sectionEnd: 10 }, '晚自习 9-10')
eq(parseSections('11'), null, '超出 1~10 范围返回 null')

console.log('\n── 整体课表解析（虚构 fixture）──')
// ⚠️ 本 fixture 是**开发期自测用**的纯虚构数据（self-test.mjs 不参与 App 打包）。
// App 内**不再预置任何示例课表**：首启空白，见 config/courseData.js 文件头。
// 覆盖场景：长课名换行、连堂、单双周、多段周次、同格冲突、晚间课、周末课
const sample = `中国近现代史纲要|第一教学楼A101|陈老师|一|1-2|1-16
程序设计基础|信息楼B203机房|林老师|一|3-4|1-18
高等数学（上）|第一教学楼A305|黄老师|一|5-6|1-18
大学英语（读写译）|外语楼C202|周老师|二|1-2|2-16
概率论与数理统计|第一教学楼A402|孙老师|二|3-4|1-16
体育（羽毛球）|体育馆|许老师|二|5-6|3-17
艺术鉴赏|第二教学楼108|钱老师|二|9-10|4-12
中国近现代史纲要|第一教学楼A101|陈老师|三|1-2|1-8
大学物理（上）|理科楼D501|吴老师|三|1-2|9-17
高等数学（上）|第一教学楼A305|黄老师|三|3-4|1-18
程序设计基础|信息楼B203机房|林老师|三|5-6|2-6,10-14
大学物理（上）|理科楼D501|吴老师|四|1-2|3-17
概率论与数理统计|第一教学楼A402|孙老师|四|3-4|1-16
程序设计基础|信息楼B203机房|林老师|四|5-6|3-6,11-15
艺术鉴赏|第二教学楼108|钱老师|四|7-8|5-13
体育（羽毛球）|体育馆|许老师|五|1-2|3-17
大学英语（读写译）|外语楼C202|周老师|五|3-4|2-16
思想道德与法治|第一教学楼A210|冯老师|五|5-6|1-16
大学生心理健康教育|第二教学楼112|郑老师|六|1-2|2-12
高等数学（上）|第一教学楼A305|黄老师|日|5-6|9-18`
const res = parseText(sample)

// 断言与 fixture 保持同步（fixture 改动时请一并更新此处）
const expectLines = sample.split('\n').filter((l) => l.trim()).length
eq(res.total, expectLines, `共 ${expectLines} 行有效数据`)
eq(res.okCount, expectLines, `全部 ${expectLines} 行解析成功`)
eq(res.errors.length, 0, '无格式错误')
eq(res.courseNames, 10, '去重后 10 门课程')
console.log('     课程清单：', [...new Set(res.courses.map((c) => c.name))].join(' / '))

// ── 隐私扫描：**随包分发的所有文件**都不得含真实课表信息 ──
// 首启不再预置示例数据后，风险点从「示例数据」转为「任何被打进 APK 的文件」，
// 因此这里改为扫全量随包路径（开发期脚本 unpackage/.bak 不在其列）。
//
// ⚠️ 敏感词表**不入库**。原因：这份词表本身就是需要保护的隐私（真实教室名、教师姓名），
//    把要防的东西写进公开仓库，等于自己泄漏自己。故改从本地文件 self-test.local.mjs 读取，
//    该文件已列入 .gitignore，永不提交。缺省时本项自动跳过，不影响其余断言。
//    需要启用防护时，在 self-test.local.mjs 中写：export const LEAK_WORDS = ['…']
let LEAK_WORDS = []
try {
  ;({ LEAK_WORDS } = await import('./self-test.local.mjs'))
} catch {
  LEAK_WORDS = []
}

/** 会被 uni-app 打进包的文件/目录 */
const BUNDLE_PATHS = [
  'App.vue',
  'main.js',
  'pages.json',
  'manifest.json',
  'uni.scss',
  'pages',
  'components',
  'utils',
  'config',
  'static'
]
const TEXT_EXT = new Set(['.vue', '.js', '.json', '.css', '.scss', '.html', '.txt', '.ts'])

function collectFiles(p, out = []) {
  if (!existsSync(p)) return out
  if (statSync(p).isFile()) {
    out.push(p)
    return out
  }
  for (const name of readdirSync(p)) collectFiles(join(p, name), out)
  return out
}

const shipped = BUNDLE_PATHS.flatMap((p) => collectFiles(p))
const scanned = shipped.filter((f) => TEXT_EXT.has(extname(f)))
eq(scanned.length > 0, true, `扫描到 ${scanned.length} 个随包文本文件（防扫描落空导致的假绿）`)

if (LEAK_WORDS.length) {
  const hits = []
  for (const f of scanned) {
    const body = readFileSync(f, 'utf8')
    for (const w of LEAK_WORDS) if (body.includes(w)) hits.push(`${f} → ${w}`)
  }
  eq(hits, [], '随包文件不含真实课表信息' + (hits.length ? `（泄漏：${hits.join(', ')}）` : ''))
} else {
  console.log('  ⚠️ 未找到 self-test.local.mjs（敏感词表不入库）→ 本项隐私扫描跳过')
}

console.log('\n── 错误检测能力 ──')
const bad = parseText(`形势与政策|某某教学楼101教室|张老师|一|1-2|1-16
形势与政策|某某教学楼101教室|张老师|星期九|1-2|1-16
形势与政策|某某教学楼101教室|张老师|一|1-11|1-16
形势与政策|某某教学楼101教室|张老师|一|1-2|7~9
字段不够|某某教学楼|张老师|一|1-2`)
eq(bad.okCount, 1, '仅 1 行通过')
eq(bad.errors.length, 4, '检出 4 行错误')
bad.errors.forEach((e) => console.log(`      第 ${e.line} 行 → ${e.reason}`))

console.log('\n── 边界情况 ──')
const edge = parseText('形势与政策|某某教学楼|张老师|天|1-2|1-16')
eq(edge.errors.length, 0, '"天" 作为星期可识别')
eq(edge.courses[0].day, 7, '"天" 解析为周日')
const edge2 = parseText('体育|体育馆|王老师|五|7-8|1-16双')
eq(edge2.courses[0].weeks, [[1, 16, '双']], '双周标记正确落入三元组')
const edge3 = parseText('大学英语|外语楼B-201|李老师|三|3-4|全')
eq(edge3.errors.length, 0, '"全" 作为周次可识别')
const empty = parseText('')
eq(empty.total, 0, '空文本 total 为 0，不产生假报错')
const trailing = parseText('形势与政策|某某教学楼|张老师|一|1-2|1-16\n\n\n')
eq(trailing.errors.length, 0, '末尾空行不产生假报错')

console.log('\n── 导出 → 再导入（往返无损）──')
// 回归：导出文本原本带一行**没有 # 前缀**的表头，粘回导入页必报
// 「星期「星期」无法识别」→ canImport=false，导入按钮被禁用。
// 修法：parser 跳过 # 开头的行，exporter 的表头加 # 前缀。

const rtCourses = parseText(`高等数学|某某教学楼A-101|张老师|一|1-2|1-16
大学英语|外语楼C-202|李老师|三|3-4|1-8,10-16
体育|体育馆|王老师|五|7-8|1-16双`).courses
eq(rtCourses.length, 3, '准备 3 门课用于往返测试')

const exported = exportToText(rtCourses)
// ⚠️ 这里**故意硬编码**一份真值，而不是直接拿实现里的 EXPORT_HEADER 当基准：
//    同源断言（两边都用同一个常量）会在常量被改错时一起错、照样全绿。
//    先验常量 == 真值，再验输出 == 真值，才是独立的回归防线。
const EXPORT_HEADER_TEXT = '#课程名|地点|老师|星期|节次|周次'
eq(EXPORT_HEADER, EXPORT_HEADER_TEXT, '导出常量与硬编码真值一致（常量被改会在此暴露）')
eq(exported.startsWith('#'), true, '导出文本以 # 开头（表头是注释行）')
eq(exported.split('\n')[0], EXPORT_HEADER_TEXT, '导出首行等于硬编码真值')

const back = parseText(exported)
eq(back.errors.length, 0, '导出文本粘回导入页 → 无格式错误（往返无损）')
eq(back.okCount, 3, '往返后课程条数一致')
eq(
  back.courses.map((c) => c.name).sort(),
  rtCourses.map((c) => c.name).sort(),
  '往返后课程名集合一致'
)
eq(back.courses[2].weeks, [[1, 16, '双']], '往返后单双周标记未丢（体育·1-16双）')
eq(back.total, 3, '往返后 total 不含注释表头行')

// 兼容用户手里已有的旧备份：旧版导出的表头没有 # 前缀
const legacy = exported.replace(EXPORT_HEADER_TEXT, '课程名|地点|老师|星期|节次|周次')
eq(legacy.startsWith('#'), false, '构造出旧版导出文本（表头无 #）')
const backLegacy = parseText(legacy)
eq(backLegacy.errors.length, 0, '旧版导出文本（无 # 表头）也能导入')
eq(backLegacy.okCount, 3, '旧版导出文本往返后条数一致')

// 用户自己在文本里加注释
const withComment = `# 这是我 2026 秋的课表\n${exported}`
eq(parseText(withComment).errors.length, 0, '用户自加的 # 注释行被跳过')
eq(parseText(withComment).total, 3, '注释行不计入 total')

// ── 边界回归：表头/注释判定必须是「字段级」，且不能误伤合法数据行 ──
// 旧实现用整行字符串精确比对表头 → 带空格 / 全角竖线就漏 → 表头被当数据行报错
// → canImport=false → 导入按钮被禁用（实测确认过）
const ONE = '高等数学|某某教学楼A-101|张老师|一|1-2|1-16'
for (const [label, header] of [
  ['无 # 前缀', '课程名|地点|老师|星期|节次|周次'],
  ['带空格', '课程名 | 地点 | 老师 | 星期 | 节次 | 周次'],
  ['全角竖线', '课程名｜地点｜老师｜星期｜节次｜周次'],
  ['带 # 前缀（新版导出）', '#课程名|地点|老师|星期|节次|周次']
]) {
  const r = parseText(`${header}\n${ONE}`)
  eq(r.errors.length, 0, `表头（${label}）被跳过，不产生错误`)
  eq(r.courses.length, 1, `表头（${label}）后那一行正常解析`)
}

// 课程名本身以 # 开头的**合法数据行**不能被当注释丢掉（旧实现会整行静默丢弃）
const sharp = parseText('#3号楼实训|实验楼B-202|王老师|一|1-2|1-16')
eq(sharp.courses.length, 1, '课程名以 # 开头但字段齐全 → 按数据行导入')
eq(sharp.errors.length, 0, '上述行不报错')

// `#` 开头且解析不了 → 当注释安静跳过
const sharpNote = parseText(`# 这是我随手写的备注\n${ONE}`)
eq(sharpNote.courses.length, 1, '# 开头的无字段备注被跳过，后面的课正常导入')
eq(sharpNote.errors.length, 0, '备注行不报错')

/* ────────────────────────────────────────────────────────────
 * 教务系统课表解析（含连堂 rowspan）
 * ⚠️ 以下样例全部虚构，不得使用任何真实课表（隐私约定）
 * ──────────────────────────────────────────────────────────── */
console.log('\n── 教务系统课表解析（虚构样例）──')

const PERIODS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/**
 * 按「格子表」忠实生成表格源码（模拟浏览器渲染前的真实结构）
 * ⚠️ 关键：被 rowspan 占用的格子，后续行**不再输出 <td>**
 * spec: [{row, col, span, text}]  row:1~10  col:0~6
 */
function emitHtmlTable(spec) {
  const carry = {}
  const rows = []
  for (let r = 1; r <= 10; r++) {
    const tds = [`<td>第${PERIODS[r - 1]}节</td>`]
    for (let c = 0; c < 7; c++) {
      if (carry[c] > 0) {
        carry[c] -= 1
        continue
      }
      const cell = spec.find((x) => x.row === r && x.col === c)
      if (cell) {
        tds.push(`<td rowspan="${cell.span}">${cell.text}</td>`)
        if (cell.span > 1) carry[c] = cell.span - 1
      } else {
        tds.push('<td></td>')
      }
    }
    rows.push(`<tr>${tds.join('')}</tr>`)
  }
  return `<table id="manualArrangeCourseTable">${rows.join('')}</table>`
}

/** 生成「WPS 另存为文本」风格的表（rowspan 丢失：被占用的格子变空字段） */
/* （该形态已不支持：原 parseGridTable 空行推断法按项目维护者 2026-09-12 裁定移除，
      「真没课的空格」与「被合并吃掉的格子」无法区分，推断有约 5% 误判） */

// 虚构课表：含 1 门 4 节连堂、1 格挤 2 门课、以及「跨列错位」陷阱
const FIXTURE = [
  { row: 1, col: 0, span: 2, text: '高等数学 (MATH101) (张老师) (1-16 某某教学楼A-101)' },
  { row: 1, col: 1, span: 4, text: '程序设计实训 (CS201) (李老师) (3-8 实验楼B-202)' },
  {
    row: 1,
    col: 2,
    span: 2,
    text: '大学英语 (EN101) (王老师) (1-8 外语楼C-303) 体育 (PE101) (赵老师) (9-16 体育馆)'
  },
  { row: 3, col: 3, span: 2, text: '线性代数 (MATH102) (孙老师) (2-17 某某教学楼A-202)' },
  // 这门课同时验证 rowspan 占位后「列号不漂移」与跨行定位
  { row: 5, col: 1, span: 2, text: '大学物理 (PHY101) (周老师) (9-16 某某教学楼A-303)' },
  { row: 5, col: 4, span: 2, text: '大学化学 (CHEM101) (吴老师) (1-16 实验楼B-303)' },
  { row: 7, col: 5, span: 2, text: '工程制图 (ME101) (郑老师) (1-16 某某教学楼A-404)' },
  { row: 9, col: 6, span: 2, text: '大学语文 (CN101) (冯老师) (1-16 某某教学楼A-505)' }
]

const fakeHtml = emitHtmlTable(FIXTURE)

eq(looksLikeHtmlTable(fakeHtml), true, 'HTML 表格可被识别')
eq(looksLikeHtmlTable('第一节\t高等数学'), false, '普通文本不会被误判为 HTML')

const H = parseHtmlTable(fakeHtml)
console.log('     HTML 路 → 课程条数：', H.courses.length)

eq(H.errors.length, 0, 'HTML 路无错误')
eq(H.courses.length, 10, 'HTML 路共 10 条（4 节连堂拆成 2 条）')
eq(H.courseNames, 9, 'HTML 路去重后 9 门课')

// ── 回归：格子有内容但解析不出课程时，必须报错，不能静默丢课 ──
// 判据是「看着像课」（文本含 ≥2 组括号）；纯标签/备注不算课，应安静忽略（见下一条反向断言）
const H_BAD = parseHtmlTable(
  emitHtmlTable([
    { row: 1, col: 0, span: 2, text: '高等数学 (MATH101) (张老师) (1-16 某某教学楼A-101)' },
    // 三组括号 = 像课程，但周次无法识别 → 必须报错
    { row: 3, col: 2, span: 2, text: '数据结构 (CS301) (钱老师) (周次见教务系统)' }
  ])
)
eq(H_BAD.courses.length, 1, '能解析的那门课照常解析出来')
eq(H_BAD.errors.length > 0, true, '像课程却解析不出 → 报错（不静默丢课）')
eq(H_BAD.errors[0].reason.includes('周三'), true, '报错文案带星期定位（周三）')
eq(H_BAD.errors[0].reason.includes('第 3 节'), true, '报错文案带节次定位（第 3 节）')

// ── 反向回归：节次行里出现**不像课程**的文本，不得报错 ──
// 否则 canImport=false → 把本来能导入的课表整个拦下（实测确认过的阻断风险）
const H_JUNK = parseHtmlTable(
  emitHtmlTable([
    { row: 1, col: 0, span: 2, text: '高等数学 (MATH101) (张老师) (1-16 某某教学楼A-101)' },
    { row: 3, col: 2, span: 2, text: '上午' },
    { row: 5, col: 4, span: 2, text: '见通知' },
    { row: 7, col: 6, span: 2, text: '（待定）' }
  ])
)
eq(H_JUNK.errors.length, 0, '「上午」「见通知」「（待定）」这类非课程文本不产生错误')
eq(H_JUNK.courses.length, 1, '同一张表里的正常课程照常导入')

// ── 跨度对不齐网格：不丢课、也不误报（span=1 单节课 / 起始节为偶数）──
const S1 = parseHtmlTable(
  emitHtmlTable([{ row: 1, col: 0, span: 1, text: '体育 (PE101) (赵老师) (1-16 体育馆)' }])
)
eq(S1.courses.length, 1, 'span=1 单节课：导入成功（旧行为是静默丢弃或报错）')
eq(S1.errors.length, 0, 'span=1 单节课：不报错')
eq(
  [S1.courses[0].sectionStart, S1.courses[0].sectionEnd],
  [1, 1],
  'span=1 时按原始跨度建一条（1-1）'
)

const S2 = parseHtmlTable(
  emitHtmlTable([{ row: 2, col: 0, span: 2, text: '体育 (PE101) (赵老师) (1-16 体育馆)' }])
)
eq(S2.courses.length, 1, '起始节为偶数（第 2 节）：导入成功')
eq(S2.errors.length, 0, '起始节为偶数：不报错')
eq(
  [S2.courses[0].sectionStart, S2.courses[0].sectionEnd],
  [2, 3],
  '起始偶数时按原始跨度建一条（2-3）'
)

// ── 真实教务表格形状回归（2026-09-13 用真实 .xls 实测到的行结构；此处只复刻"形状"，不含任何真实数据）──
// 横幅行带 colspan="8"（标题/学年/学号）+ 空行 + 一行星期表头，然后才是 10 个节次行。
// 实测确认：colspan 只在非节次行上，被「cells[0] 必须是 第X节」过滤天然挡掉，不影响列号。
const withBanner =
  '<table id="manualArrangeCourseTable">' +
  '<tr><td colspan="8">某某大学学生课表</td></tr>' +
  '<tr><td colspan="8">2026-2027学年第1学期</td></tr>' +
  '<tr><td colspan="8">学号:0000000000</td></tr>' +
  '<tr></tr>' +
  '<tr><td>节次</td><td>星期一</td><td>星期二</td><td>星期三</td><td>星期四</td><td>星期五</td><td>星期六</td><td>星期日</td></tr>' +
  emitHtmlTable(FIXTURE).replace(/^<table[^>]*>/, '')
const HB = parseHtmlTable(withBanner)
eq(HB.errors.length, 0, '含 colspan="8" 横幅行 + 星期表头行的真实形状 → 零错误（不误拦）')
eq(HB.courses.length, 10, '横幅行 / 表头行 / 空行都不影响课程解析（仍 10 条）')
eq(HB.courseNames, 9, '真实形状下去重门数不变（9 门）')

const find = (r, name) => r.courses.filter((c) => c.name === name)

eq(
  find(H, '程序设计实训').map((c) => `${c.day}|${c.sectionStart}-${c.sectionEnd}`),
  ['2|1-2', '2|3-4'],
  'rowspan=4 的课拆成 周二1-2 + 周二3-4'
)
eq(
  find(H, '线性代数').map((c) => `${c.day}|${c.sectionStart}-${c.sectionEnd}`),
  ['4|3-4'],
  'rowspan 占位后列号不漂移（线性代数落在周四，而非周一）'
)
eq(
  find(H, '大学英语').map((c) => `${c.day}|${c.sectionStart}-${c.sectionEnd}`),
  ['3|1-2'],
  '一格挤两门课时，第 1 门课正确取出'
)
eq(
  find(H, '体育').map((c) => `${c.day}|${c.sectionStart}-${c.sectionEnd}`),
  ['3|1-2'],
  '一格挤两门课时，第 2 门课也正确取出'
)
eq(
  find(H, '大学物理').map((c) => `${c.day}|${c.sectionStart}-${c.sectionEnd}`),
  ['2|5-6'],
  '第 5 行课程落在周二 5-6'
)

console.log('\n── JSON 结构化导入 ──')
const JSON_OK = `{"courses":[
  {"name":"高等数学","place":"某某教学楼A-101","teacher":"张老师","day":1,"sectionStart":1,"sectionEnd":2,"weeks":[[1,16]]},
  {"name":"程序设计实训","place":"实验楼B-202","teacher":"李老师","day":2,"sectionStart":1,"sectionEnd":4,"weeks":[[3,8,"单"]]}
]}`
const J = parseJson(JSON_OK)
eq(looksLikeJson(JSON_OK), true, 'JSON 可被识别')
eq(looksLikeJson('课程名|地点|老师|一|1-2|1-16'), false, '标准文本不会被误判为 JSON')
eq(J.errors.length, 0, 'JSON 路无错误')
eq(J.okCount, 2, 'JSON 路共 2 条')
eq(J.courses[0].weeks, [[1, 16]], 'weeks 数组形态正确解析')
eq(J.courses[1].weeks, [[3, 8, '单']], 'weeks 单双周三元组正确解析')
eq(looksLikeJson('```json\n' + JSON_OK + '\n```'), true, '带代码栏的 JSON 可被识别')
eq(parseJson('```json\n' + JSON_OK + '\n```').okCount, 2, '代码栏会被剥掉')

// 宽容形态：裸数组 / 汉字星期 / section 字符串 / weeks 字符串 / 别名字段
const J2 = parseJson(
  '[{"name":"体育","day":"星期三","section":"5-6","weeks":"全","location":"体育馆"}]'
)
eq(J2.errors.length, 0, '宽容形态无错误')
eq(J2.courses[0].day, 3, '"星期三" 解析为周三')
eq(J2.courses[0].sectionStart, 5, 'section 字符串 "5-6" 正确解析')
eq(J2.courses[0].weeks, [[1, 30]], 'weeks 字符串 "全" 解析为 [[1,30]]')
eq(J2.courses[0].place, '体育馆', 'location 别名字段可识别')

// 报错能力：缺 name / 非法 day / 非法 weeks / 顶层形态错 / JSON 语法错
const JBad = parseJson(
  `{"courses":[
    {"place":"某某教学楼","day":1,"sectionStart":1,"sectionEnd":2,"weeks":[[1,16]]},
    {"name":"大学英语","day":9,"sectionStart":3,"sectionEnd":4,"weeks":[[1,16]]},
    {"name":"线性代数","day":2,"sectionStart":3,"sectionEnd":4,"weeks":"abc"}
  ]}`
)
eq(JBad.okCount, 0, '全非法时 0 条通过')
eq(JBad.errors.length, 3, '3 条非法各报 1 条错误')
JBad.errors.forEach((e) => console.log(`      第 ${e.line} 条 → ${e.reason}`))
eq(parseJson('{"app":"轻课表"}').errors.length, 1, '缺 courses 数组时明确报错')
eq(parseJson('{oops').errors.length, 1, 'JSON 语法错误明确报错')

console.log('\n── 文件导入 · 文本解码 ──')
const SAMPLE_STR = '高等数学|某某教学楼A-101|张老师|一|1-2|1-16'

eq(decodeText(new Uint8Array(0)), '', '空字节返回空串')
eq(
  decodeText(new Uint8Array(Buffer.from(SAMPLE_STR, 'utf8'))),
  SAMPLE_STR,
  'UTF-8 无 BOM 正确解码'
)
eq(
  decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SAMPLE_STR, 'utf8')]))),
  SAMPLE_STR,
  'UTF-8 带 BOM 正确解码'
)
eq(
  decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(SAMPLE_STR, 'utf16le')]))),
  SAMPLE_STR,
  'UTF-16LE（WPS 另存格式）正确解码'
)
const le = Buffer.from(SAMPLE_STR, 'utf16le')
const be = Buffer.from(le)
for (let i = 0; i < be.length; i += 2) {
  const t = be[i]
  be[i] = be[i + 1]
  be[i + 1] = t
}
eq(
  decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))),
  SAMPLE_STR,
  'UTF-16BE 正确解码'
)
eq(
  decodeText(new Uint8Array(Buffer.from('课表🎯连堂', 'utf8'))),
  '课表🎯连堂',
  'UTF-8 四字节代理对正确解码'
)

/* ────────────────────────────────────────────────────────────
 * 本地存储层（storage.js）—— 用一个最小 uni.storage 桩首次纳入自测
 * ──────────────────────────────────────────────────────────── */
console.log('\n── 本地存储层（uni 桩）──')

const store = new Map()
globalThis.uni = {
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => store.set(k, v),
  removeStorageSync: (k) => store.delete(k),
  showToast: () => {}
}

const { loadState, setCourses, resetAll } = await import('./utils/storage.js')

const KEY = 'light_schedule_v1'

// 损坏数据：不抛错、重置为空，且原始内容被备份到旁路键（留一条抢救通道）
store.clear()
store.set(KEY, '{这不是合法 JSON')
const corrupted = loadState()
eq(
  Array.isArray(corrupted.courses) && corrupted.courses.length === 0,
  true,
  '损坏数据 → 重置为空课表，且不抛错'
)
eq(store.get(KEY + '_corrupt'), '{这不是合法 JSON', '损坏原文已备份到 _corrupt 旁路键')

// resetAll：主键与损坏备份一并清掉
store.set(KEY, '{}')
store.set(KEY + '_corrupt', 'x')
resetAll()
eq(store.has(KEY), false, 'resetAll 清掉主键')
eq(store.has(KEY + '_corrupt'), false, 'resetAll 一并清掉 _corrupt 备份（不留残骸）')

// 正常写入 / 读取往返
setCourses([
  {
    id: 'c_t1',
    name: '高等数学',
    place: '某某教学楼A-101',
    teacher: '张老师',
    day: 1,
    sectionStart: 1,
    sectionEnd: 2,
    weeks: [[1, 16]],
    colorSeed: '高等数学'
  }
])
eq(loadState().courses.length, 1, '写入后读回 1 门课（storage 往返正常）')

console.log(`\n${'─'.repeat(40)}`)
console.log(`通过 ${pass} / 失败 ${fail}`)
console.log(`${'─'.repeat(40)}\n`)
process.exit(fail > 0 ? 1 : 0)
