<template>
  <view class="page">
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- ── 顶部 ── -->
    <view class="header">
      <text class="hd-title">设置</text>
      <text class="hd-sub">{{ semester.name }} 学期 · 共 {{ semester.totalWeeks }} 周</text>
    </view>

    <scroll-view class="body" scroll-y :show-scrollbar="false">
      <!-- ── 学期 ── -->
      <view class="group">
        <text class="group-label">学期</text>
        <view class="card">
          <picker mode="date" :value="semester.startDate" @change="onStartDateChange">
            <view class="row" :class="{ 'is-last': false }">
              <view class="row-left">
                <text class="row-title">开学日期（第 1 周周一）</text>
                <text class="row-desc">当前为第 {{ currentWeek }} 周</text>
              </view>
              <view class="row-right">
                <text class="row-value">{{ semester.startDate }}</text>
                <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
              </view>
            </view>
          </picker>
          <view class="divider"></view>
          <picker mode="selector" :range="weekOptions" :value="weekIndex" @change="onTotalWeeksChange">
            <view class="row is-last">
              <text class="row-title">总周数</text>
              <view class="row-right">
                <text class="row-value">{{ semester.totalWeeks }} 周</text>
                <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
              </view>
            </view>
          </picker>
        </view>
      </view>

      <!-- ── 显示 ── -->
      <view class="group">
        <text class="group-label">显示</text>
        <view class="card">
          <view
            v-for="(s, i) in switchList"
            :key="s.key"
            class="row"
            :class="{ 'is-last': i === switchList.length - 1 }"
            @click="toggle(s.key)"
          >
            <text class="row-title">{{ s.label }}</text>
            <view class="switch" :class="{ on: settings[s.key] }">
              <view class="knob"></view>
            </view>
          </view>
        </view>
      </view>

      <!-- ── 节次时间 ── -->
      <view class="group">
        <text class="group-label">节次时间（可自定义）</text>
        <view class="card">
          <view
            v-for="(g, i) in sectionGroups"
            :key="g.key"
            class="row"
            :class="{ 'is-last': i === sectionGroups.length - 1 }"
            @click="onEditSection(g)"
          >
            <text class="row-title">{{ g.rangeText }}（{{ g.label }}）</text>
            <view class="row-right">
              <text class="row-value">{{ g.timeText }}</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </view>
        </view>
      </view>

      <!-- ── 数据 ── -->
      <view class="group">
        <text class="group-label">数据</text>
        <view class="card">
          <view class="row" @click="onExport">
            <view class="row-left">
              <text class="row-title">导出为标准文本</text>
              <text class="row-desc">（复制为「课程名|地点|老师|星期|节次|周次」格式，可粘贴回导入页）</text>
            </view>
            <view class="row-right">
              <text class="row-value">{{ courses.length }} 门课</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </view>
          <view class="divider"></view>
          <view class="row" @click="onExportJson">
            <view class="row-left">
              <text class="row-title">导出为 JSON 文件</text>
              <text class="row-desc">（生成 .json 备份并调起分享，微信/QQ 发给自己，可粘贴回导入页还原）</text>
            </view>
            <view class="row-right">
              <text class="row-value">{{ courses.length }} 门课</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </view>
          <view class="divider"></view>
          <view class="row is-last" @click="sheetVisible = true">
            <text class="row-title">整体修改</text>
            <view class="row-right">
              <text class="row-value">清空全部 / 某天</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </view>
        </view>
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>

    <!-- ── 底部导航 ── -->
    <BottomNav current="settings" @nav="onNavChange" />

    <!-- ── 整体修改弹层 ── -->
    <TableEditSheet
      v-model:visible="sheetVisible"
      :courses="courses"
      @clear-all="onClearAll"
      @clear-day="onClearDay"
    />

    <!-- ── 节次时间编辑弹层 ── -->
    <view v-if="slotVisible" class="scrim" @click="slotVisible = false">
      <view class="sheet" @click.stop>
        <view class="grabber-row"><view class="grabber"></view></view>
        <view class="sheet-header">
          <text class="sheet-title">{{ editingGroup.rangeText }}（{{ editingGroup.label }}）</text>
          <text class="sheet-desc">设置该段第一节课的开始与结束时间</text>
        </view>
        <view class="sheet-body">
          <view class="time-row">
            <text class="time-label">开始</text>
            <picker mode="time" :value="editStart" @change="onPickStart">
              <view class="time-box"><text class="time-text">{{ editStart }}</text></view>
            </picker>
          </view>
          <view class="time-row">
            <text class="time-label">结束</text>
            <picker mode="time" :value="editEnd" @change="onPickEnd">
              <view class="time-box"><text class="time-text">{{ editEnd }}</text></view>
            </picker>
          </view>
        </view>
        <view class="sheet-footer">
          <view class="btn-ghost" @click="onResetSlots"><text>恢复默认</text></view>
          <view class="btn-solid" @click="onSaveSlots"><text>保存</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 05 设置页
 * 设计依据：设计稿 05-设置.png
 *   4 组：学期 / 显示（3 开关）/ 节次时间（3 分段）/ 数据（导出、整体修改）
 * 约束：离线优先，所有改动落本地 storage，零网络请求。
 */
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import BottomNav from '../../components/BottomNav.vue'
import TableEditSheet from '../../components/TableEditSheet.vue'
import { ICONS } from '../../utils/icons.js'
import {
  loadState,
  setSemester,
  setSettings,
  setTimeSlot,
  resetTimeSlots,
  clearAllCourses,
  clearDayCourses
} from '../../utils/storage.js'
import { SECTION_GROUPS } from '../../config/times.js'
import { getCurrentWeek } from '../../utils/week.js'
import { exportToText, exportToJson, exportJsonFileName } from '../../utils/exporter.js'

