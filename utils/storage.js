/**
 * 本地持久化封装（uni.setStorageSync / getStorageSync）
 *
 * 设计依据：方案书 3.3 节「本地存储结构」
 *   {
 *     scheduleVersion: 1,
 *     semester: { name, startDate, totalWeeks },
 *     timeSlots: [ ... ],
 *     courses: [ ...Course ],
 *     settings: { showWeekend, showEvening, highlightCurrent }
 *   }
 *
 * 约束：离线优先、零网络请求、零权限。所有数据只落本地。
 */

import {
  DEFAULT_TIME_SLOTS,
  DEFAULT_SEMESTER,
  DEFAULT_SETTINGS
} from '../config/times.js'

/** 存储键名（加前缀避免与其他应用冲突） */
const KEY = 'light_schedule_v1'

/** 数据结构版本，未来迁移用 */
export const SCHEDULE_VERSION = 1

/** 内存缓存，减少高频读盘 */
let cache = null

/** 生成默认的空数据结构 */
function createDefaultState() {
  return {
    scheduleVersion: SCHEDULE_VERSION,
    semester: { ...DEFAULT_SEMESTER },
    timeSlots: DEFAULT_TIME_SLOTS.map((s) => ({ ...s })),
    courses: [],
    settings: { ...DEFAULT_SETTINGS }
  }
}

/**
 * 读取全部数据（带缓存）
 * @returns {object} 数据结构；首次调用或损坏时返回默认值
 */
export function loadState() {
  if (cache) return cache

  let raw = null
  try {
    raw = uni.getStorageSync(KEY)
    if (!raw) {
      cache = createDefaultState()
      return cache
    }
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    cache = normalizeState(parsed)
    return cache
  } catch (e) {
    // 数据损坏时不抛错，重置为默认值，保证 App 可用。
    // ⚠️ 但先把原始内容备份到旁路键：损坏多半来自写入中断，
    //    留一份原文，用户还有机会把课程捞回来，不至于**无声清空**。
    console.warn('[storage] 读取失败，已重置为默认数据', e)
    try {
      if (raw) {
        uni.setStorageSync(
          KEY + '_corrupt',
          typeof raw === 'string' ? raw : JSON.stringify(raw)
        )
      }
    } catch (e2) {
      console.warn('[storage] 损坏数据备份失败（不影响重置）', e2)
    }
    cache = createDefaultState()
    return cache
  }
}

/**
 * 归一化：补齐缺失字段，保证结构完整（兼容旧版本数据）
 */
function normalizeState(s) {
  const d = createDefaultState()
  if (!s || typeof s !== 'object') return d

  return {
    scheduleVersion: s.scheduleVersion || SCHEDULE_VERSION,
    semester: { ...d.semester, ...(s.semester || {}) },
    timeSlots:
      Array.isArray(s.timeSlots) && s.timeSlots.length
        ? s.timeSlots
        : d.timeSlots,
    courses: Array.isArray(s.courses) ? s.courses : [],
    settings: { ...d.settings, ...(s.settings || {}) }
  }
}

/**
 * 写入全部数据
 * @param {object} state
 */
export function saveState(state) {
  cache = normalizeState(state)
  try {
    uni.setStorageSync(KEY, JSON.stringify(cache))
  } catch (e) {
    // ⚠️ 内存 cache 已经更新，若不提示，用户会以为保存成功 —— 重启后数据却退回上一次写入。
    //    这里直接弹 toast 是务实的取舍（在存储层弹 UI 严格说不够分层，
    //    但把它改成抛错会牵动所有调用点，与本项目「宜少不宜多」的取向冲突）。
    console.error('[storage] 写入失败', e)
    try {
      uni.showToast({ title: '保存失败，请重试', icon: 'none' })
    } catch (e2) {
      /* 非 UI 环境（如 Node 自测脚本）下忽略 */
    }
  }
  return cache
}

/** 获取课程列表 */
export function getCourses() {
  return loadState().courses
}

/** 覆盖课程列表 */
export function setCourses(courses) {
  const s = loadState()
  s.courses = Array.isArray(courses) ? courses : []
  return saveState(s)
}

/** 追加课程（导入-追加模式） */
export function appendCourses(list) {
  const s = loadState()
  s.courses = s.courses.concat(Array.isArray(list) ? list : [])
  return saveState(s)
}

/** 覆盖课程（导入-覆盖模式） */
export function replaceCourses(list) {
  return setCourses(list)
}

/** 新增或更新单门课程（有 id 则更新，无则新增） */
export function upsertCourse(course) {
  const s = loadState()
  const idx = s.courses.findIndex((c) => c.id === course.id)
  if (idx >= 0) {
    s.courses.splice(idx, 1, { ...s.courses[idx], ...course })
  } else {
    s.courses.push(course)
  }
  return saveState(s)
}

/** 删除单门课程 */
export function removeCourse(id) {
  const s = loadState()
  s.courses = s.courses.filter((c) => c.id !== id)
  return saveState(s)
}

/** 清空全部课程 */
export function clearAllCourses() {
  return setCourses([])
}

/**
 * 清空某天的课程
 * @param {number} day 1~7
 */
export function clearDayCourses(day) {
  const s = loadState()
  s.courses = s.courses.filter((c) => c.day !== day)
  return saveState(s)
}

/** 读取学期配置 */
export function getSemester() {
  return loadState().semester
}

/** 更新学期配置（局部合并） */
export function setSemester(patch) {
  const s = loadState()
  s.semester = { ...s.semester, ...patch }
  return saveState(s)
}

/** 读取节次时间表 */
export function getTimeSlots() {
  return loadState().timeSlots
}

/** 更新某节课的时间 */
export function setTimeSlot(section, start, end) {
  const s = loadState()
  const idx = s.timeSlots.findIndex((x) => x.section === section)
  if (idx >= 0) {
    s.timeSlots.splice(idx, 1, { ...s.timeSlots[idx], start, end })
  }
  return saveState(s)
}

/** 重置节次时间表为默认值 */
export function resetTimeSlots() {
  const s = loadState()
  s.timeSlots = DEFAULT_TIME_SLOTS.map((x) => ({ ...x }))
  return saveState(s)
}

/** 读取显示设置 */
export function getSettings() {
  return loadState().settings
}

/** 更新显示设置（局部合并） */
export function setSettings(patch) {
  const s = loadState()
  s.settings = { ...s.settings, ...patch }
  return saveState(s)
}

/** 清空所有本地数据（回到首次启动状态） */
export function resetAll() {
  cache = createDefaultState()
  try {
    uni.removeStorageSync(KEY)
    // 顺手清掉损坏数据的旁路备份，别留残骸。
    // （平时不主动清：那份备份是给用户"抢救课程"用的，只有显式重置才该丢。
    //   损坏备份被删的时机只有这里 —— 见 loadState 的 catch。）
    uni.removeStorageSync(KEY + '_corrupt')
  } catch (e) {
    console.error('[storage] 清除失败', e)
  }
  return cache
}
