<template>
  <!--
    时间列（网格左侧）
    设计依据：方案书 3.4 节 —— 网格右侧为 7 天 × 5 行时段
    每行显示该行的起始节次与时间，如 "1 / 08:00"
  -->
  <view class="time-col">
    <view v-for="row in rows" :key="row.rowIndex" class="time-cell">
      <text class="t-sec">{{ row.from }}</text>
      <text class="t-time">{{ timeOf(row.from) }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  /** 网格行定义：[{from, to}] */
  rows: { type: Array, default: () => [] },
  /** 节次时间表 */
  timeSlots: { type: Array, default: () => [] }
})

function timeOf(section) {
  const s = props.timeSlots.find((x) => x.section === section)
  return s ? s.start : ''
}
</script>

<style scoped>
.time-col {
  width: 68rpx; /* 34px */
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.time-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.t-sec {
  font-size: 24rpx;
  font-weight: 600;
  line-height: 1;
  color: var(--c-text-meta);
}

.t-time {
  font-size: 20rpx;
  line-height: 1;
  color: var(--c-text-faint);
}
</style>
