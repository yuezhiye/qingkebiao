<template>
  <!-- 胶囊式底部导航（方案书 3.4 节：底部导航胶囊 999rpx） -->
  <view class="nav-wrap">
    <view class="nav-pill">
      <view
        v-for="item in items"
        :key="item.key"
        class="nav-item"
        :class="{ active: item.key === current }"
        @click="onTap(item)"
      >
        <!-- 用 SVG（data-uri）图标而非 emoji / 字母，保证视觉一致且 App 端可渲染 -->
        <image class="nav-icon" :src="iconOf(item)" mode="aspectFit" />
        <text class="nav-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
/**
 * 底部胶囊导航
 * 3 个标签：课表 / 导入 / 设置
 * 「导入」使用 navigateTo（非 tab 页），其余 switchTab 语义由外部处理
 */
import { ICONS } from '../utils/icons.js'

const props = defineProps({
  /** 当前激活标签：schedule | import | settings */
  current: { type: String, default: 'schedule' },
  /** 是否显示「导入」项 */
  showImport: { type: Boolean, default: true }
})

// ⚠️ 事件名避开原生事件名（change/click/tap 等在 uni-app 里可能被当作原生事件，
// 导致父组件收到事件对象而非我们 emit 的 key）。统一用 'nav'。
const emit = defineEmits(['nav'])

const items = [
  { key: 'schedule', label: '课表' },
  ...(props.showImport ? [{ key: 'import', label: '导入' }] : []),
  { key: 'settings', label: '设置' }
]

/** 按 key + 激活状态取图标 */
const ICON_MAP = {
  schedule: { idle: ICONS.navScheduleIdle, active: ICONS.navScheduleActive },
  import: { idle: ICONS.navImportIdle, active: ICONS.navImportActive },
  settings: { idle: ICONS.navSettingsIdle, active: ICONS.navSettingsActive }
}

function iconOf(item) {
  const set = ICON_MAP[item.key]
  if (!set) return ''
  return item.key === props.current ? set.active : set.idle
}

function onTap(item) {
  if (item.key === props.current) return
  emit('nav', item.key)
}
</script>

<style scoped>
.nav-wrap {
  padding: 0 24rpx 42rpx; /* 底部留 42rpx ≈ 21px，为安全区 */
  background-color: transparent;
}

.nav-pill {
  display: flex;
  align-items: center;
  height: 124rpx; /* 62px */
  padding: 8rpx;
  border-radius: var(--r-pill);
  background-color: #ffffff;
  border: 2rpx solid #cfe6e6;
}

.nav-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: 52rpx;
  color: var(--c-text-meta);
  transition: background-color 0.18s ease, color 0.18s ease;
}

.nav-item.active {
  background-color: var(--c-primary);
  color: #1e3a3a;
}

.nav-icon {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
}

.nav-label {
  font-size: 22rpx;
  line-height: 1;
  letter-spacing: 0.5rpx;
}
</style>
