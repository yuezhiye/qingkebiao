<template>
  <view class="page">
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- ── 顶部 ── -->
    <view class="header">
      <view class="hd-left">
        <text class="hd-title">课表导入</text>
        <text class="hd-sub">粘贴教务表格原文、AI 生成的 JSON 或标准文本</text>
      </view>
      <view class="hd-btns">
        <view class="btn-copy" @click="onShowRules">
          <text>使用规则</text>
        </view>
        <view class="btn-copy" @click="fileBridge.onClick">
          <text>导入文件</text>
        </view>
        <view class="btn-copy btn-copy-main" @click="onCopyPrompt">
          <text>复制提示词</text>
        </view>
      </view>
    </view>

    <scroll-view class="body" scroll-y :show-scrollbar="false">
      <!-- ── 粘贴区 ── -->
      <view class="paste-wrap">
        <textarea
          v-model="inputText"
          class="paste-box"
          :class="{ 'has-error': errors.length > 0 }"
          :placeholder="pastePlaceholder"
          placeholder-class="ph"
          :maxlength="-1"
          auto-height
        />
        <view class="paste-footer">
          <text class="pf-count">{{ fileLoaded ? '已载入文件' : '已粘贴 ' + lineCount + ' 行' }}</text>
          <text v-if="activeSource" class="pf-clear" @click="onClear">清空</text>
        </view>
      </view>

      <!-- ── 空态引导（未输入任何内容时可见） ── -->
      <view v-if="!activeSource" class="empty-guide" @click="onShowRules">
        <text class="eg-text">不清楚怎么用？点这里看「使用规则」</text>
        <text class="eg-sub">有课表 .txt 文件？点上方「导入文件」直接选择，最准（.xls 需先用电脑记事本另存为 .txt）</text>
        <text class="eg-sub">没有文件？用「方案 2 · AI 法」：点「复制提示词」发给 AI，再把返回的 JSON 粘回来</text>
      </view>

      <!-- ── 解析成功卡 ── -->
      <view v-if="parsed && okCount > 0" class="result-card">
        <view class="rc-head">
          <image class="rc-icon" :src="ICONS.check" mode="aspectFit" />
          <text class="rc-title">解析成功</text>
        </view>
        <view class="rc-stats">
          <view class="stat">
            <text class="stat-num">{{ courseNames }}</text>
            <text class="stat-label">门课程</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat">
            <text class="stat-num">{{ conflictCount }}</text>
            <text class="stat-label">处时段冲突</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat">
            <text class="stat-num">{{ okCount }}</text>
            <text class="stat-label">个上课时段</text>
          </view>
        </view>
      </view>

      <!-- ── 数据来源提示（识别为课表文件时会显示） ── -->
      <view v-if="sourceHint" class="src-hint">
        <text class="sh-text">{{ sourceHint }}</text>
      </view>

      <!-- ── 冲突提示 ── -->
      <view v-if="conflictCount > 0" class="note note-warn">
        <view class="note-dot warn"></view>
        <text>检测到 {{ conflictCount }} 处同格多课，课表中会上下分半显示并标注周次</text>
      </view>

      <!-- ── 报错卡 ── -->
      <view v-if="errors.length > 0" class="result-card error">
        <view class="rc-head">
          <image class="rc-icon" :src="ICONS.alert" mode="aspectFit" />
          <text class="rc-title err">{{ errors.length }} {{ isJsonChannel ? '条' : '行' }}格式错误</text>
        </view>

        <view class="err-list">
          <view v-for="e in errors" :key="e.line" class="err-item">
            <text class="err-line">第 {{ e.line }} {{ isJsonChannel ? '条' : '行' }}</text>
            <view class="err-right">
              <text class="err-reason">{{ e.reason }}</text>
              <text class="err-raw">{{ e.raw }}</text>
            </view>
          </view>
        </view>

        <view v-if="okCount > 0" class="ok-banner">
          <text>其余 {{ okCount }} 行解析通过</text>
        </view>
      </view>

      <!-- ── 写入方式 ── -->
      <view v-if="okCount > 0" class="mode-group">
        <text class="group-label">写入方式</text>
        <view class="mode-row">
          <view
            class="mode-item"
            :class="{ active: mode === 'append' }"
            @click="mode = 'append'"
          >
            <view class="radio" :class="{ on: mode === 'append' }"></view>
            <view class="mode-text">
              <text class="mode-title">追加导入</text>
              <text class="mode-desc">保留现有 {{ existCount }} 门课</text>
            </view>
          </view>
          <view
            class="mode-item"
            :class="{ active: mode === 'replace' }"
            @click="mode = 'replace'"
          >
            <view class="radio" :class="{ on: mode === 'replace' }"></view>
            <view class="mode-text">
              <text class="mode-title">覆盖导入</text>
              <text class="mode-desc">清空后重新写入</text>
            </view>
          </view>
        </view>
      </view>

      <view class="bottom-spacer"></view>
    </scroll-view>

    <!-- ── 底部导航 ── -->
    <BottomNav current="import" @nav="onNavChange" />

    <!-- ── 底部按钮 ── -->
    <view class="footer">
      <view
        class="btn-primary"
        :class="{ disabled: !canImport }"
        @click="onImport"
      >
        <text v-if="canImport">导入 {{ okCount }} 条课程</text>
        <text v-else-if="errors.length">修正后重新解析</text>
        <text v-else>请先粘贴课表文本</text>
      </view>
    </view>

    <!-- ── 使用规则弹层 ── -->
    <view v-if="rulesVisible" class="tips-mask" @click="rulesVisible = false">
      <view class="tips-sheet" @click.stop>
        <view class="tips-head">
          <text class="tips-title">使用规则</text>
          <text class="tips-sub">三种导入方式，按准确率排序</text>
        </view>
        <scroll-view class="tips-scroll" scroll-y :show-scrollbar="false">
          <view v-for="(r, i) in USAGE_RULES" :key="i" class="tip-item">
            <view class="tip-num"><text>{{ i + 1 }}</text></view>
            <view class="tip-right">
              <text class="tip-title">{{ r.title }}</text>
              <text v-if="r.meta" class="tip-meta">{{ r.meta }}</text>
              <text v-for="(ln, j) in r.lines" :key="j" class="tip-text">· {{ ln }}</text>
              <view v-if="r.warn" class="tip-warn">
                <text class="tip-warn-text">{{ r.warn }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="tips-footer">
          <view class="btn-primary" @click="rulesVisible = false">
            <text>知道了</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
/**
 * 文件导入的 renderjs → 逻辑层中转（⚠️ 必须是 options methods）
 * vue3 <script setup> 下 renderjs 的 callMethod 查不到 setup 顶层函数（静默失败），
 * 所以 callMethod 调用的 onFileText / onFileError 必须定义在这里，转发给 setup 挂到
 * fileBridgeBus 上的真实 handler（见下方 <script setup> 末尾）。
 */
const fileBridgeBus = { onFileText: null, onFileError: null }

export default {
  methods: {
    onFileText(payload) {
      if (fileBridgeBus.onFileText) fileBridgeBus.onFileText(payload)
    },
    onFileError(msg) {
      if (fileBridgeBus.onFileError) fileBridgeBus.onFileError(msg)
    }
  }
}
</script>

<script setup>
/**
 * 03 标准文本导入（含 04 报错态）
 * 设计依据：方案书 3.5 / 4.1-4.3 节
 *   - 大文本粘贴框 + 模板说明 + 复制提示词按钮
 *   - 解析预览（成功卡 / 报错卡）
 *   - 写入方式：追加 / 覆盖
 */
import { ref, computed, onMounted } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { parseText, looksLikeJson, parseJson } from '../../utils/parser.js'
import {
  looksLikeHtmlTable,
  parseHtmlTable
} from '../../utils/htmlTable.js'
import { appendCourses, replaceCourses, getCourses } from '../../utils/storage.js'
import { MAX_FILE_BYTES, decodeText } from '../../utils/fileImport.js'
import { AI_PROMPT_TEXT, USAGE_RULES } from '../../config/courseData.js'
import { ICONS } from '../../utils/icons.js'
import BottomNav from '../../components/BottomNav.vue'

const statusBarHeight = ref(20)
const inputText = ref('')
/** 文件导入的内容（不灌进 textarea，避免大 HTML 卡渲染；粘贴框与文件二选一，文件优先） */
const fileText = ref('')
const fileLoaded = ref(false)
const mode = ref('append')
const existCount = ref(0)
/** 使用规则弹层可见性 */
const rulesVisible = ref(false)

/** 粘贴框占位文案（⚠️ 动态绑定里不能写 &#10; 实体：会被解码成真实换行截断 JS 字符串，编译报错） */
const pastePlaceholder = computed(() =>
  fileLoaded.value
    ? '已从文件载入（不显示在框内），点「清空」可移除'
    : '支持：教务表格原文 / AI 生成的 JSON / 手写标准文本\n例：形势与政策|某某教学楼101教室|张老师|一|1-2|1-16'
)

/** 当前生效的输入源：文件导入优先于粘贴框 */
const activeSource = computed(() => (fileLoaded.value ? fileText.value : inputText.value))

/**
 * 解析结果（响应式，输入即时重算）
 * 自动识别三种输入，走不同通道：
 *   ① 教务系统原始 HTML（文件导入 / 记事本法）→ 按 rowspan 严格展开，100% 准确（限景德镇艺术职业大学教务格式）
 *   ② JSON 结构化（AI 按提示词生成 / 设置页导出的备份）→ 逐字段校验，各校通用
 *   ③ 标准文本（手写）→ 原解析器
 */
const parsed = computed(() => {
  const t = activeSource.value
  if (looksLikeHtmlTable(t)) return parseHtmlTable(t)
  if (looksLikeJson(t)) return parseJson(t)
  return parseText(t)
})

const okCount = computed(() => parsed.value.okCount)
const courseNames = computed(() => parsed.value.courseNames)
const errors = computed(() => parsed.value.errors)

/**
 * 当前是否走 JSON 通道。
 * JSON 的错误定位是「第 N 条」（数组下标），不是「第 N 行」——
 * 报错卡的单位文案要跟着通道走，否则会误导用户去数文本行。
 */
const isJsonChannel = computed(() => looksLikeJson(activeSource.value))

/** 顶部提示：告诉用户当前走的是哪条解析通道 */
const sourceHint = computed(() => {
  const t = activeSource.value
  if (!t || !t.trim()) return ''
  if (looksLikeHtmlTable(t)) {
    // ⚠️ 必须写在大括号里：`return` 与字符串**分行**会触发 ASI 自动插分号，变成 `return;` 返回 undefined
    // 别校的 HTML 表格同样会命中这条提示（只认 <td>+<tr>），所以「100% 准确」必须带条件，不能无条件断言
    return '已识别为教务系统原始表格 · 文件导入/记事本法 · 若为景德镇艺术职业大学格式则 100% 准确'
  }
  if (looksLikeJson(t)) return '已识别为 JSON · 结构化导入 · 逐条校验'
  return ''
})

/** 冲突计数：同天同格多课 */
const conflictCount = computed(() => {
  const buckets = new Map()
  for (const c of parsed.value.courses) {
    for (let s = c.sectionStart; s <= c.sectionEnd; s++) {
      const k = `${c.day}-${s}`
      if (!buckets.has(k)) buckets.set(k, new Set())
      buckets.get(k).add(c.name)
    }
  }
  let n = 0
  for (const set of buckets.values()) if (set.size > 1) n++
  return n
})

const lineCount = computed(() =>
  activeSource.value ? activeSource.value.split(/\r\n|\r|\n/).filter((l) => l.trim()).length : 0
)

const canImport = computed(() => okCount.value > 0 && errors.value.length === 0)

/* ── 草稿暂存：二级页互跳走 redirectTo 会销毁本页，粘贴/文件内容靠草稿恢复 ── */
const DRAFT_KEY = 'importDraft'

function saveDraft() {
  try {
    if (inputText.value || fileText.value) {
      uni.setStorageSync(DRAFT_KEY, {
        inputText: inputText.value,
        fileText: fileText.value,
        fileLoaded: fileLoaded.value
      })
    } else {
      uni.removeStorageSync(DRAFT_KEY)
    }
  } catch (e) {
    // 草稿过大等异常静默忽略，不影响主流程
  }
}

function loadDraft() {
  try {
    const d = uni.getStorageSync(DRAFT_KEY)
    if (d && (d.inputText || d.fileText)) {
      inputText.value = d.inputText || ''
      fileText.value = d.fileText || ''
      fileLoaded.value = !!d.fileLoaded
    }
  } catch (e) {
    // 忽略
  }
}

onUnload(() => saveDraft())

function onClear() {
  inputText.value = ''
  fileText.value = ''
  fileLoaded.value = false
  try {
    uni.removeStorageSync(DRAFT_KEY)
  } catch (e) {
    // 忽略
  }
}

/**
 * 文件导入结果（由 renderjs 视图层 fileBridge 模块回传）
 * 文件内容存 fileText，不灌进 textarea（大 HTML 会卡渲染）
 */
function handleFileText(payload) {
  fileText.value = payload.text
  fileLoaded.value = true
  uni.showToast({ title: `已载入 ${payload.name}`, icon: 'none' })
}

function handleFileError(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

// ⚠️ vue3 <script setup> 下，renderjs 的 callMethod 可能查不到 setup 顶层函数
// （callMethod 走 $options.methods）→ 用普通 <script> 的 methods 转发（见文件底部），
// 这里把 handler 挂到模块级 bus 上供它调用
fileBridgeBus.onFileText = handleFileText
fileBridgeBus.onFileError = handleFileError
defineExpose({ onFileText: handleFileText, onFileError: handleFileError })

function onNavChange(key) {
  // 回课表：一次性退回栈底（二级页互跳走 redirectTo，栈恒为「课表+当前页」两层，一步即达）
  if (key === 'schedule') {
    const depth = getCurrentPages().length
    uni.navigateBack({
      delta: Math.max(depth - 1, 1),
      fail: () => uni.reLaunch({ url: '/pages/index/index' })
    })
  } else if (key === 'settings') {
    // redirectTo 替换当前页：栈不增长；粘贴内容靠草稿暂存恢复（见 saveDraft/loadDraft）
    uni.redirectTo({ url: '/pages/settings/settings' })
  }
}

function onShowRules() {
  rulesVisible.value = true
}

function onCopyPrompt() {
  uni.setClipboardData({
    data: AI_PROMPT_TEXT,
    success: () => {
      uni.showToast({ title: '提示词已复制，去 AI 粘贴', icon: 'none' })
    }
  })
}

function onImport() {
  if (!canImport.value) return

  const list = parsed.value.courses
  if (mode.value === 'append') {
    appendCourses(list)
  } else {
    replaceCourses(list)
  }

  // 导入后不直接返回，先提醒用户核对，避免导入错误无人发现
  uni.showModal({
    title: '导入完成',
    content: `已写入 ${list.length} 条课程。\n\n请对照你原本的课程表逐项核对：课程名、星期、节次、周次是否正确。\n\n确认无误后点「核对完了」回到课表；发现不对可点「返回修改」。`,
    confirmText: '核对完了',
    cancelText: '返回修改',
    confirmColor: '#3a7a7a',
    success: (res) => {
      if (res.confirm) {
        // 导入成功后清空输入与草稿，避免下次进入残留旧内容
        inputText.value = ''
        fileText.value = ''
        fileLoaded.value = false
        try {
          uni.removeStorageSync(DRAFT_KEY)
        } catch (e) {
          // 忽略
        }
        uni.reLaunch({ url: '/pages/index/index' })
      }
      // 取消：留在导入页，用户可继续调整后重新导入
    }
  })
}

onMounted(() => {
  try {
    const info = uni.getSystemInfoSync()
    statusBarHeight.value = info.statusBarHeight || 20
  } catch (e) {
    statusBarHeight.value = 20
  }
  existCount.value = getCourses().length
})

onLoad(() => {
  existCount.value = getCourses().length
  loadDraft()
})
</script>

<!-- ── renderjs 视图层：文件选择（App 端 input[type=file] 原生可用，无需任何权限与 Android hook） ── -->
<script module="fileBridge" lang="renderjs">
import { MAX_FILE_BYTES, decodeText } from '../../utils/fileImport.js'

export default {
  methods: {
    /**
     * 用户手势内创建 input[type=file] 并 click → 系统文件选择器
     * 读字节 → decodeText 按 BOM 解码 → callMethod 回逻辑层
     */
    onClick(event, ownerInstance) {
      console.log('[fileBridge] onClick: 创建 input[type=file]')
      const input = document.createElement('input')
      input.type = 'file'
      // ⚠️ 不要设 accept：Android webview 会把 accept 转成 MIME 过滤传给系统选择器，
      // 混合列表会导致 .xls（application/vnd.ms-excel）置灰不可选，只有 text/plain 的 .txt 能选
      // 文件类型交给 App 内容识别兜底（解析失败会明确报错）
      input.style.display = 'none'
      document.body.appendChild(input)

      input.addEventListener('change', () => {
        console.log('[fileBridge] change 触发')
        const file = input.files && input.files[0]
        input.remove()
        if (!file) {
          console.log('[fileBridge] 未取到 File（用户取消）')
          return
        }
        console.log('[fileBridge] 已选文件:', file.name, file.size, 'bytes')
        if (file.size > MAX_FILE_BYTES) {
          ownerInstance.callMethod('onFileError', '文件过大（超过 5MB），请确认选的是课表文件')
          return
        }
        // ⚠️ 教务 .xls 直接导入会解析失败（真机实测），方案一只认 .txt
        const lowerName = (file.name || '').toLowerCase()
        if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
          ownerInstance.callMethod(
            'onFileError',
            '暂不支持 .xls 直接导入：请用电脑「记事本」打开它，另存为 .txt 后再导'
          )
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          try {
            console.log('[fileBridge] 读取完成，开始解码，bytes =', reader.result && reader.result.byteLength)
            const text = decodeText(new Uint8Array(reader.result))
            if (!text || !text.trim()) {
              ownerInstance.callMethod('onFileError', '文件内容为空或无法读取')
              return
            }
            console.log('[fileBridge] 解码完成，字符数 =', text.length, '，回传逻辑层')
            ownerInstance.callMethod('onFileText', { name: file.name || '课表文件', text })
          } catch (e) {
            console.log('[fileBridge] 解码异常:', e)
            ownerInstance.callMethod('onFileError', '文件解析失败：' + (e && e.message ? e.message : '未知错误'))
          }
        }
        reader.onerror = () => {
          console.log('[fileBridge] FileReader 出错')
          ownerInstance.callMethod('onFileError', '文件读取失败')
        }
        reader.readAsArrayBuffer(file)
      })

      input.click()
    }
  }
}
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8rpx 40rpx 24rpx;
}

