import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// 原型要在构建时读取 ../01-全局背景信息/11.待对齐事项.md，开发服务器需要放行仓库根目录。
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react(), msw({ mode: 'worker-only' })],
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
})
