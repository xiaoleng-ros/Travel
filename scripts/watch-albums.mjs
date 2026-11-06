// 监控 Turso 里的相册数量是否稳定（用于排查"恢复后又变回 1 个"）
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const client = createClient({ url, authToken })

const ROUNDS = Number(process.argv[2] || 12)
const GAP = Number(process.argv[3] || 5000)

async function snapshot() {
  const albums = await client.execute(
    "SELECT id, position, json_extract(data, '$.title') AS title FROM records WHERE collection='albums' ORDER BY position",
  )
  const photos = await client.execute("SELECT COUNT(*) AS c FROM records WHERE collection='photos'")
  return {
    at: new Date().toISOString().slice(11, 19),
    count: albums.rows.length,
    titles: albums.rows.map((r) => `${r.id}:${r.title}@${r.position}`),
    photos: Number(photos.rows[0].c),
  }
}

const first = await snapshot()
console.log(`${first.at}  albums=${first.count} photos=${first.photos}  ${first.titles.join(' | ')}`)

for (let i = 1; i < ROUNDS; i += 1) {
  await new Promise((r) => setTimeout(r, GAP))
  const s = await snapshot()
  const flag = s.count !== first.count ? '  <== 变化！' : ''
  console.log(`${s.at}  albums=${s.count} photos=${s.photos}  ${s.titles.join(' | ')}${flag}`)
}

client.close()
