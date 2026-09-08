/**
 * 一次性回填脚本：为历史照片补齐缩略图、宽高，并压缩过大的主图。
 *
 * 背景：早期上传的照片没有生成 thumb，width/height 也缺失，
 * 导致瀑布流直接加载 2048 主图（甚至未压缩的 PNG 原图），首页体积高达十余 MB。
 *
 * 处理策略：
 *   1. 回填 width / height（瀑布流首屏不再按默认比例估算，避免加载后跳动）
 *   2. 生成 480 缩略图存入 thumb（有 alpha 通道用 png，否则转 jpeg 以显著减小体积）
 *   3. 主图超过 1MB 或超过 2048 边长时，重新压缩为展示图；
 *      原文件保留为 original_url，保证「原图」不丢
 *
 * 注意：动图（多帧 GIF/WebP）只补缩略图与宽高，不重编码主图，以免丢失动画。
 *
 * 用法：先停掉后端服务，再执行 node scripts/backfill-thumbs.js
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const SERVER_DIR = path.resolve(__dirname, '..')
const UPLOAD_DIR = path.join(SERVER_DIR, 'uploads')
const DB_PATH = path.join(SERVER_DIR, 'data', 'db.json')

const MAX_DISPLAY_SIZE = 2048
const THUMB_SIZE = 480
const BIG_FILE_THRESHOLD = 1024 * 1024 // 1MB

function newName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`
}

const toLocalPath = (url) => path.join(UPLOAD_DIR, String(url || '').replace(/^\/uploads\//, ''))
const exists = (url) => {
  if (!url) return false
  const p = toLocalPath(url)
  return fs.existsSync(p) && fs.statSync(p).size > 0
}
const kb = (n) => (n / 1024).toFixed(0) + 'KB'

async function processPhoto(photo) {
  const srcPath = toLocalPath(photo.url)
  if (!fs.existsSync(srcPath)) {
    return { status: '跳过（主图文件缺失）', saved: 0 }
  }

  const meta = await sharp(srcPath, { limitInputPixels: 64000000 }).metadata()
  const beforeSize = fs.statSync(srcPath).size
  const isAnimated = (meta.pages || 1) > 1
  const hasAlpha = !!meta.hasAlpha && !isAnimated
  const format = hasAlpha ? 'png' : 'jpeg'
  const ext = hasAlpha ? '.png' : '.jpg'

  // 1. 回填真实宽高
  photo.width = meta.width || 0
  photo.height = meta.height || 0

  // 2. 缩略图（缺失或文件不存在才生成）
  if (!exists(photo.thumb)) {
    const thumbBuf = await sharp(srcPath, { limitInputPixels: 64000000, animated: isAnimated })
      .rotate()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
      .toFormat(isAnimated ? meta.format : format, { quality: 80, animated: isAnimated })
      .toBuffer()
    const name = newName(isAnimated ? path.extname(srcPath) : ext)
    fs.writeFileSync(path.join(UPLOAD_DIR, name), thumbBuf)
    photo.thumb = `/uploads/${name}`
  }

  // 3. 主图过大时重新压缩（原文件保留为 original_url）
  const tooBig = beforeSize > BIG_FILE_THRESHOLD ||
    meta.width > MAX_DISPLAY_SIZE ||
    meta.height > MAX_DISPLAY_SIZE

  if (tooBig && !isAnimated) {
    if (!photo.original_url || photo.original_url === photo.url) {
      photo.original_url = photo.url
    }
    const mainBuf = await sharp(srcPath, { limitInputPixels: 64000000 })
      .rotate()
      .resize({
        width: MAX_DISPLAY_SIZE,
        height: MAX_DISPLAY_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toFormat(format, { quality: 85 })
      .toBuffer()
    const name = newName(ext)
    fs.writeFileSync(path.join(UPLOAD_DIR, name), mainBuf)
    photo.url = `/uploads/${name}`
    const afterSize = mainBuf.length
    return {
      status: `主图压缩 ${kb(beforeSize)} → ${kb(afterSize)}，缩略图 ${kb(fs.statSync(toLocalPath(photo.thumb)).size)}`,
      saved: beforeSize - afterSize,
    }
  }

  const thumbSize = exists(photo.thumb) ? fs.statSync(toLocalPath(photo.thumb)).size : 0
  return {
    status: isAnimated
      ? `动图，仅补缩略图 ${kb(thumbSize)}`
      : `主图无需压缩，补缩略图 ${kb(thumbSize)}`,
    saved: 0,
  }
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
  let saved = 0

  for (const photo of db.photos) {
    try {
      const r = await processPhoto(photo)
      saved += r.saved
      console.log(`#${String(photo.id).padEnd(3)} ${r.status}`)
    } catch (err) {
      console.log(`#${photo.id} 处理失败（已跳过，数据未改）: ${err.message}`)
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
  console.log(`\n完成。主图共节省 ${(saved / 1024 / 1024).toFixed(2)} MB`)
}

main().catch((e) => {
  console.error('脚本执行失败：', e)
  process.exit(1)
})
