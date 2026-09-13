<template>
  <view class="page">
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- ── 顶部 ── -->
    <view class="header">
      <view class="hd-back" @click="onBack">
        <image class="ic-back" :src="ICONS.back" mode="aspectFit" />
      </view>
      <text class="hd-title">{{ isEdit ? '编辑课程' : '新建课程' }}</text>
      <view class="hd-holder"></view>
    </view>

    <scroll-view class="body" scroll-y :show-scrollbar="false">
      <!-- 课程名 -->
      <view class="field">
        <view class="label-row">
          <text class="label">课程名</text>
          <text class="required">必填</text>
        </view>
        <input
          v-model="form.name"
          class="input"
          placeholder="如：形势与政策"
          placeholder-class="ph"
          :maxlength="40"
        />
      </view>

      <!-- 地点 -->
      <view class="field">
        <text class="label">地点</text>
        <input
          v-model="form.place"
          class="input"
          placeholder="如：某某教学楼xxx教室"
          placeholder-class="ph"
          :maxlength="60"
        />
      </view>

      <!-- 老师 -->
      <view class="field">
        <text class="label">老师</text>
        <input
          v-model="form.teacher"
          class="input"
          placeholder="如：xxx老师"
          placeholder-class="ph"
          :maxlength="30"
        />
      </view>

      <!-- 星期 + 节次 -->
      <view class="field">
        <text class="label">星期与节次</text>
        <view class="select-row">
          <picker
            class="picker"
            mode="selector"
            :range="dayRange"
            :value="dayIndex"
            @change="onDayChange"
          >
            <view class="picker-box">
              <text class="picker-text">{{ dayText }}</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </picker>

          <picker
            class="picker"
            mode="selector"
            :range="sectionRange"
            :value="sectionIndex"
            @change="onSectionChange"
          >
            <view class="picker-box">
              <text class="picker-text">{{ sectionText }}</text>
              <image class="ic-chev" :src="ICONS.chevron" mode="aspectFit" />
            </view>
          </picker>
        </view>
      </view>

      <!-- 周次 -->
      <view class="field">
        <view class="label-row">
          <text class="label">上课周次</text>
          <text class="hint">点击下方快捷方式可自动填入</text>
        </view>

        <view class="chip-row">
          <view
            v-for="c in weekModes"
            :key="c.key"
            class="chip"
            :class="{ active: weekMode === c.key }"
            @click="applyWeekMode(c.key)"
          >
            <text>{{ c.label }}</text>
          </view>
        </view>

        <input
          v-model="weekInput"
          class="input"
          placeholder="如：2-3,6-13 或 1-16单"
          placeholder-class="ph"
          :maxlength="60"
        />

        <view class="preview" :class="{ error: weekPreviewError }">
          <text v-if="weekPreviewError">{{ weekPreviewError }}</text>
          <text v-else>{{ weekPreviewText }}</text>
        </view>
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>

    <!-- ── 底部操作 ── -->
    <view class="footer">
      <view v-if="isEdit" class="btn-delete" @click="onDelete">
        <text>删除</text>
      </view>
      <view class="btn-confirm" @click="onConfirm">
        <text>确定</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 课程编辑页
 * 设计依据：方案书 3.2 节的 edit/course-edit.vue + 3.4 节表单规范
 *   - 字段：课程名（必填）/ 地点 / 老师 / 星期 / 节次 / 周次
 *   - 周次三快捷方式：每周全上 / 区间 / 单双周
 *   - 实时预览解析结果
 */
