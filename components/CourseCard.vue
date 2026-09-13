<template>
  <!--
    课程色块（网格单元格内容）
    设计依据：方案书 3.4 节
      - 每个网格行独立渲染（不跨行合并）
      - 冲突格上下分半显示 + 角标标注各自周次
      - 第二行显示上课地点（2026-09-11 由周次改为教室）
      - 零阴影平面化，用同色系描边做层次
      - 圆角 16rpx
  -->
  <view
    v-if="courses.length"
    class="block"
    :class="{ 'is-conflict': isConflict, 'is-current': isCurrent }"
    :style="blockStyle"
    @click.stop="$emit('select', courses[0])"
  >
    <!-- 单门课：直接铺满 -->
    <template v-if="!isConflict">
      <text class="blk-name">{{ courses[0].name }}</text>
      <text v-if="showWeeks" class="blk-place">{{ placeText }}</text>
    </template>

    <!-- 冲突：上下均分 + 每半右上角标周次 -->
    <template v-else>
      <view
        v-for="(c, i) in visibleCourses"
        :key="c.id"
        class="half"
        :style="{ background: fillOf(c) }"
        @click.stop="$emit('select', c)"
      >
        <text class="half-name">{{ c.name }}</text>
        <text class="half-badge">{{ badgeOf(c) }}</text>
      </view>
      <text v-if="courses.length > 2" class="more-badge">
        +{{ courses.length - 2 }}
      </text>
    </template>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { pickColor, pickFill } from '../utils/color.js'
import { formatWeeksShort } from '../utils/week.js'

const props = defineProps({
  /** 该格命中的课程（1 门 = 正常；≥2 门 = 冲突） */
  courses: { type: Array, default: () => [] },
  /** 是否显示色块第二行（地点小字） */
  showWeeks: { type: Boolean, default: true },
  /** 是否跨行（连堂） */
  spanRows: { type: Number, default: 1 },
  /** 是否当前上课时段（高亮描边） */
  isCurrent: { type: Boolean, default: false }
})

// ⚠️ 事件名不能用 'tap'：uni-app 把 tap/click 当原生事件，父组件的 @tap
// 会收到「事件对象」而非我们 emit 的课程数据（曾导致编辑页回填全空）。
defineEmits(['select'])

const isConflict = computed(() => props.courses.length > 1)

/** 冲突格最多上下展示 2 门，更多用 +N 角标 */
const visibleCourses = computed(() => props.courses.slice(0, 2))

const first = computed(() => props.courses[0] || {})

const blockStyle = computed(() => {
  const c = pickColor(first.value)
  return {
    background: c.fill,
    borderColor: c.stroke
  }
})

/** 色块第二行：显示上课地点（原为周次，2026-09-11 按需求改为教室） */
const placeText = computed(() => {
  const p = (first.value.place || '').trim()
  return p || '未填写地点'
})

function fillOf(c) {
  return pickFill(c)
}

/** 冲突格角标：短周次，如 "15周" / "16-18周" */
function badgeOf(c) {
  const t = formatWeeksShort(c.weeks)
  return t === '每周' ? '每周' : t + '周'
}
</script>

<style scoped>
.block {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14rpx 10rpx;
  border-radius: var(--r-block);
  border: 2rpx solid transparent;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

/* 当前时段高亮：加一圈主色描边（设置页可关） */
.block.is-current {
  border-color: var(--c-primary) !important;
  border-width: 3rpx;
}

.blk-name {
  /* 色块宽 128rpx，课名是唯一核心信息，字号给足 */
  font-size: 26rpx;
  line-height: 1.3;
  font-weight: 600;
  color: var(--c-text);
  word-break: break-all;
}

/* 色块第二行：上课地点（原为周次小字，2026-09-11 改为教室） */
.blk-place {
  margin-top: 6rpx;
  font-size: 20rpx;
  line-height: 1.2;
  color: var(--c-text-meta);
  word-break: break-all;
}

/* ── 冲突格 ── */
.block.is-conflict {
  padding: 0;
  border-color: #e6d5b8;
}

.half {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 12rpx 10rpx 8rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.half-name {
  font-size: 23rpx;
  line-height: 1.24;
  font-weight: 600;
  color: var(--c-text);
  word-break: break-all;
  /* 冲突格空间紧张，超 2 行截断 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 角标：贴右上角，浅底深字，标注该课周次 */
.half-badge {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  font-size: 18rpx;
  line-height: 1;
  padding: 4rpx 8rpx;
  border-radius: 6rpx;
  color: #ffffff;
  background-color: rgba(47, 79, 79, 0.62);
}

.more-badge {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  font-size: 18rpx;
  line-height: 1;
  padding: 4rpx 8rpx;
  border-radius: 6rpx;
  color: #ffffff;
  background-color: rgba(176, 135, 72, 0.9);
}
</style>