.hd-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  flex: 1;
  min-width: 0;
}

.hd-title {
  font-size: 44rpx;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.15;
}

.hd-sub {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

.hd-btns {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
  margin-top: 8rpx;
}

.btn-copy {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  border-radius: var(--r-pill);
  background-color: #ffffff;
  border: 2rpx solid var(--c-border);
  font-size: 24rpx;
  color: var(--c-text-sub);
}

/* 主按钮：复制提示词（与主色对齐，视觉上更重） */
.btn-copy-main {
  background-color: var(--c-primary);
  border-color: var(--c-primary);
  color: #ffffff;
}

/* ── 主体 ── */
.body {
  flex: 1;
  min-height: 0;
  padding: 0 40rpx;
}

.paste-wrap {
  background-color: var(--c-card);
  border-radius: var(--r-card);
  border: 2rpx solid var(--c-border-soft);
  overflow: hidden;
}

.paste-box {
  width: 100%;
  min-height: 320rpx;
  padding: 24rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--c-text);
  background-color: var(--c-input-bg);
}

.paste-box.has-error {
  background-color: var(--c-error-bg);
}

.ph {
  color: #b4d0d0;
  font-size: 24rpx;
  line-height: 1.6;
}

.paste-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  border-top: 2rpx solid var(--c-divider);
}

