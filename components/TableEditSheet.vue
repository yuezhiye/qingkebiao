<template>
  <!--
    整体修改弹层（方案书 3.2 节：components/TableEditSheet.vue，是弹层组件而非独立路由页）
    功能：清空全部 / 清空某天
  -->
  <view v-if="visible" class="scrim" @click="close">
    <view class="sheet" @click.stop>
      <view class="grabber-row">
        <view class="grabber"></view>
      </view>

      <view class="sheet-header">
        <text class="sheet-title">整体修改</text>
        <text class="sheet-desc">批量清理课表内容，操作不可撤销</text>
      </view>

      <view class="sheet-body">
        <!-- 清空全部 -->
        <view class="danger-card" @click="onClearAll">
          <view class="dc-left">
            <text class="dc-title">清空全部课程</text>
            <text class="dc-desc">共 {{ total }} 门课将被删除</text>
          </view>
          <view class="dc-arrow"></view>
        </view>

        <!-- 按天清空 -->
        <text class="group-label">清空某一天</text>
        <view class="day-grid">
          <view
            v-for="d in days"
            :key="d.value"
            class="day-chip"
            :class="{ empty: !countOf(d.value) }"
            @click="onClearDay(d.value)"
          >
            <text class="chip-label">{{ d.label }}</text>
            <text class="chip-count">{{ countOf(d.value) }} 门</text>
          </view>
        </view>
      </view>

      <view class="sheet-footer">
        <view class="btn-cancel" @click="close">
          <text>关闭</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  courses: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:visible', 'clear-all', 'clear-day'])

const days = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 }
]

const total = computed(() => props.courses.length)

function countOf(day) {
  return props.courses.filter((c) => c.day === day).length
}

function close() {
  emit('update:visible', false)
}

function onClearAll() {
  uni.showModal({
    title: '清空全部课程',
    content: `将删除全部 ${total.value} 门课程，此操作不可撤销。确定继续吗？`,
    confirmColor: '#b45a5a',
    success: (res) => {
      if (res.confirm) {
        emit('clear-all')
        close()
      }
    }
  })
}

function onClearDay(day) {
  const n = countOf(day)
  if (!n) {
    uni.showToast({ title: '这一天没有课', icon: 'none' })
    return
  }
  const label = days.find((d) => d.value === day).label
  uni.showModal({
    title: `清空${label}`,
    content: `将删除${label}的 ${n} 门课程，此操作不可撤销。确定继续吗？`,
    confirmColor: '#b45a5a',
    success: (res) => {
      if (res.confirm) {
        emit('clear-day', day)
        close()
      }
    }
  })
}
</script>

<style scoped>
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
  gap: 6rpx;
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
  gap: 20rpx;
}

.danger-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  border-radius: var(--r-card);
  background-color: var(--c-error-bg);
  border: 2rpx solid var(--c-error-border);
}

.dc-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.dc-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--c-error-strong);
}

.dc-desc {
  font-size: 24rpx;
  color: var(--c-error);
}

.dc-arrow {
  width: 16rpx;
  height: 16rpx;
  border-right: 3rpx solid var(--c-error);
  border-top: 3rpx solid var(--c-error);
  transform: rotate(45deg);
}

.group-label {
  font-size: 24rpx;
  color: var(--c-text-meta);
  padding-left: 4rpx;
}

.day-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.day-chip {
  width: calc((100% - 28rpx) / 3);
  padding: 20rpx 0;
  border-radius: var(--r-card);
  background-color: var(--c-input-bg);
  border: 2rpx solid var(--c-border-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.day-chip.empty {
  opacity: 0.45;
}

.chip-label {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text);
}

.chip-count {
  font-size: 22rpx;
  color: var(--c-text-meta);
}

.sheet-footer {
  padding: 32rpx 40rpx 0;
}

.btn-cancel {
  height: 92rpx;
  border-radius: var(--r-pill);
  background-color: var(--c-input-bg);
  border: 2rpx solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  color: var(--c-text-sub);
}
</style>
