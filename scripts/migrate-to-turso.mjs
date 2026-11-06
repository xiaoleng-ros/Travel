// ---------------------------------------------------------------------------
// 把本地 data/db.json 迁移到 Turso
//
// 用法：
//   1. 在 .env 里填好 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
//   2. node --env-file=.env scripts/migrate-to-turso.mjs
//
// 说明：
//   - 目标库已有数据时默认拒绝执行，需加 --force 覆盖。
//   - 覆盖是全量替换（先清空 records/settings/meta，再写入）。
//   - 服务端启动时其实也会自动导入一次（仅当 Turso 为空），这个脚本
//     用于「想手动控制时机」或「重复迁移」的场景。
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb, replaceAll, DB_FILE } from '../server/db.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')

async function main() {
  const url = (process.env.TURSO_DATABASE_URL || '').trim()
  const token = (process.env.TURSO_AUTH_TOKEN || '').trim()
  if (!url) {
    console.error('缺少 TURSO_DATABASE_URL，请先配置 .env')
    process.exit(1)
  }
  if (!token) {
    console.warn('警告：没有 TURSO_AUTH_TOKEN，连接大概率会失败（401）。')
  }
  if (!fs.existsSync(DB_FILE)) {
    console.error(`找不到源文件：${DB_FILE}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  console.log(
    `源数据：${raw.photos?.length || 0} 张照片 / ${raw.albums?.length || 0} 个相册 / ` +
      `${Object.keys(raw.settings || {}).length} 个设置命名空间`,
  )

  const mode = await initDb({ url, token })
  if (mode !== 'turso') {
    console.error('无法连接 Turso，已中止。')
    process.exit(1)
  }

  // 探测目标库是否已有数据
  const { createClient } = await import('@libsql/client')
  const probe = createClient({ url, authToken: token || undefined })
  const existing = await probe.execute('SELECT COUNT(*) AS n FROM records')
  const count = Number(existing.rows[0]?.n || 0)
  if (count > 0 && !force) {
    console.error(`目标库已有 ${count} 条记录。确认要覆盖请加 --force。`)
    process.exit(1)
  }

  const db = {
    users: raw.users || [],
    photos: raw.photos || [],
    albums: raw.albums || [],
    albumPhotos: raw.albumPhotos || [],
    settings: raw.settings || {},
    reactions: raw.reactions || [],
    trash: raw.trash || [],
    createdAt: raw.createdAt || new Date().toISOString(),
  }

  await replaceAll(db)

  const after = await probe.execute('SELECT collection, COUNT(*) AS n FROM records GROUP BY collection')
  console.log('迁移完成：')
  for (const row of after.rows) {
    console.log(`  ${String(row.collection).padEnd(12)} ${row.n}`)
  }
  console.log(`  目标：${url}`)
}

main().catch((err) => {
  console.error('迁移失败：', err)
  process.exit(1)
})