.pf-count {
  font-size: 22rpx;
  color: var(--c-text-meta);
}

.pf-clear {
  font-size: 22rpx;
  color: var(--c-error);
}

/* ── 空态引导 ── */
.empty-guide {
  margin: 20rpx 0 24rpx;
  padding: 24rpx;
  border-radius: var(--r-card);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border);
}

.eg-text {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--c-primary);
  text-align: center;
  line-height: 1.5;
}

.eg-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--c-text-meta);
  text-align: center;
}

/* ── 结果卡 ── */
.result-card {
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: var(--r-card);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border-soft);
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.result-card.error {
  background-color: var(--c-error-bg);
  border-color: var(--c-error-border);
}

.rc-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.rc-icon {
  width: 36rpx;
  height: 36rpx;
  flex-shrink: 0;
}

.rc-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #3a7a7a;
}

.rc-title.err {
  color: var(--c-error-strong);
}

.rc-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.stat-num {
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1;
  color: var(--c-text);
}

.stat-label {
  font-size: 22rpx;
  color: var(--c-text-meta);
}

.stat-divider {
  width: 2rpx;
  height: 48rpx;
  background-color: var(--c-border-soft);
}

/* ── 提示条 ── */
.note {
  margin-top: 16rpx;
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  border-radius: var(--r-card);
  font-size: 23rpx;
  line-height: 1.5;
}

