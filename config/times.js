/**
 * 节次时间表与学期配置
 *
 * 设计依据：方案书 3.3 节 timeSlots 注释
 *   第 1-4 节  08:00 起，每节 45 分钟
 *   第 5-8 节  14:00 起，每节 45 分钟
 *   第 9-10 节 19:20-21:00（晚自习，两节连排）
 *
 * 注意：此处为「默认值」，用户在设置页可自定义，保存后覆盖。
 */

/** 一节课的标准时长（分钟） */
export const LESSON_MINUTES = 45

/**
 * 默认节次时间表（10 节）
 * start / end 为 "HH:mm"，便于直接显示；minutes 为距 0 点的分钟数，便于比较。
 */
export const DEFAULT_TIME_SLOTS = [
  { section: 1, start: '08:00', end: '08:45' },
  { section: 2, start: '08:55', end: '09:40' },
  { section: 3, start: '10:00', end: '10:45' },
  { section: 4, start: '10:55', end: '11:40' },
  { section: 5, start: '14:00', end: '14:45' },
  { section: 6, start: '14:55', end: '15:40' },
  { section: 7, start: '16:00', end: '16:45' },
  { section: 8, start: '16:55', end: '17:40' },
  { section: 9, start: '19:20', end: '20:05' },
  { section: 10, start: '20:15', end: '21:00' }
]

/** 上午 / 下午 / 晚间 分段（用于设置页分组与网格视觉分组） */
export const SECTION_GROUPS = [
  { key: 'morning', label: '上午', from: 1, to: 4, rangeText: '第 1-4 节', timeText: '08:00 – 11:40' },
  { key: 'afternoon', label: '下午', from: 5, to: 8, rangeText: '第 5-8 节', timeText: '14:00 – 17:40' },
  { key: 'evening', label: '晚间', from: 9, to: 10, rangeText: '第 9-10 节', timeText: '19:20 – 21:00' }
]

/** 网格行分组：每 2 节合成一行（连堂渲染为一个色块的载体） */
export const GRID_ROWS = [
  { from: 1, to: 2 },
  { from: 3, to: 4 },
  { from: 5, to: 6 },
  { from: 7, to: 8 },
  { from: 9, to: 10 }
]

/** 默认学期配置 */
export const DEFAULT_SEMESTER = {
  name: '2026-2027-1',
  startDate: '2026-08-31', // 第 1 周周一
  totalWeeks: 20
}

/** 默认显示设置 */
export const DEFAULT_SETTINGS = {
  showWeekend: true,
  showEvening: true,
  highlightCurrent: true
}

/** 星期显示文案（网格表头） */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** "HH:mm" → 距 0 点分钟数 */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** 取某一节的开始时间（越界返回空串） */
export function getStartTime(section, slots = DEFAULT_TIME_SLOTS) {
  const s = slots.find((x) => x.section === section)
  return s ? s.start : ''
}
