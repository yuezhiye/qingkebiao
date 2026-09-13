/**
 * SVG 图标（转 data-uri，供 <image> 使用）
 *
 * 为什么不用 v-html 直接插 SVG：
 *   App 端 webview 对 v-html 的安全策略较严，SVG 字符串常渲染不出来（图标变空白）。
 *   <image> + data:image/svg+xml;base64 在三端（App / H5 / 小程序）都稳定可用。
 *
 * 用法：<image :src="ICONS.target" class="icon" />
 */

/** 把 SVG 字符串转成 data-uri（base64）。H5/App/小程序通用 */
function toDataUri(svg) {
  // 小程序对 base64 长度敏感，先压缩空白
  const compact = svg.replace(/\s+/g, ' ').trim()

  // H5 / App 端可以直接用 encodeURIComponent 形式（更短）
  // 但小程序端要求 base64，这里统一走 base64 保证三端一致
  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(compact)))
      : Buffer.from(compact, 'utf8').toString('base64')

  return 'data:image/svg+xml;base64,' + b64
}

/** 用颜色占位符生成图标：%COLOR% 会被替换 */
function make(svg, color) {
  return toDataUri(svg.replace(/%COLOR%/g, color))
}

/* ── 图标源（stroke/fill 用 %COLOR% 占位） ── */

const SRC = {
  target: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="%COLOR%" stroke-width="1.6"/><circle cx="10" cy="10" r="2.4" fill="%COLOR%"/><path d="M10 1.6v2.4M10 16v2.4M1.6 10h2.4M16 10h2.4" stroke="%COLOR%" stroke-width="1.6" stroke-linecap="round"/></svg>`,

  plus: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4.4v11.2M4.4 10h11.2" stroke="%COLOR%" stroke-width="2" stroke-linecap="round"/></svg>`,

  back: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.4 4.6 7 10l5.4 5.4" stroke="%COLOR%" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  chevron: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.6 6.4 8 9.8l3.4-3.4" stroke="%COLOR%" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  check: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="7.6" stroke="%COLOR%" stroke-width="1.5"/><path d="M5.8 9.2l2.2 2.2 4.2-4.6" stroke="%COLOR%" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  alert: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="7.6" stroke="%COLOR%" stroke-width="1.5"/><path d="M9 5.2v4.2" stroke="%COLOR%" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="12.4" r="0.9" fill="%COLOR%"/></svg>`,

  /* 底部导航：课表（未激活灰 / 激活深） */
  navSchedule: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.6" y="3.2" width="14.8" height="13.2" rx="2.4" stroke="%COLOR%" stroke-width="1.5"/><path d="M1.6 7.2h14.8" stroke="%COLOR%" stroke-width="1.5"/><path d="M5.4 1.6v3M12.6 1.6v3" stroke="%COLOR%" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  navImport: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 11.6V2.2" stroke="%COLOR%" stroke-width="1.5" stroke-linecap="round"/><path d="M5.6 5.8 9 2.2l3.4 3.6" stroke="%COLOR%" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.4 11.4v2.6a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8v-2.6" stroke="%COLOR%" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  navSettings: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="2.6" stroke="%COLOR%" stroke-width="1.5"/><path d="M9 1.6v2.1M9 14.3v2.1M1.6 9h2.1M14.3 9h2.1M3.75 3.75l1.5 1.5M12.75 12.75l1.5 1.5M14.25 3.75l-1.5 1.5M5.25 12.75l-1.5 1.5" stroke="%COLOR%" stroke-width="1.3" stroke-linecap="round"/></svg>`
}

/* ── 主题色 ── */
const C_TEXT = '#2F4F4F'
const C_WHITE = '#FFFFFF'
const C_TEAL = '#3A7A7A'
const C_RED = '#B45A5A'
const C_NAV_IDLE = '#7A9A9A'
const C_NAV_ACTIVE = '#1E3A3A'

/** 预生成好的图标 data-uri（避免每次渲染重复编码） */
export const ICONS = {
  target: make(SRC.target, C_TEXT),
  plus: make(SRC.plus, C_WHITE),
  back: make(SRC.back, C_TEXT),
  chevron: make(SRC.chevron, C_NAV_IDLE),
  check: make(SRC.check, C_TEAL),
  alert: make(SRC.alert, C_RED),

  navScheduleIdle: make(SRC.navSchedule, C_NAV_IDLE),
  navScheduleActive: make(SRC.navSchedule, C_NAV_ACTIVE),
  navImportIdle: make(SRC.navImport, C_NAV_IDLE),
  navImportActive: make(SRC.navImport, C_NAV_ACTIVE),
  navSettingsIdle: make(SRC.navSettings, C_NAV_IDLE),
  navSettingsActive: make(SRC.navSettings, C_NAV_ACTIVE)
}

export default ICONS