.note-warn {
  background-color: var(--c-warn-bg);
  color: var(--c-warn);
}

.note-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 999rpx;
  flex-shrink: 0;
  margin-top: 10rpx;
}

.note-dot.warn {
  background-color: var(--c-warn-strong);
}

/* ── 报错列表 ── */
.err-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.err-item {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 18rpx;
  border-radius: var(--r-block);
  background-color: #ffffff;
}

.err-line {
  flex-shrink: 0;
  font-size: 23rpx;
  font-weight: 600;
  color: var(--c-error-strong);
  padding-top: 2rpx;
}

.err-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.err-reason {
  font-size: 23rpx;
  line-height: 1.45;
  color: var(--c-error-strong);
}

.err-raw {
  font-size: 21rpx;
  line-height: 1.4;
  color: var(--c-error);
  word-break: break-all;
  opacity: 0.85;
}

.ok-banner {
  padding-top: 4rpx;
  font-size: 23rpx;
  color: #3a7a7a;
}

/* ── 写入方式 ── */
.mode-group {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.group-label {
  font-size: 24rpx;
  color: var(--c-text-meta);
  padding-left: 4rpx;
}

.mode-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx;
  border-radius: var(--r-card);
  background-color: var(--c-card);
  border: 2rpx solid var(--c-border-soft);
}

