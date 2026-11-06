import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 开发模式下 index.html 由 Vite 直接返回，不走 Express 的注入逻辑。
// 这个小插件在 serve 时把「设置 → 访问统计」的脚本也拼进去，保证 dev 和线上一致。
// apply: 'serve' 很重要 —— 否则构建时会把当时的统计代码固化进 dist/index.html。
function devAnalyticsPlugin() {
  return {
    name: 'memora-dev-analytics',
    apply: 'serve',
    async transformIndexHtml(html) {
      try {
        const response = await fetch('http://127.0.0.1:3001/api/system/settings/all')
        if (!response.ok) return html
        const payload = await response.json()
        const analytics = payload?.data?.analytics || {}
        const head = String(analytics.headScripts || '').trim()
        const body = String(analytics.bodyScripts || '').trim()
        let output = html
        if (head) output = output.replace('</head>', `    ${head}\n  </head>`)
        if (body) output = output.replace('</body>', `    ${body}\n  </body>`)
        return output
      } catch {
        // API 没起来时静默跳过，不要因为统计脚本阻塞开发服务器。
        return html
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devAnalyticsPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
})