import { ref, computed, onMounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { parseWeeks } from '../../utils/parser.js'
import { upsertCourse, removeCourse, getCourses } from '../../utils/storage.js'
import { formatWeeks } from '../../utils/week.js'
import { makeCourseId } from '../../utils/id.js'
import { ICONS } from '../../utils/icons.js'

const statusBarHeight = ref(20)
const editId = ref('')
const isEdit = computed(() => !!editId.value)

const form = ref({
  name: '',
  place: '',
  teacher: ''
})

const dayRange = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const dayIndex = ref(0)
const dayText = computed(() => dayRange[dayIndex.value])

/**
 * 节次可选项：与网格 5 行严格一一对应（每 2 节一行）
 *
 * ⚠️ 不再提供「单节」选项（如"第 1 节"）—— 网格按 2 节一行渲染，
 * 单节与连堂在同一格里长得完全一样，保留单节只会造成困惑。
 * 见 2026-09-11 决策：节次粒度统一为「行粒度」。
 */
const sectionOptions = [
  { label: '第 1-2 节', from: 1, to: 2 },
  { label: '第 3-4 节', from: 3, to: 4 },
  { label: '第 5-6 节', from: 5, to: 6 },
  { label: '第 7-8 节', from: 7, to: 8 },
  { label: '第 9-10 节', from: 9, to: 10 }
]
const sectionRange = sectionOptions.map((s) => s.label)
const sectionIndex = ref(0)
const sectionText = computed(() => sectionRange[sectionIndex.value])

const weekMode = ref('range')
const weekInput = ref('')
const weekModes = [
  { key: 'all', label: '每周全上' },
  { key: 'range', label: '区间' },
  { key: 'parity', label: '单双周' }
]

/** 周次解析（实时预览） */
const parsedWeeks = computed(() => {
  if (weekMode.value === 'all') return [[1, 20]]
  return parseWeeks(weekInput.value)
})

const weekPreviewText = computed(() => {
  if (weekMode.value === 'all') return '每周都上课'
  if (!weekInput.value.trim()) return '请输入周次，如 2-3,6-13'
  const w = parsedWeeks.value
  if (!w) return '格式无法识别'
  return formatWeeks(w) + ' 上课'
})

const weekPreviewError = computed(() => {
  if (weekMode.value === 'all') return ''
  if (!weekInput.value.trim()) return ''
  return parsedWeeks.value ? '' : '周次格式无法识别，请检查写法'
})

function applyWeekMode(key) {
  weekMode.value = key
  if (key === 'all') weekInput.value = ''
}

function onDayChange(e) {
  dayIndex.value = Number(e.detail.value)
}

function onSectionChange(e) {
  sectionIndex.value = Number(e.detail.value)
}

function onBack() {
  uni.navigateBack()
}

function onConfirm() {
  const name = form.value.name.trim()
  if (!name) {
    uni.showToast({ title: '请填写课程名', icon: 'none' })
    return
  }

  const weeks = parsedWeeks.value
  if (!weeks) {
    uni.showToast({ title: '周次格式有误', icon: 'none' })
    return
  }

  const sec = sectionOptions[sectionIndex.value]

  const course = {
    id: editId.value || makeCourseId(),
    name,
    place: form.value.place.trim() || '未知',
    teacher: form.value.teacher.trim() || '未知',
    day: dayIndex.value + 1,
    sectionStart: sec.from,
    sectionEnd: sec.to,
    weeks,
    colorSeed: name
  }

  upsertCourse(course)
  uni.showToast({ title: isEdit.value ? '已保存' : '已添加', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 600)
}

function onDelete() {
  uni.showModal({
    title: '删除课程',
    content: `确定删除「${form.value.name}」吗？`,
    confirmColor: '#b45a5a',
    success: (res) => {
      if (res.confirm) {
        removeCourse(editId.value)
        uni.showToast({ title: '已删除', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 600)
      }
    }
  })
}

/** 把一条课程数据填进表单（编辑回填 & 兜底查询共用） */
function fillForm(c) {
  if (!c) return false

  form.value = {
    name: c.name || '',
    place: c.place || '',
    teacher: c.teacher || ''
  }
  dayIndex.value = (c.day || 1) - 1

  // 按 sectionStart 定位选中的行（只比 from，不比 to）——
  // 兼容导入进来的「单节」数据（如 sectionStart=1, sectionEnd=1），
  // 自动归到「第 1-2 节」选项，保存后统一为行粒度。
  const si = sectionOptions.findIndex((s) => s.from === c.sectionStart)
  sectionIndex.value = si >= 0 ? si : 0

  // 周次回填
  if (Array.isArray(c.weeks) && c.weeks.length) {
    const hasParity = c.weeks.some((t) => t[2])
    weekMode.value = hasParity ? 'parity' : 'range'
    weekInput.value = c.weeks
      .map((t) => {
        const range = t[0] === t[1] ? `${t[0]}` : `${t[0]}-${t[1]}`
        return t[2] ? `${range}${t[2]}` : range
      })
      .join(',')
  } else {
    weekMode.value = 'range'
    weekInput.value = ''
  }
  return true
}

/**
 * 容错解析 URL 带来的课程数据
 *
 * uni-app 对 query 参数会**自动解码一次**，但各端行为不完全一致（H5 与 App 有差异）。
 * 所以这里不假设解码次数：先直接 parse，失败再尝试 decodeURIComponent 后 parse。
 */
function parseCourseParam(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    /* 继续尝试解码一次 */
  }
  try {
    return JSON.parse(decodeURIComponent(raw))
  } catch (e) {
    return null
  }
}

onLoad((opts = {}) => {
  // ── 编辑模式 ──
  if (opts.id) {
    editId.value = opts.id

    // 优先用跳转时带过来的完整数据（最可靠，不依赖本地查询）
    let filled = false
    const fromUrl = parseCourseParam(opts.data)

    if (fromUrl) {
      filled = fillForm(fromUrl)
    } else if (opts.data) {
      console.warn('[course-edit] URL 数据解析失败，回退到本地查询')
    }

    // 兜底：从本地存储按 id 查（兼容旧版跳转 / 数据异常）
    if (!filled) {
      const found = getCourses().find((x) => x.id === opts.id)
      filled = fillForm(found)
    }

    // 实在查不到：不静默留空，明确提示用户
    if (!filled) {
      uni.showToast({ title: '未找到该课程，请返回重试', icon: 'none' })
    }
    return
  }

  // ── 新建模式 ──
  // 可用 URL 参数预填星期与节次（从空格子点击进入）
  if (opts.day) dayIndex.value = Number(opts.day) - 1
  if (opts.section) {
    const si = sectionOptions.findIndex((s) => s.from === Number(opts.section))
    if (si >= 0) sectionIndex.value = si
  }
  weekMode.value = 'range'
})

onMounted(() => {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 20
  } catch (e) {
    statusBarHeight.value = 20
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
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 40rpx 24rpx;
}

.hd-back,
.hd-holder {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background-color: #ffffff;
  border: 2rpx solid var(--c-border);
}

.hd-holder {
  background-color: transparent;
  border-color: transparent;
}

.ic-back {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
}

.hd-title {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--c-text);
}

.body {
  flex: 1;
  min-height: 0;
  padding: 0 40rpx;
}

/* ── 字段 ── */
.field {
  margin-bottom: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.label-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--c-text-sub);
}

.required {
  font-size: 21rpx;
  color: var(--c-error);
}

.hint {
  font-size: 21rpx;
  color: var(--c-text-faint);
}

.input {
  width: 100%;
  height: 92rpx;
  padding: 0 24rpx;
  border-radius: var(--r-card);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border-soft);
  font-size: 28rpx;
  color: var(--c-text);
}

