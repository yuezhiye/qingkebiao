<template>
  <view class="page">
    <!-- ── 状态栏占位（自定义导航） ── -->
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- ── 顶部：周次 + 日期 + 操作 ── -->
    <view class="header">
      <view class="hd-left">
        <view class="hd-week-row" @click="openWeekPicker">
          <text class="hd-week">第 {{ currentWeek }} 周</text>
          <view class="hd-week-caret" :class="{ open: weekPickerVisible }"></view>
        </view>
        <text class="hd-date">{{ weekRangeText }} · 周{{ todayLabel }}</text>
      </view>
      <view class="hd-right">
        <view class="icon-btn" @click="goToday">
          <image class="ic-target" :src="ICONS.target" mode="aspectFit" />
        </view>
        <view class="icon-btn primary" @click="onAddCourse">
          <image class="ic-plus" :src="ICONS.plus" mode="aspectFit" />
        </view>
      </view>
    </view>

    <!-- ── 周次选择器（浮层） ── -->
    <view v-if="weekPickerVisible" class="week-scrim" @click="weekPickerVisible = false">
      <view class="week-panel" @click.stop>
        <view class="wp-head">
          <text class="wp-title">选择周次</text>
          <text class="wp-close" @click="weekPickerVisible = false">关闭</text>
        </view>
        <scroll-view class="wp-body" scroll-y :show-scrollbar="false">
          <view class="wp-grid">
            <view
              v-for="w in weekList"
              :key="w"
              class="wp-chip"
              :class="{ active: w === currentWeek, today: w === realWeek }"
              @click="pickWeek(w)"
            >
              <text class="wp-num">{{ w }}</text>
              <text v-if="w === realWeek" class="wp-tag">本周</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- ── 空态引导（无任何课程时；首次打开即此状态） ── -->
    <view v-if="!courses.length" class="empty-hint">
      <text class="eh-title">还没有课程</text>
      <text class="eh-sub">从教务导入课表，或手动新建一门</text>
      <view class="eh-actions">
        <view class="eh-btn primary" @click="goImport">
          <text class="eh-btn-text">去导入</text>
        </view>
        <view class="eh-btn" @click="onAddCourse">
          <text class="eh-btn-text">手动新建</text>
        </view>
      </view>
    </view>

    <!-- ── 今日课程卡（含倒计时） ── -->
    <view class="top-wrap">
      <view class="today-card">
        <view class="tc-head">
          <view class="tc-title-row">
            <view class="tc-dot"></view>
            <text class="tc-title">今日课程 · 周{{ todayLabel }}</text>
          </view>
          <view class="tc-countdown" :class="countdown.status">
            <text>{{ countdown.text }}</text>
          </view>
        </view>

        <scroll-view
          v-if="todayCourses.length"
          class="tc-scroll"
          scroll-x
          :show-scrollbar="false"
        >
          <view class="tc-list">
            <view
              v-for="c in todayCourses"
              :key="c.id"
              class="today-item"
              :style="{ background: fillOf(c), borderColor: strokeOf(c) }"
              @click="onEdit(c)"
            >
              <text class="ti-name">{{ c.name }}</text>
              <text class="ti-time">
                {{ timeRangeOf(c) }}
              </text>
              <text class="ti-place">{{ c.place }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-else class="tc-empty">
          <text>{{ courses.length ? '今天没有课，好好休息 ~' : '导入课表后，这里会显示今天的课' }}</text>
        </view>
      </view>
    </view>

    <!-- ── 课表网格 ── -->
    <scroll-view class="grid-scroll" scroll-y :show-scrollbar="false">
      <view class="grid-wrap">
        <!-- 表头：星期 + 日期号 -->
        <view class="day-head-row">
          <view class="head-gutter"></view>
          <scroll-view class="head-scroll" scroll-x :scroll-left="scrollLeft" :show-scrollbar="false">
            <view class="head-inner">
              <view
                v-for="d in dayHeaders"
                :key="d.day"
                class="day-head"
                :class="{ today: d.isToday }"
              >
                <text class="dh-label">{{ d.label }}</text>
                <text class="dh-num">{{ d.num }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 网格主体 -->
        <view class="body-row">
          <TimeColumn :rows="grid.rows" :time-slots="timeSlots" />
          <scroll-view
            class="body-scroll"
            scroll-x
            :scroll-left="scrollLeft"
            :show-scrollbar="false"
            @scroll="onBodyScroll"
          >
            <view class="body-inner">
              <view
                v-for="d in dayHeaders"
                :key="d.day"
                class="day-col"
              >
                <view
                  v-for="row in grid.rows"
                  :key="row.rowIndex"
                  class="slot"
                >
                  <CourseCard
                    v-if="cellOf(row, d.day).courses.length"
                    :courses="cellOf(row, d.day).courses"
                    :span-rows="cellOf(row, d.day).spanRows"
                    :show-weeks="true"
                    :is-current="isCurrentSlot(cellOf(row, d.day))"
                    @select="onEdit"
                  />
                  <!-- 空格子：点击新建 -->
                  <view
                    v-else
                    class="slot-empty"
                    @click="onAddAt(d.day, row.from)"
                  ></view>
                </view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </scroll-view>

    <!-- ── 底部导航 ── -->
    <BottomNav current="schedule" @nav="onNavChange" />

    <!-- ── 整体修改弹层 ── -->
    <TableEditSheet
      v-model:visible="sheetVisible"
      :courses="courses"
      @clear-all="onClearAll"
      @clear-day="onClearDay"
    />
  </view>
</template>

<script setup>
/**
 * 01 周课表主页
 * 设计依据：方案书 3.4 / 3.6 节
 *   - 顶部周次/日期栏 + 今日课程横滑卡片 + 7×10 网格
 *   - 点空格 → 新建；点课程 → 编辑
 *   - 连堂渲染为一个跨行色块；冲突上下分半 + 角标
 *   - 当前上课时段高亮描边
 */
import { ref, computed, onMounted } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import TimeColumn from '../../components/TimeColumn.vue'
import CourseCard from '../../components/CourseCard.vue'
import BottomNav from '../../components/BottomNav.vue'
import TableEditSheet from '../../components/TableEditSheet.vue'
import { pickFill, pickStroke } from '../../utils/color.js'
import {
  getCurrentWeek,
  getTodayWeekday,
  parseDate,
  formatDayNumber
} from '../../utils/week.js'
import { buildGrid, getTodayCourses, getCountdown } from '../../utils/schedule.js'
import { ICONS } from '../../utils/icons.js'
import {
  loadState,
  clearAllCourses,
  clearDayCourses
} from '../../utils/storage.js'
// 桌面小组件数据桥。
//   · utils/widget.js        —— 纯函数（组装 / 裁剪），可被 Node 自测直接 import
//   · utils/widget-bridge.js —— 原生桥接，**静态 import 了 UTS 插件**（仅 App 端编译）
// 这里把桥接实现注入给纯函数：静态 import 才会触发插件编译，
// 而又不让那条 import 污染自测（Node 不认识 #ifdef）。
import { syncWidget } from '../../utils/widget.js'
// #ifdef APP-PLUS
import { pushToNative } from '../../utils/widget-bridge.js'
// #endif

/* ── 状态 ── */
const statusBarHeight = ref(20)
const courses = ref([])
const semester = ref({ startDate: '2026-08-31', totalWeeks: 20 })
const settings = ref({ showWeekend: true, showEvening: true, highlightCurrent: true })
const timeSlots = ref([])
const scrollLeft = ref(0)
const sheetVisible = ref(false)
const now = ref(new Date())
/** 用户手动选择的周次；null = 跟随真实的本周 */
const viewWeek = ref(null)
const weekPickerVisible = ref(false)
let timer = null

/* ── 计算属性 ── */

/** 真实的本周（由开学日期算出），不受手动切换影响 */
const realWeek = computed(() =>
  getCurrentWeek(semester.value.startDate, semester.value.totalWeeks, now.value)
)

/** 当前展示的周次：优先取用户手动选中的，否则跟随真实本周 */
const currentWeek = computed(() => viewWeek.value || realWeek.value)

/** 可选周次列表 1 ~ 总周数 */
const weekList = computed(() =>
  Array.from({ length: semester.value.totalWeeks }, (_, i) => i + 1)
)

const todayWeekday = computed(() => getTodayWeekday(now.value))

const todayLabel = computed(() => ['一', '二', '三', '四', '五', '六', '日'][todayWeekday.value - 1])

/** 本周日期范围文案：08.31 – 09.06 */
const weekRangeText = computed(() => {
  const start = parseDate(semester.value.startDate)
  if (!start) return ''
  const offset = (currentWeek.value - 1) * 7
  const mon = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)

  const fmt = (d) => {
    const p = (n) => (n < 10 ? '0' + n : String(n))
    return `${p(d.getMonth() + 1)}.${p(d.getDate())}`
  }
  return `${fmt(mon)} – ${fmt(sun)}`
})

/** 网格表头：星期 + 日期号 + 是否今天 */
const dayHeaders = computed(() => {
  const start = parseDate(semester.value.startDate)
  const offset = (currentWeek.value - 1) * 7
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  const count = settings.value.showWeekend ? 7 : 5

  const out = []
  for (let i = 0; i < count; i++) {
    const d = start
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset + i)
      : new Date()
    out.push({
      day: i + 1,
      label: labels[i],
      num: formatDayNumber(d),
      isToday: i + 1 === todayWeekday.value
    })
  }
  return out
})