.mode-item.active {
  border-color: var(--c-primary);
  background-color: #f2fafa;
}

.radio {
  width: 34rpx;
  height: 34rpx;
  border-radius: 999rpx;
  border: 3rpx solid var(--c-border);
  flex-shrink: 0;
}

.radio.on {
  border-color: var(--c-primary);
  background-color: var(--c-primary);
  box-shadow: inset 0 0 0 7rpx #ffffff;
}

.mode-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.mode-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text);
}

.mode-desc {
  font-size: 22rpx;
  color: var(--c-text-meta);
}

.bottom-spacer {
  height: 24rpx;
}

/* ── 底部按钮 ── */
.footer {
  flex-shrink: 0;
  padding: 20rpx 40rpx 24rpx;
  background-color: var(--c-bg);
}

.btn-primary {
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

.btn-primary.disabled {
  background-color: #d8e8e8;
  color: #9cbcbc;
}

/* ── 使用规则弹层 ── */
.tips-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(47, 79, 79, 0.32);
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

/* ⚠️ 不给固定高度时，内部 scroll-view 拿不到高度 → 滚不动、内容溢出压住按钮。
   sheet 自身高度由内容决定（不设 max-height），只给 scroll-view 一个确定高度。 */
.tips-sheet {
  width: 100%;
  box-sizing: border-box;
  background-color: var(--c-card);
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 40rpx 24rpx;
}

.tips-head {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding-bottom: 24rpx;
  border-bottom: 2rpx solid var(--c-divider);
}

.tips-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--c-text);
}

