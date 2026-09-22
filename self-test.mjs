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

// ═══════════════════════════════════════════════════════════════════════
// 桌面小组件 · 数据桥（纯函数部分）
//
// 原生渲染在真机验证；这里把关的是「交给桌面的数据对不对」——
// 周次过滤、排序、明日推进、隐私边界，这些错了在真机上一样看得出，
// 但在这里能早发现，且不需要打基座。
// ═══════════════════════════════════════════════════════════════════════
console.log('\n── 桌面小组件数据桥 ──')
{
  const { pickDay, buildWidgetPayload, courseLines, pickColorSeed, COLOR_POOL_SIZE } =
    await import('./utils/widget.js')
  const { COLOR_POOL, pickColor, hashString: hashStringExport } =
    await import('./utils/color.js')

  const SLOTS = [
    { section: 1, start: '08:00', end: '08:45' },
    { section: 2, start: '08:55', end: '09:40' },
    { section: 3, start: '10:00', end: '10:45' },
    { section: 4, start: '10:55', end: '11:40' },
    { section: 5, start: '14:00', end: '14:45' },
    { section: 6, start: '14:55', end: '15:40' }
  ]

  // 虚构课表：周一 3 门（用于测「只列 3 条 + 共 N 节」）、周二 1 门、周三 4 门
  const COURSES = [
    { id: 'w1', name: '高等数学', place: '某某教学楼A-101', teacher: '张老师',
      day: 1, sectionStart: 1, sectionEnd: 2, weeks: [[1, 16]] },
    { id: 'w2', name: '大学英语', place: '某某教学楼B-202', teacher: '李老师',
      day: 1, sectionStart: 3, sectionEnd: 4, weeks: [[1, 16]] },
    { id: 'w3', name: '程序设计基础', place: '', teacher: '王老师',
      day: 1, sectionStart: 5, sectionEnd: 6, weeks: [[1, 16]] },
    { id: 'w4', name: '体育（羽毛球）', place: '体育馆',
      day: 2, sectionStart: 3, sectionEnd: 4, weeks: [[1, 16]] },
    { id: 'w5', name: '大学物理', place: '某某教学楼C-303',
      day: 3, sectionStart: 1, sectionEnd: 2, weeks: [[1, 16]] }
  ]

  // ── pickDay：过滤 + 排序 + 字段精简 ──
  const mon = pickDay(COURSES, 1, 5, SLOTS)
  eq(mon.length, 3, 'pickDay：周一取到 3 门课')
  eq(mon[0].name, '高等数学', 'pickDay：按开始节次升序（第 1 门是第 1-2 节的课）')
  eq(mon[2].name, '程序设计基础', 'pickDay：第 3 门是第 5-6 节的课')
  eq(mon[0].start, '08:00', 'pickDay：起止时间从 timeSlots 正确映射')
  eq(mon[0].end, '09:40', 'pickDay：结束时间取 sectionEnd 对应节次的 end')
  eq(mon[2].place, '', 'pickDay：无地点时 place 为空串（不填 undefined）')
  // 节次号原样带出（原生侧用来显示「第 N-M 节」）
  eq(mon[0].sectionStart, 1, 'pickDay：带出 sectionStart')
  eq(mon[0].sectionEnd, 2, 'pickDay：带出 sectionEnd')
  eq(mon[2].sectionStart, 5, 'pickDay：第 3 门的 sectionStart = 5')
  // 🔐 隐私边界：教师姓名**不得**进桌面
  eq(Object.keys(mon[0]).sort(),
    ['colorSeed', 'end', 'name', 'place', 'sectionEnd', 'sectionStart', 'start'],
    'pickDay：字段集固定为 7 个 —— 教师姓名不外露给桌面')

  // 周次过滤：第 20 周时该课不在范围（weeks [[1,16]]）
  eq(pickDay(COURSES, 1, 20, SLOTS).length, 0, 'pickDay：超出课程周次范围时过滤为空')

  // 单双周：周一 1-16 全周 + 一门 1-16单
  const parity = [
    { id: 'p1', name: '单周课', place: 'X', day: 1, sectionStart: 1, sectionEnd: 2, weeks: [[1, 16, '单']] }
  ]
  eq(pickDay(parity, 1, 3, SLOTS).length, 1, 'pickDay：第 3 周（单周）单周课可见')
  eq(pickDay(parity, 1, 4, SLOTS).length, 0, 'pickDay：第 4 周（双周）单周课被过滤')

  // ── 色号：桌面圆角色块的颜色来源 ──
  //
  // 关键约束：**桌面色号必须与 App 内色块颜色一致**（同一门课两处同色）。
  //   App 侧：utils/color.js#pickColor → COLOR_POOL[hashString(seed) % 6]
  //   桌面侧：widget.js#pickColorSeed → hashString(seed) % 6，把下标传给原生
  // 若两边算法漂移，用户会看到「App 里淡青、桌面淡粉」。
  eq(COLOR_POOL_SIZE, COLOR_POOL.length, '色号：COLOR_POOL_SIZE 与 color.js 色池长度一致')
  eq(COLOR_POOL_SIZE, 6, '色号：色池为 6 色（res/drawable/qkb_block_0..5.xml 数量必须与之一致）')

  // 逐一核对：对每个色号都能找到同色的课名，反之亦然
  const seedNames = ['高等数学', '大学英语', '程序设计基础', '毛泽东思想',
                     '计算机网络与应用', 'XR交互设计', '大学物理', '体育']
  eq(seedNames.every((n) => pickColorSeed({ name: n }) === COLOR_POOL.indexOf(pickColor({ name: n }))),
    true, '色号：与 App pickColor 取到同一个色池下标（八门课逐一核对）')

  eq(seedNames.every((n) => {
    const s = pickColorSeed({ name: n })
    return Number.isInteger(s) && s >= 0 && s < COLOR_POOL_SIZE
  }), true, '色号：恒为 0 ~ 5 的整数（原生据此选 drawable，越界会崩）')

  // 同课名 → 同色号（跨调用稳定，绝不随顺序漂）
  eq(pickColorSeed({ name: '高等数学' }), pickColorSeed({ name: '高等数学' }),
    '色号：同课名两次取值相同（不随调用顺序漂）')

  // colorSeed 字段优先于 name（与 pickColor 的取值顺序一致）
  eq(pickColorSeed({ colorSeed: '自定义种子', name: '高等数学' }),
    COLOR_POOL.indexOf(pickColor({ colorSeed: '自定义种子', name: '高等数学' })),
    '色号：colorSeed 字段优先于 name（与 App 取值顺序一致）')

  // 异常输入不抛错、不返回越界值
  eq(pickColorSeed({}), COLOR_POOL.indexOf(pickColor({})),
    '色号：空对象 → 与 App 同色（不抛错）')
  eq(pickColorSeed(null), COLOR_POOL.indexOf(pickColor(null)),
    '色号：null → 与 App 同色（不抛错）')

  // ── 原生侧 hash 的等价性（锁死跨语言对齐）──
  //
  // 🔥 这里验的是 QkbWidgetService.kt#hashString 的**算法**，不是它的代码。
  //    背景：桌面要显示与 App 相同的颜色，原生侧必须用与 utils/color.js 完全
  //    一致的 djb2 实现。而这是**跨语言**复刻，最易出的错是「语义近似的写法其实不等价」。
  //
  //    2026-09-17 实际踩过：原生侧初版写 `h and 0x7FFFFFFF`「保证非负」，
  //    看着比 Math.abs 更稳，实则对负数而言两者**差别巨大**（不是差 1）：
  //      `毛泽东思想` → abs = 455830743，and = 1691652905
  //                    → 取模 3 vs 5 → 颜色直接跳到别的色号 ❌
  //    20 个课名样本里，有 4 个因此取到不同颜色。
  //
  //    下面用 JS 复刻 Kotlin 的实现（Int 溢出 + Math.abs），逐一比对。
  //    ⚠️ 若有人把 Kotlin 侧的 abs 改回掩码，这里会立刻红。
  const kotlinHash = (s) => {
    let h = 5381
    for (let i = 0; i < s.length; i++) {
      // 复刻 Kotlin：Int 是 32 位 → 每次累加后按 |0 截断（等价于 Kotlin 的自然溢出）
      h = ((h << 5) + h + s.charCodeAt(i)) | 0
    }
    // 复刻 Kotlin 的 kotlin.math.abs(h)
    return Math.abs(h)
  }
  // 复刻原生侧的兜底逻辑：越界一律退回 0 号色
  const kotlinColorIndex = (s) => {
    const mod = kotlinHash(s) % COLOR_POOL_SIZE
    return (mod >= 0 && mod < COLOR_POOL_SIZE) ? mod : 0
  }

  const alignNames = ['高等数学', '大学英语', '程序设计基础', '毛泽东思想',
                      '计算机网络与应用', 'XR交互设计', '大学物理', '体育',
                      '形势与政策', '某某教学楼A-101', '某某教学楼xxx教室',
                      '', 'a', 'zzz', '计算机', '数据结构与算法',
                      '大学体育（羽毛球）', '马克思主义基本原理', '线性代数',
                      '概率论与数理统计']
  const mismatches = alignNames.filter(
    (n) => kotlinColorIndex(n) !== pickColorSeed({ name: n })
  )
  eq(mismatches, [],
    `色号：原生 Kotlin 复刻与 JS 取色一致（${alignNames.length} 个样本）`)
  eq(kotlinColorIndex('毛泽东思想'), pickColorSeed({ name: '毛泽东思想' }),
    '色号：🔴 回归哨兵 —— 原名中过枪的那个（abs 与掩码之差）')

  // hash 自身相等（不只是取模后相等，避免「碰巧同色」掩盖算法漂移）
  eq(alignNames.every((n) => kotlinHash(n) === hashStringExport(n)), true,
    '色号：原生 hash 与 JS hashString 逐值相等（不止取模后相等）')

  // ── buildWidgetPayload：明日推进 ──
  // 2026-09-16 是周三 → todayDay = 3
  const WED = new Date(2026, 8, 16, 10, 0, 0)
  eq(WED.getDay(), 3, '前置：2026-09-16 确实是周三')
  const p1 = buildWidgetPayload(
    { courses: COURSES, semester: { startDate: '2026-08-31', totalWeeks: 20 }, timeSlots: SLOTS },
    WED
  )
  eq(p1.todayDay, 3, 'payload：todayDay = 周三(3)')
  eq(p1.today.length, 1, 'payload：周三取到 1 门课')
  eq(Array.isArray(p1.today), true, 'payload：today 恒为数组（原生侧才能安全遍历）')
  eq(typeof p1.updatedAt, 'number', 'payload：带 updatedAt 时间戳')
  eq(p1.week, 3, 'payload：周次计算正确（09-16 属第 3 周）')
  // 当前小组件只显示今天 → payload 里不再有 tomorrow / tomorrowDay
  eq('tomorrow' in p1, false, 'payload：不再输出 tomorrow（小组件只显示今天）')
  eq('tomorrowDay' in p1, false, 'payload：不再输出 tomorrowDay')
  eq(Object.keys(p1).sort(), ['today', 'todayDay', 'updatedAt', 'week'],
    'payload：顶层字段集固定为 4 个')

  // 空课表不崩
  const p3 = buildWidgetPayload({ courses: [], semester: {}, timeSlots: [] }, WED)
  eq(p3.today, [], 'payload：空课表 → today 为空数组')
  eq(p3.week >= 1, true, 'payload：缺 semester 时周次兜底为 >= 1（不出现 0 / NaN）')

  // ── courseLines：封面文案 ──
  eq(courseLines([]), ['暂无课程'], 'courseLines：空列表 → 提示文案')
  eq(courseLines(mon), ['08:00 高等数学 · 某某教学楼A-101',
                        '10:00 大学英语 · 某某教学楼B-202',
                        '14:00 程序设计基础'],
    'courseLines：恰好 3 门 → 只 3 行，不出现「共 N 节」')
  const lines = courseLines(mon, 2)
  eq(lines.length, 3, 'courseLines：max=2 且共 3 门 → 2 行 + 1 行溢出提示')
  eq(lines[0], '08:00 高等数学 · 某某教学楼A-101', 'courseLines：有地点时带分隔符')
  eq(lines[1], '10:00 大学英语 · 某某教学楼B-202', 'courseLines：第 2 行正确')
  eq(lines[2], '共 3 节', 'courseLines：溢出时提示总节数')
  eq(courseLines([mon[2]]), ['14:00 程序设计基础'], 'courseLines：无地点时不出现多余分隔符')
  eq(courseLines([mon[0]]).length, 1, 'courseLines：未溢出时不显示总节数行')

  // ── syncWidget / clearWidget：注入式桥接契约 ──
  //
  // ⚠️ 这两个函数**不再自己 import UTS 插件**，而是由调用方注入推送实现。
  //    原因见 utils/widget-bridge.js 头注释：插件必须靠顶层静态 import 才会被编译，
  //    但那条 import 会让 Node 自测报 ERR_MODULE_NOT_FOUND。
  //    → 所以这里锁死「注入契约」，防止以后有人把它们改回自解析插件。
  const { syncWidget, clearWidget } = await import('./utils/widget.js')

  const STATE = {
    courses: COURSES,
    semester: { startDate: '2026-08-31', totalWeeks: 20 },
    timeSlots: SLOTS
  }

  // 正常注入：payload 应被 JSON 串化后原样递给 push
  let received = null
  const okPush = (json) => { received = json; return true }
  eq(syncWidget(STATE, okPush), true, 'syncWidget：注入 push 且成功 → 返回 true')
  eq(typeof received, 'string', 'syncWidget：传给 push 的是 JSON 字符串')
  const parsed = JSON.parse(received)
  eq(Array.isArray(parsed.today), true,
    'syncWidget：JSON 反序列化后 today 仍是数组')
  // 🔐 隐私边界：传出去的每一门课都只许有这 7 个字段（教师姓名绝不放行）
  //    ⚠️ 不断言「today 非空」—— 那取决于运行当天是周几（预设课表只有周一~周三有课），
  //       会随日期漂。改为：**在固定周三跑一遍**，那时 today 必定有课，逐条校验。
  const WED_STATE_JSON = JSON.parse(
    JSON.stringify(buildWidgetPayload(STATE, WED))
  )
  const wedCourses = WED_STATE_JSON.today
  eq(wedCourses.length > 0, true, 'syncWidget：固定周三下当天至少取到 1 门（前置）')
  eq(wedCourses.every((c) => !('teacher' in c)), true,
    'syncWidget：🔐 教师姓名不得出现在传给桌面的 JSON 里')
  eq(wedCourses.every(
    (c) => Object.keys(c).sort().join() ===
      'colorSeed,end,name,place,sectionEnd,sectionStart,start'
  ), true, 'syncWidget：🔐 传给桌面的每门课仅 7 个约定字段（不含教师姓名）')
  // 色号也要在传输后存活（JSON 往返把数字保留为数字）
  eq(wedCourses.every((c) => Number.isInteger(c.colorSeed) && c.colorSeed >= 0 && c.colorSeed < 6),
    true, 'syncWidget：JSON 往返后 colorSeed 仍是 0~5 的整数')

  // push 返回 false → 如实透传，不吞错
  eq(syncWidget(STATE, () => false), false, 'syncWidget：push 返回 false → 返回 false')

  // 未注入（H5 / 小程序 / 自测环境）→ 必须静默 false，不抛错
  eq(syncWidget(STATE), false, 'syncWidget：未注入 push → 静默返回 false（不抛错）')
  eq(syncWidget(STATE, null), false, 'syncWidget：push 为 null → 静默返回 false')
  eq(syncWidget(STATE, 'not-a-fn'), false, 'syncWidget：push 非函数 → 静默返回 false')

  // 组装阶段就坏掉（state 传 null）也不得抛错 —— 桌面同步绝不能拖垮 App 主流程
  let threw = false
  try { syncWidget(null, okPush) } catch { threw = true }
  eq(threw, false, 'syncWidget：state 异常时不抛错（失败不影响主流程）')

  // clearWidget 同一套契约
  let cleared = 0
  eq(clearWidget(() => { cleared++; return true }), true, 'clearWidget：注入 clear 且成功 → 返回 true')
  eq(cleared, 1, 'clearWidget：确实调用了注入的实现')
  eq(clearWidget(() => false), false, 'clearWidget：实现返回 false → 返回 false')
  eq(clearWidget(), false, 'clearWidget：未注入 → 静默返回 false')
  eq(clearWidget(null), false, 'clearWidget：注入 null → 静默返回 false')
}

console.log(`\n${'─'.repeat(40)}`)
console.log(`通过 ${pass} / 失败 ${fail}`)
console.log(`${'─'.repeat(40)}\n`)
process.exit(fail > 0 ? 1 : 0)