const statusBarHeight = ref(20)

const semester = ref({ name: '', startDate: '2026-08-31', totalWeeks: 20 })
const settings = ref({ showWeekend: true, showEvening: true, highlightCurrent: true })
const timeSlots = ref([])
const courses = ref([])

const sheetVisible = ref(false)
const slotVisible = ref(false)
const editingGroup = ref(SECTION_GROUPS[0])
const editStart = ref('08:00')
const editEnd = ref('11:40')

const switchList = [
  { key: 'showWeekend', label: '显示周六、周日' },
  { key: 'showEvening', label: '显示晚间（9-10 节）' },
  { key: 'highlightCurrent', label: '上课时段高亮描边' }
]

/** 总周数下拉：16 ~ 26 周 */
const weekOptions = Array.from({ length: 11 }, (_, i) => `${16 + i} 周`)
const weekIndex = computed(() => {
  const i = Number(semester.value.totalWeeks) - 16
  return i >= 0 && i < weekOptions.length ? i : 4
})

const currentWeek = computed(() =>
  getCurrentWeek(semester.value.startDate, semester.value.totalWeeks, new Date())
)

/** 节次分组带实时时间文案（第 1 节开始时间 – 第 N 节结束时间） */
const sectionGroups = computed(() =>
  SECTION_GROUPS.map((g) => {
    const s = timeSlots.value.find((x) => x.section === g.from)
    const e = timeSlots.value.find((x) => x.section === g.to)
    return {
      ...g,
      timeText: s && e ? `${s.start} – ${e.end}` : g.timeText
    }
  })
)

function refresh() {
  const s = loadState()
  semester.value = s.semester
  settings.value = s.settings
  timeSlots.value = s.timeSlots
  courses.value = s.courses
}

function onStartDateChange(e) {
  setSemester({ startDate: e.detail.value })
  refresh()
}

function onTotalWeeksChange(e) {
  const weeks = 16 + Number(e.detail.value)
  setSemester({ totalWeeks: weeks })
  refresh()
}

function toggle(key) {
  setSettings({ [key]: !settings.value[key] })
  refresh()
}

function onEditSection(g) {
  editingGroup.value = g
  const s = timeSlots.value.find((x) => x.section === g.from)
  const e = timeSlots.value.find((x) => x.section === g.to)
  editStart.value = s ? s.start : '08:00'
  editEnd.value = e ? e.end : '11:40'
  slotVisible.value = true
}

function onPickStart(e) {
  editStart.value = e.detail.value
}

function onPickEnd(e) {
  editEnd.value = e.detail.value
}

/** 保存：把该段首节开始时间与本段末节结束时间写入 */
function onSaveSlots() {
  const g = editingGroup.value
  const s = timeSlots.value.find((x) => x.section === g.from)
  const e = timeSlots.value.find((x) => x.section === g.to)

  // 只改「本段第一次课的开始」和「本段最后一次课的结束」，中间节次时间保持不变
  if (s) setTimeSlot(g.from, editStart.value, s.end)
  if (e && e.section !== g.from) setTimeSlot(g.to, e.start, editEnd.value)

  slotVisible.value = false
  refresh()
  uni.showToast({ title: '已保存', icon: 'success' })
}

