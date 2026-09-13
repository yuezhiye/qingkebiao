/**
 * 课程色块取色（纯函数，无副作用）
 *
 * 设计依据：方案书 3.4 节「色块池」
 *   - 6 色柔和淡色系，饱和度 ≤ 40%
 *   - 同课程名按 hash 稳定取色（同课名永远同色，跨会话、跨设备一致）
 *
 * 注意：不使用数组轮转索引取色，因为课程增删会导致同一门课换色。
 *      改用 hash(colorSeed) % 6，与课程的存储顺序解耦。
 */

/** 6 色色块池：fill 为底色，stroke 为同色系描边（零阴影平面化） */
export const COLOR_POOL = [
  { name: '淡青', fill: '#E8F4F4', stroke: '#C9E4E4' },
  { name: '淡蓝', fill: '#EAF0F8', stroke: '#D3E0EF' },
  { name: '淡绿', fill: '#E4F2E8', stroke: '#CDE5D4' },
  { name: '淡黄', fill: '#F6EFE2', stroke: '#E6D5B8' },
  { name: '淡粉', fill: '#F4EAF2', stroke: '#E2D3E0' },
  { name: '淡紫', fill: '#F2ECF4', stroke: '#DED3E6' }
]

/** 课程名文字色（统一深墨绿，保证在 6 种淡底上都可读） */
export const COURSE_TEXT_COLOR = '#2F4F4F'
/** 周次等次要信息色 */
export const COURSE_META_COLOR = '#7A9A9A'

/**
 * 字符串 hash（djb2 变体）
 * 对中文安全：按 UTF-16 code unit 逐位折叠，不使用 charCodeAt 之外的可变行为。
 * @param {string} str
 * @returns {number} 非负整数
 */
export function hashString(str) {
  let h = 5381
  const s = String(str == null ? '' : str)
  for (let i = 0; i < s.length; i++) {
    // h * 33 + c，用位运算保持在 32 位有符号范围内
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * 取色：course 的 colorSeed 优先，缺失时回退到课程名
 * @param {{colorSeed?: string, name?: string}} course
 * @returns {{name: string, fill: string, stroke: string}}
 */
export function pickColor(course) {
  const seed = (course && (course.colorSeed || course.name)) || ''
  return COLOR_POOL[hashString(seed) % COLOR_POOL.length]
}

/** 仅取底色 */
export function pickFill(course) {
  return pickColor(course).fill
}

/** 仅取描边色 */
export function pickStroke(course) {
  return pickColor(course).stroke
}