.tips-sub {
  font-size: 24rpx;
  color: var(--c-text-meta);
}

/* 确定高度 = 一定可滚动 */
.tips-scroll {
  height: 60vh;
  padding: 24rpx 0;
  box-sizing: border-box;
}

.tip-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16rpx;
  padding: 18rpx 0;
}

.tip-num {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  background-color: var(--c-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 600;
  color: #1e3a3a;
}

.tip-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.tip-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.4;
}

.tip-text {
  font-size: 26rpx;
  line-height: 1.7;
  color: var(--c-text-sub);
}

/* 准确率标签 */
.tip-meta {
  font-size: 22rpx;
  color: var(--c-primary);
  line-height: 1.5;
}

/* 后果 / 警告 */
.tip-warn {
  margin-top: 6rpx;
  padding: 14rpx 16rpx;
  border-radius: 12rpx;
  background-color: #fdf0f0;
  border: 2rpx solid #e8c8c8;
}

.tip-warn-text {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--c-error);
}

.tips-footer {
  padding-top: 20rpx;
  border-top: 2rpx solid var(--c-divider);
}

/* ── 解析通道提示 ── */
.src-hint {
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: var(--r-card);
  background-color: #e8f4f4;
  border: 2rpx solid #cfe6e6;
}

.sh-text {
  font-size: 24rpx;
  color: #3a7a7a;
}
</style>