/** 网格数据（按当前周过滤） */
const grid = computed(() =>
  buildGrid(courses.value, currentWeek.value, {
    showWeekend: settings.value.showWeekend,
    showEvening: settings.value.showEvening
  })
)

const todayCourses = computed(() =>
  getTodayCourses(courses.value, todayWeekday.value, currentWeek.value)
)

const countdown = computed(() =>
  getCountdown(todayCourses.value, timeSlots.value, now.value)
)

/* ── 方法 ── */
function cellOf(row, day) {
  return row.cells.find((c) => c.day === day) || { courses: [], spanRows: 1 }
}

function fillOf(c) {
  return pickFill(c)
}

function strokeOf(c) {
  return pickStroke(c)
}

/** 该格是否为「当前正在上课」的时段 */
function isCurrentSlot(cell) {
  if (!settings.value.highlightCurrent) return false
  if (countdown.value.status !== 'ongoing') return false
  const cur = countdown.value.current
  if (!cur) return false
  return cell.courses.some((c) => c.id === cur.id)
}

function timeRangeOf(c) {
  const s = timeSlots.value.find((x) => x.section === c.sectionStart)
  const e = timeSlots.value.find((x) => x.section === c.sectionEnd)
  if (!s || !e) return ''
  return `${s.start} – ${e.end}`
}

