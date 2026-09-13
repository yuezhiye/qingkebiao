/**
 * 应用入口（Vue3）
 * 设计依据：方案书 3.1 节 —— uni-app + Vue3 + <script setup>
 */
import { createSSRApp } from 'vue'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
