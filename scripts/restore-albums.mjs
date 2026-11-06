// 补回误删的 3 个相册（id 4 上海风韵 / 3 牛马生涯 / 2 牛背梁）
// 元数据取自 data/db.json 快照，成员只挂回仍在库里的照片
import fs from 'node:fs'
import path from 'node:path'
import { initDb, loadDb, flushDb } from '../server/db.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const SNAPSHOT = path.join(ROOT, 'data', 'db.json')
const TARGET_IDS = [4, 3, 2]

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('缺少 TURSO_DATABASE_URL')
  process.exit(1)
}

const driver = await initDb({ url, token })
if (driver !== 'turso') {
  console.error('没有连上 Turso，中止（避免误写本地文件）')
  process.exit(1)
}

const db = await loadDb()
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
const snapshotAlbums = new Map(snapshot.albums.map((a) => [a.id, a]))
const snapshotAlbumPhotos = snapshot.albumPhotos || []

const alivePhotoIds = new Set(db.photos.map((p) => p.id))
console.log('Turso 当前照片数:', alivePhotoIds.size, '/ 相册数:', db.albums.length)

for (const id of TARGET_IDS) {
  if (db.albums.some((a) => a.id === id)) {
    console.log(`相册 ${id} 已存在，跳过`)
    continue
  }
  const src = snapshotAlbums.get(id)
  if (!src) {
    console.log(`快照里没有相册 ${id}，跳过`)
    continue
  }

  // 该相册在快照里挂过、且现在仍存活的照片
  const members = snapshotAlbumPhotos
    .filter((ap) => ap.albumId === id && alivePhotoIds.has(ap.photoId))
    .sort((a, b) => a.position - b.position)
    .map((ap) => ap.photoId)

  const album = {
    id: src.id,
    title: src.title,
    description: src.description || '',
    coverPhotoId: members[0] || null,
    isHidden: false,
    passwordHash: null,
    position: src.position,
    createdAt: src.createdAt,
    updatedAt: src.updatedAt,
    photoIds: [],
  }
  db.albums.push(album)

  members.forEach((photoId, index) => {
    db.albumPhotos.push({ albumId: id, photoId, position: index })
    const photo = db.photos.find((p) => p.id === photoId)
    if (photo) photo.albumIds = [...new Set([...(photo.albumIds || []), id])]
  })

  console.log(
    `+ 恢复 id=${id} 「${album.title}」 position=${album.position} 成员 ${members.length} 张` +
      (members.length ? `: ${members.join(', ')}` : '（原成员已全部不在库中）'),
  )
}

db.albums.sort((a, b) => a.position - b.position || a.id - b.id)
await flushDb(db)

console.log('\n=== 恢复后的相册 ===')
for (const a of db.albums) {
  const count = db.albumPhotos.filter((ap) => ap.albumId === a.id).length
  console.log(` id=${a.id} pos=${a.position} 「${a.title}」 ${count} 张`)
}
console.log('照片总数:', db.photos.length)
