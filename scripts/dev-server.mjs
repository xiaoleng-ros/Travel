/**
 * 本地开发服务器入口。
 *
 * 用法：npm run dev:api
 *  - 从项目根目录读取 .env.local（若有），已存在的环境变量不覆盖
 *  - 未配置 TURSO_DATABASE_URL 时默认使用本地 SQLite 文件 ./api-dev.db
 *  - 监听 3001 端口，与 Vite 的 /api 代理（vite.config.js）对应
 *
 * ⚠️ 本文件刻意放在 scripts/ 而非 cloud-functions/：
 *    cloud-functions/ 目录下的内容会整体进入 EdgeOne 的函数构建产物，
 *    而这个文件里有 app.listen()，绝不该出现在 Serverless 运行时里，
 *    放在那里既污染构建产物、也可能干扰构建器对函数入口的识别。
 *
 * 生产环境不经过本文件——EdgeOne 直接加载 cloud-functions/api/[[default]].js。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

// 极简 .env.local 加载（避免引入 dotenv 依赖；不覆盖已有环境变量）
const envPath = path.join(root, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

// 本地开发默认使用 SQLite 文件（libSQL 本地模式）
if (!process.env.TURSO_DATABASE_URL) {
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(root, 'api-dev.db')
}
process.env.NODE_ENV = process.env.NODE_ENV || 'development'

// 入口文件名含 [[ ]]，必须转成 file URL 再动态导入
const entryUrl = pathToFileURL(path.join(root, 'cloud-functions', 'api', '[[default]].js')).href
const { default: app } = await import(entryUrl)

const PORT = Number(process.env.PORT) || 3001
app.listen(PORT, () => {
  console.log(`[dev] 后端运行在 http://localhost:${PORT}`)
  console.log(`[dev] 数据库: ${process.env.TURSO_DATABASE_URL}`)
  console.log('[dev] 前端请另开终端执行 npm run dev（5173 端口，/api 已代理到本服务）')
})
