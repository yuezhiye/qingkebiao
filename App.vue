<script setup>
/**
 * 应用根组件
 * 只做全局样式加载与本地数据预读，不承载界面、**不写入任何数据**。
 */
import { onLaunch } from '@dcloudio/uni-app'
import { loadState } from './utils/storage.js'

onLaunch(() => {
  // 只读取本地数据，**不写入任何内容**：
  //   · 首次打开即空白课表，由用户自行导入或手动新建
  //   · 不得在此预置示例数据 —— 否则「清空全部课程」后重启还会长回来，
  //     且示例课表会随 APK 分发（隐私约定见 config/courseData.js 文件头）
  loadState()
})
</script>

<style>
/* ── 全局主题变量（CSS 变量，便于统一换肤） ── */
page {
  /* 主色系 */
  --c-primary: #8fc9c9;
  --c-primary-dim: #b4dcdc;
  --c-bg: #eaf5f5;
  --c-text: #2f4f4f;
  --c-text-sub: #6e8e8e;
  --c-text-meta: #7a9a9a;
  --c-text-faint: #a0c0c0;

  /* 容器 */
  --c-card: #ffffff;
  --c-border: #d8ecec;
  --c-border-soft: #e4f0f0;
  --c-input-bg: #f7fbfb;
  --c-divider: #f0f7f7;

  /* 语义色 */
  --c-error: #c86e6e;
  --c-error-strong: #b45a5a;
  --c-error-bg: #fdf0f0;
  --c-error-border: #e8c8c8;
  --c-warn: #b08748;
  --c-warn-strong: #c89a5a;
  --c-warn-bg: #fbf6ef;

  /* 圆角（双写口径，与方案书 3.4 一致） */
  --r-block: 16rpx;
  --r-card: 24rpx;
  --r-pill: 999rpx;

  background-color: var(--c-bg);
  color: var(--c-text);
  font-family: 'PingFang SC', 'Helvetica Neue', Helvetica, 'Noto Sans SC',
    'Source Han Sans CN', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
}

/* ── 通用重置 ── */
view,
text,
scroll-view,
input,
textarea {
  box-sizing: border-box;
}

/* 数字/时间用等宽感更强的字体 */
.num {
  font-family: 'DIN Alternate', 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
