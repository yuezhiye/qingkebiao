/**
 * 课程 id 生成（全工程唯一入口）
 *
 * ⚠️ 为什么不能用 `Date.now() + Math.random()`：
 *   批量导入时同一毫秒内要生成十几到几十个 id，而随机数只有 1000 个格位，
 *   必然发生生日碰撞（实测 24 条会撞出重复 id）。id 一重复就会：
 *     - upsertCourse 按 id 查 → 后一条覆盖前一条，课程静默丢失
 *     - 点某门课跳编辑页 → find(id) 命中同 id 的另一门课，回填成别人的内容
 *     - 或 id 已不存在 → 表单空白，用户以为「要重新填写」
 *
 *   加 module 级自增序列后，同一毫秒内也绝不会重复。
 *
 * 注意：App 端各页面是独立 JS 上下文，本模块可能被各自加载一份，
 *      自增序列不跨页面共享。但同一页面内的批量生成（导入、新增）已足够安全；
 *      跨页面的时间戳部分不同，实际不会撞。
 */

let seq = 0

/**
 * 生成一个课程 id
 * @returns {string} 形如 `c_mtwp4pl5_1`（时间戳 36 进制 + 自增序列）
 */
export function makeCourseId() {
  seq += 1
  return 'c_' + Date.now().toString(36) + '_' + seq.toString(36)
}

export default makeCourseId