function refresh() {
  const s = loadState()
  courses.value = s.courses
  semester.value = s.semester
  settings.value = s.settings
  timeSlots.value = s.timeSlots
  // 顺带把最新课表推给桌面小组件。
  // 放在这里而不是各改动点：refresh() 是「数据读取的唯一收口」，
  // 只要它被调用（进页面 / 返回页面 / 导入后 / 编辑后），桌面就会跟上。
  // 失败不影响主流程（H5 / 小程序或未打自定义基座时恒为 false，静默忽略）。
  // #ifdef APP-PLUS
  syncWidget(s, pushToNative)
  // #endif
}

function goToday() {
  now.value = new Date()
  viewWeek.value = null
  scrollLeft.value = 0
  weekPickerVisible.value = false
  uni.showToast({ title: `已回到第 ${realWeek.value} 周`, icon: 'none' })
}

function openWeekPicker() {
  weekPickerVisible.value = true
}

function pickWeek(w) {
  viewWeek.value = w
  weekPickerVisible.value = false
}

function onAddCourse() {
  uni.navigateTo({ url: '/pages/edit/course-edit' })
}

/** 空态引导：直接去导入页（与底部导航一致的栈行为，navigateTo 压栈） */
function goImport() {
  uni.navigateTo({ url: '/pages/import/import' })
}

function onAddAt(day, section) {
  uni.navigateTo({
    url: `/pages/edit/course-edit?day=${day}&section=${section}`
  })
}