function onResetSlots() {
  resetTimeSlots()
  refresh()
  slotVisible.value = false
  uni.showToast({ title: '已恢复默认时间', icon: 'none' })
}

function onExport() {
  if (!courses.value.length) {
    uni.showToast({ title: '还没有课程可导出', icon: 'none' })
    return
  }
  const text = exportToText(courses.value)
  uni.setClipboardData({
    data: text,
    success: () => {
      uni.showToast({ title: '标准文本已复制到剪贴板', icon: 'none' })
    }
  })
}

/**
 * 导出为 JSON 文件：写入应用文档目录 → 调起系统分享（微信/QQ 发给自己即可拿到文件）
 * 分享实现：uni.shareWithSystem 在 5.24 基座只支持 text/image（真机实测），
 * 所以文件分享走 Native.js 的 ACTION_SEND + FileProvider（authority 逐一探测）；
 * 探测全部失败时降级为「完整 JSON 文本分享」（Intent 直传，不经过剪贴板，无截断）。
 * H5 端无系统分享，降级为复制到剪贴板。
 */
function onExportJson() {
  if (!courses.value.length) {
    uni.showToast({ title: '还没有课程可导出', icon: 'none' })
    return
  }
  const json = exportToJson(courses.value)
  const fileName = exportJsonFileName()

  // #ifdef APP-PLUS
  uni.showLoading({ title: '生成文件中', mask: true })
  plus.io.resolveLocalFileSystemURL(
    '_doc/',
    (dirEntry) => {
      dirEntry.getFile(
        fileName,
        { create: true },
        (fileEntry) => {
          fileEntry.createWriter(
            (writer) => {
              writer.onwrite = () => {
                uni.hideLoading()
                deliverJsonFile(fileName, json)
              }
              writer.onerror = () => {
                uni.hideLoading()
                uni.showToast({ title: '文件写入失败', icon: 'none' })
              }
              writer.write(json)
            },
            () => {
              uni.hideLoading()
              uni.showToast({ title: '创建写入器失败', icon: 'none' })
            }
          )
        },
        () => {
          uni.hideLoading()
          uni.showToast({ title: '创建文件失败', icon: 'none' })
        }
      )
    },
    () => {
      uni.hideLoading()
      uni.showToast({ title: '访问存储失败', icon: 'none' })
    }
  )
  // #endif

  // #ifndef APP-PLUS
  uni.setClipboardData({
    data: json,
    success: () => {
      uni.showToast({ title: 'H5 端已复制 JSON 到剪贴板', icon: 'none' })
    }
  })
  // #endif
}

/**
 * 把 JSON 文件交付到用户手里（App 端）
 * 首选：MediaStore 写入公共「下载」目录（Android 10+ 标准做法，零权限、不依赖 FileProvider 配置）；
 * 失败降级：分享完整 JSON 文本（Intent EXTRA_TEXT 直传，不经过剪贴板，无截断）
 */
function deliverJsonFile(fileName, json) {
  // 首选：写入「下载」目录
  if (saveJsonToDownloads(fileName, json)) {
    uni.showModal({
      title: '导出成功',
      content: `已保存到手机「下载」目录：\n${fileName}\n\n微信发给自己：聊天窗口 →「+」→ 文件 → 手机存储 → Download 目录选择它；也可用文件管理器查看。`,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#3a7a7a'
    })
    return
  }
  // 降级：文本分享（完整 JSON 直传，无截断）
  uni.shareWithSystem({
    type: 'text',
    summary: json,
    success: () => {
      uni.showToast({ title: '已按文本分享完整 JSON，发给自己即可', icon: 'none' })
    },
    fail: () => {
      uni.showToast({ title: '分享失败，可改用「导出为标准文本」', icon: 'none' })
    }
  })
}

/**
 * 通过 MediaStore.Downloads 写入公共下载目录（需 Android 10 / API 29+，无需任何权限）
 * @returns {boolean} 是否成功
 */