.ph {
  color: #b4d0d0;
  font-size: 28rpx;
}

/* ── 选择器 ── */
.select-row {
  display: flex;
  gap: 16rpx;
}

.picker {
  flex: 1;
}

.picker-box {
  height: 92rpx;
  padding: 0 22rpx;
  border-radius: var(--r-card);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-text {
  font-size: 28rpx;
  color: var(--c-text);
}

.ic-chev {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
}

/* ── 周次快捷 ── */
.chip-row {
  display: flex;
  gap: 14rpx;
}

.chip {
  padding: 14rpx 26rpx;
  border-radius: var(--r-pill);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border);
  font-size: 25rpx;
  color: var(--c-text-sub);
}

.chip.active {
  background-color: var(--c-primary);
  border-color: var(--c-primary);
  color: #1e3a3a;
  font-weight: 600;
}

.preview {
  padding: 16rpx 22rpx;
  border-radius: var(--r-block);
  background-color: #f2fafa;
  font-size: 24rpx;
  line-height: 1.5;
  color: #3a7a7a;
}

.preview.error {
  background-color: var(--c-error-bg);
  color: var(--c-error-strong);
}

.bottom-spacer {
  height: 24rpx;
}

/* ── 底部 ── */
.footer {
  flex-shrink: 0;
  padding: 20rpx 40rpx 42rpx;
  display: flex;
  gap: 16rpx;
}

.btn-delete {
  width: 200rpx;
  height: 96rpx;
  border-radius: var(--r-pill);
  background-color: var(--c-error-bg);
  border: 2rpx solid var(--c-error-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-error-strong);
}

.btn-confirm {
  flex: 1;
  height: 96rpx;
  border-radius: var(--r-pill);
  background-color: var(--c-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a3a;
}
</style>