function onEdit(course) {
  // 容错：course 可能缺 id（旧版数据 / 冲突格传入的不是首门课）。
  // 不用报错打断用户，改为就地补齐 —— 保证点击一定有响应。
  if (!course) return

  let target = course
  if (!target.id) {
    // 按「课程名 + 星期 + 起始节次」在列表里找回同一条
    const found = courses.value.find(
      (c) =>
        c.name === target.name &&
        c.day === target.day &&
        c.sectionStart === target.sectionStart
    )
    if (found) {
      target = found
    } else {
      // 实在没有 id 也没有同名课：生成一个临时 id，编辑页按内联数据回填
      target = { ...target, id: 'tmp_' + Date.now().toString(36) }
    }
  }

  // 除 id 外把整门课也带上：避免编辑页查不到时静默显示空表单。
  // 数据量小（单门课几 KB 以内），URL 长度无压力。
  const payload = encodeURIComponent(
    JSON.stringify({
      id: target.id,
      name: target.name,
      place: target.place,
      teacher: target.teacher,
      day: target.day,
      sectionStart: target.sectionStart,
      sectionEnd: target.sectionEnd,
      weeks: target.weeks,
      colorSeed: target.colorSeed
    })
  )
  uni.navigateTo({
    url: `/pages/edit/course-edit?id=${target.id}&data=${payload}`
  })
}

function onNavChange(key) {
  if (key === 'import') {
    uni.navigateTo({ url: '/pages/import/import' })
  } else if (key === 'settings') {
    uni.navigateTo({ url: '/pages/settings/settings' })
  }
}

function onBodyScroll(e) {
  scrollLeft.value = e.detail.scrollLeft
}

function onClearAll() {
  clearAllCourses()
  refresh()
  uni.showToast({ title: '已清空全部课程', icon: 'none' })
}

function onClearDay(day) {
  clearDayCourses(day)
  refresh()
  uni.showToast({ title: '已清空该天课程', icon: 'none' })
}

/* ── 生命周期 ── */
onMounted(() => {
  // 取状态栏高度，保证自定义导航不被刘海遮挡
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 20
  } catch (e) {
    statusBarHeight.value = 20
  }
  refresh()

  // 每分钟刷新一次倒计时（离线本地计算，无网络）
  timer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})

onShow(() => {
  refresh()
  now.value = new Date()
  // 页面重新可见时恢复定时器
  if (!timer) {
    timer = setInterval(() => {
      now.value = new Date()
    }, 60000)
  }
})

onHide(() => {
  // 页面隐藏时停掉定时器，省电
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

// 页面卸载（uni-app 页面级生命周期，比 Vue 的 onUnmounted 更可靠）
onUnload(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<style scoped>
.page {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--c-bg);
  overflow: hidden;
}

.status-bar {
  flex-shrink: 0;
  background-color: var(--c-bg);
}

/* ── 顶部 ── */
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8rpx 40rpx 28rpx;
}

.hd-left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.hd-week-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.hd-week {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.1;
  color: var(--c-text);
}

/* 周次下拉箭头 */
.hd-week-caret {
  width: 16rpx;
  height: 16rpx;
  border-right: 4rpx solid var(--c-text-meta);
  border-bottom: 4rpx solid var(--c-text-meta);
  transform: rotate(45deg) translate(-4rpx, -4rpx);
  transition: transform 0.18s ease;
}

.hd-week-caret.open {
  transform: rotate(-135deg) translate(-4rpx, -4rpx);
}

/* ── 周次选择浮层 ── */
.week-scrim {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(47, 79, 79, 0.42);
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 200rpx 60rpx 0;
}

.week-panel {
  width: 100%;
  max-height: 720rpx;
  background-color: var(--c-card);
  border-radius: var(--r-card);
  border: 2rpx solid var(--c-border-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 30rpx;
  border-bottom: 2rpx solid var(--c-divider);
  flex-shrink: 0;
}

.wp-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text);
}

.wp-close {
  font-size: 26rpx;
  color: var(--c-text-meta);
}

.wp-body {
  flex: 1;
  min-height: 0;
}

.wp-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 26rpx 30rpx 30rpx;
}