function saveJsonToDownloads(fileName, json) {
  try {
    const main = plus.android.runtimeMainActivity()
    const Build = plus.android.importClass('android.os.Build')
    if (Number(Build.VERSION.SDK_INT) < 29) return false // 旧版需存储权限，放弃

    const ContentValues = plus.android.importClass('android.content.ContentValues')
    const MediaStore = plus.android.importClass('android.provider.MediaStore')
    const JString = plus.android.importClass('java.lang.String')

    const cr = main.getContentResolver()
    plus.android.importClass(cr)

    const values = new ContentValues()
    values.put('_display_name', fileName)
    values.put('mime_type', 'application/json')
    const uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    if (!uri) return false
    plus.android.importClass(uri)

    const os = cr.openOutputStream(uri)
    plus.android.importClass(os)
    try {
      os.write(new JString(json).getBytes('UTF-8'))
      os.flush()
    } finally {
      os.close()
    }
    return true
  } catch (e) {
    console.log('[export] 写入下载目录失败，降级文本分享:', e)
    return false
  }
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

function onNavChange(key) {
  // 回课表：一次性退回栈底（二级页互跳走 redirectTo，栈恒为「课表+当前页」两层，一步即达）
  if (key === 'schedule') {
    const depth = getCurrentPages().length
    uni.navigateBack({
      delta: Math.max(depth - 1, 1),
      fail: () => uni.reLaunch({ url: '/pages/index/index' })
    })
  } else if (key === 'import') {
    // redirectTo 替换当前页：栈不增长，课表永远一步可达
    uni.redirectTo({ url: '/pages/import/import' })
  }
}

onMounted(() => {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 20
  } catch (e) {
    statusBarHeight.value = 20
  }
  refresh()
})

onShow(() => {
  refresh()
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
}

/* ── 顶部 ── */
.header {
  padding: 8rpx 40rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.hd-title {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  color: var(--c-text);
}

.hd-sub {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

/* ── 主体 ── */
.body {
  flex: 1;
  min-height: 0;
  padding: 0 40rpx;
}

.group {
  margin-bottom: 26rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.group-label {
  font-size: 24rpx;
  color: var(--c-text-meta);
  padding-left: 6rpx;
}

.card {
  background-color: var(--c-card);
  border-radius: var(--r-card);
  border: 2rpx solid var(--c-border-soft);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 108rpx;
  padding: 20rpx 28rpx;
  gap: 20rpx;
}

.row-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 28rpx;
  color: var(--c-text);
}

.row-desc {
  font-size: 22rpx;
  color: var(--c-text-faint);
}

.row-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.row-value {
  font-size: 26rpx;
  color: var(--c-text-meta);
}

.ic-chev {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}

.divider {
  height: 2rpx;
  margin-left: 28rpx;
  background-color: var(--c-divider);
}

/* ── 开关 ── */
.switch {
  width: 88rpx;
  height: 50rpx;
  border-radius: 999rpx;
  background-color: #dcebeb;
  padding: 5rpx;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: background-color 0.18s ease;
}

.switch.on {
  background-color: var(--c-primary);
}

.knob {
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  background-color: #ffffff;
  transition: transform 0.18s ease;
}

.switch.on .knob {
  transform: translateX(38rpx);
}

.bottom-spacer {
  height: 20rpx;
}

/* ── 节次时间弹层 ── */
.scrim {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(47, 79, 79, 0.45);
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  width: 100%;
  background-color: var(--c-card);
  border-top-left-radius: 32rpx;
  border-top-right-radius: 32rpx;
  padding-bottom: 40rpx;
}

.grabber-row {
  display: flex;
  justify-content: center;
  padding: 16rpx 0 8rpx;
}

.grabber {
  width: 72rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background-color: #d8ecec;
}

.sheet-header {
  padding: 8rpx 40rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.sheet-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--c-text);
}

.sheet-desc {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

.sheet-body {
  padding: 0 40rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  border-radius: var(--r-card);
  background-color: var(--c-input-bg);
  border: 2rpx solid var(--c-border-soft);
}

.time-label {
  font-size: 28rpx;
  color: var(--c-text-sub);
}

.time-box {
  padding: 8rpx 20rpx;
  border-radius: var(--r-pill);
  background-color: #ffffff;
  border: 2rpx solid var(--c-border);
}

.time-text {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--c-text);
}

.sheet-footer {
  padding: 32rpx 40rpx 0;
  display: flex;
  gap: 16rpx;
}

.btn-ghost,
.btn-solid {
  height: 92rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}

.btn-ghost {
  width: 220rpx;
  background-color: var(--c-input-bg);
  border: 2rpx solid var(--c-border);
  color: var(--c-text-sub);
}

.btn-solid {
  flex: 1;
  background-color: var(--c-primary);
  color: #1e3a3a;
}
</style>