.wp-chip {
  width: calc((100% - 64rpx) / 5);
  height: 92rpx;
  border-radius: var(--r-block);
  background-color: var(--c-input-bg);
  border: 2rpx solid var(--c-border-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.wp-num {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text-sub);
}

/* 本周：淡青底标记 */
.wp-chip.today {
  background-color: #e0f0f0;
  border-color: #cfe6e6;
}

.wp-tag {
  font-size: 18rpx;
  line-height: 1;
  color: #3a7a7a;
}

/* 选中：主色实底 */
.wp-chip.active {
  background-color: var(--c-primary);
  border-color: var(--c-primary);
}

.wp-chip.active .wp-num,
.wp-chip.active .wp-tag {
  color: #1e3a3a;
}

.hd-date {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

.hd-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding-top: 6rpx;
}

.icon-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
  background-color: #ffffff;
  border: 2rpx solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn.primary {
  background-color: var(--c-primary);
  border-color: var(--c-primary);
}

.ic-target,
.ic-plus {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
}

/* ── 空态引导（首次打开：无任何课程） ── */
.empty-hint {
  margin: 0 40rpx 24rpx;
  padding: 28rpx 28rpx 26rpx;
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border-soft);
  border-radius: var(--r-card);
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.eh-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--c-text);
}

.eh-sub {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

.eh-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 14rpx;
}

.eh-btn {
  padding: 14rpx 34rpx;
  border-radius: var(--r-pill);
  background-color: #ffffff;
  border: 2rpx solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.eh-btn.primary {
  background-color: var(--c-primary);
  border-color: var(--c-primary);
}

.eh-btn-text {
  font-size: 26rpx;
  color: var(--c-text-sub);
}

.eh-btn.primary .eh-btn-text {
  color: #1e3a3a;
  font-weight: 600;
}

/* ── 今日课程卡 ── */
.top-wrap {
  padding: 0 40rpx 24rpx;
}

.today-card {
  background-color: var(--c-card);
  border-radius: var(--r-card);
  border: 2rpx solid var(--c-border-soft);
  padding: 24rpx 24rpx 26rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.tc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tc-title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.tc-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background-color: var(--c-primary);
}

.tc-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--c-text-sub);
}

.tc-countdown {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  background-color: var(--c-input-bg);
  color: var(--c-text-meta);
}

.tc-countdown.ongoing {
  background-color: #e8f4f4;
  color: #3a7a7a;
}

.tc-scroll {
  width: 100%;
  white-space: nowrap;
}

.tc-list {
  display: inline-flex;
  gap: 16rpx;
}

.today-item {
  width: 320rpx;
  flex-shrink: 0;
  padding: 18rpx 20rpx;
  border-radius: var(--r-block);
  border: 2rpx solid transparent;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.ti-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ti-time {
  font-size: 22rpx;
  color: var(--c-text-meta);
}

.ti-place {
  font-size: 21rpx;
  color: var(--c-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-empty {
  padding: 12rpx 0;
  font-size: 24rpx;
  color: var(--c-text-faint);
}

/* ── 网格 ── */
.grid-scroll {
  flex: 1;
  min-height: 0;
}

.grid-wrap {
  padding: 0 24rpx 24rpx;
  display: flex;
  flex-direction: column;
}

.day-head-row {
  display: flex;
  height: 76rpx;
  flex-shrink: 0;
}

.head-gutter {
  width: 68rpx;
  flex-shrink: 0;
}

.head-scroll {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.head-inner {
  display: inline-flex;
  gap: 8rpx;
}

.day-head {
  width: 128rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
  border-radius: var(--r-block);
}

.day-head.today {
  background-color: #e0f0f0;
}

.dh-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--c-text-sub);
}

.day-head.today .dh-label {
  color: #3a7a7a;
}

.dh-num {
  font-size: 20rpx;
  color: var(--c-text-faint);
}

.body-row {
  display: flex;
  flex: 1;
  min-height: 0;
}

.body-scroll {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.body-inner {
  display: inline-flex;
  gap: 8rpx;
}

.day-col {
  width: 128rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.slot {
  height: 292rpx;
  flex-shrink: 0;
}

.slot-empty {
  width: 100%;
  height: 100%;
  border-radius: var(--r-block);
  background-color: rgba(255, 255, 255, 0.45);
}
</style>
