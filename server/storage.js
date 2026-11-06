// ---------------------------------------------------------------------------
// 图片存储层：本地磁盘 / 七牛云 Kodo 双驱动
//
// 为什么要抽象：
// - 本地开发用 public/uploads + sharp 生成缩略图，体验不变；
// - 部署到 EdgeOne / 任何 Serverless 环境时，没有持久磁盘也不能跑原生模块，
//   改成浏览器直传七牛 + CDN 图片处理生成缩略图，函数只处理元数据。
//
// 两个驱动的对外接口一致，路由层不需要关心当前是哪种。
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import { imageSizeFromBuffer } from './image-size.js'

const ROOT = path.resolve(import.meta.dirname, '..')
export const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')
export const UPLOAD_THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs')

const THUMB_WIDTH = Number(process.env.QINIU_THUMB_WIDTH || 640)

export function qiniuConfig() {
  return {
    accessKey: (process.env.QINIU_ACCESS_KEY || '').trim(),
    secretKey: (process.env.QINIU_SECRET_KEY || '').trim(),
    bucket: (process.env.QINIU_BUCKET || '').trim(),
    domain: (process.env.QINIU_DOMAIN || '').trim().replace(/\/+$/, ''),
    uploadHost: (process.env.QINIU_UPLOAD_HOST || 'https://upload.qiniup.com').trim(),
    prefix: (process.env.QINIU_PREFIX || 'photos').trim().replace(/^\/+|\/+$/g, ''),
  }
}

export function isQiniuConfigured() {
  const cfg = qiniuConfig()
  return Boolean(cfg.accessKey && cfg.secretKey && cfg.bucket && cfg.domain)
}

export function storageKind() {
  return isQiniuConfigured() ? 'qiniu' : 'local'
}

export function publicUrlFor(key) {
  const cfg = qiniuConfig()
  return `${cfg.domain}/${key.replace(/^\/+/, '')}`
}

// 缩略图必须是**独立对象**，不能靠 URL query（?imageView2/...）实时生成。
// 原因：七牛自定义域名的 CDN 开启了「过滤参数」，缓存键不包含 query，
// 同一个 key 的不同处理参数会互相污染（实测 ?attname= 会返回 ?imageInfo 的 JSON）。
// 所以这里用 pfop 持久化处理把缩略图落成一个真实文件，前端拿到的就是普通图片 URL。
function thumbKeyFor(key) {
  const idx = key.lastIndexOf('/')
  const dir = idx >= 0 ? key.slice(0, idx + 1) : ''
  const base = idx >= 0 ? key.slice(idx + 1) : key
  const dot = base.lastIndexOf('.')
  const name = dot > 0 ? base.slice(0, dot) : base
  return `${dir}thumbs/${name}.webp`
}

function thumbUrlFor(key) {
  return publicUrlFor(thumbKeyFor(key))
}

function safeKeyName(id, ext) {
  return `${id}${ext}`
}

// ---------------------------------------------------------------------------
// 七牛驱动
// ---------------------------------------------------------------------------
async function qiniuModule() {
  const mod = await import('qiniu')
  return mod.default || mod
}

export async function createQiniuUploadTarget({ key, mimeType, fileSize }) {
  const qiniu = await qiniuModule()
  const cfg = qiniuConfig()
  const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
  const size = Number(fileSize) || 0
  const policyOptions = {
    scope: `${cfg.bucket}:${key}`,
    expires: 3600,
    insertOnly: 0,
    mimeLimit: mimeType || 'image/*',
  }
  // 只有明确知道文件大小时才限制体积；否则不设 fsizeLimit，
  // 避免因前端没传 size 导致合法文件被 413 拒绝。
  if (size > 0) policyOptions.fsizeLimit = size + 4096
  const putPolicy = new qiniu.rs.PutPolicy(policyOptions)
  return {
    provider: 'qiniu',
    key,
    token: putPolicy.uploadToken(mac),
    uploadUrl: cfg.uploadHost,
    publicUrl: publicUrlFor(key),
    thumbnailUrl: thumbUrlFor(key),
  }
}

/**
 * 读对象元数据（体积 / 类型 / hash），走七牛 rs 管理 API。
 *
 * 为什么不用 CDN：实测同机环境下 `stat` ≈ 350–420ms，而从 CDN 拉 `Range`
 * 起步 7s、经常 20s 超时（domimg 域名只开了海外回源）。凡是「只需要确认
 * 对象在不在」的场景一律用这个，别去读 CDN。
 */
export async function statQiniuObject(key) {
  if (!key || !isQiniuConfigured()) return null
  try {
    const qiniu = await qiniuModule()
    const cfg = qiniuConfig()
    const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
    const manager = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())
    const info = await new Promise((resolve, reject) => {
      manager.stat(cfg.bucket, key, (err, body, respInfo) => {
        if (err) return reject(err)
        if (respInfo && respInfo.statusCode === 200) return resolve(body)
        reject(new Error(`stat 状态 ${respInfo?.statusCode}`))
      })
    })
    return {
      fileSize: Number(info.fsize) || null,
      mimeType: info.mimeType || null,
      hash: info.hash || null,
      exists: true,
    }
  } catch {
    return null
  }
}

// 读取文件头部字节：宽高自己解析，EXIF 交给 exifr。完全不依赖 CDN 的 ?imageInfo。
//
// 为什么不用 fetch：本机（以及部分国内网络）到七牛 as0 节点的 undici 连接经常
// ConnectTimeout，而 node:https 正常。这里统一走 node:https 并带重试。
//
// 超时/重试被刻意压小：这两个值直接决定「传一张照片要等多久」的上限。
// 2 次 × 6s = 最多 12s，失败也只是拿不到宽高，不该把整个上传卡死。
function httpsGet(url, { method = 'GET', headers = {}, timeout = 6000, tries = 2 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    const go = () => {
      attempt++
      const req = https.request(url, { method, headers, timeout }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        )
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', (e) => (attempt < tries ? setTimeout(go, 600 * attempt) : reject(e)))
      req.end()
    }
    go()
  })
}

async function fetchHeadBytes(url, bytes = 262143) {
  try {
    const res = await httpsGet(url, { headers: { Range: `bytes=0-${bytes}` } })
    if (res.status === 200 || res.status === 206) return { buffer: res.body }
  } catch {}
  return null
}

export async function probeQiniuImage(key) {
  const url = publicUrlFor(key)
  const result = {
    publicUrl: url,
    thumbnailKey: thumbKeyFor(key),
    thumbnailUrl: thumbUrlFor(key),
    width: null,
    height: null,
    fileSize: null,
    exifBuffer: null,
    hash: null,
  }

  // 体积/存在性走 rs 管理 API（几百毫秒），不依赖 CDN。
  const stat = await statQiniuObject(key)
  if (stat) {
    result.fileSize = stat.fileSize
    // 七牛对标准上传返回的 hash 就是文件 md5，拿来当重复检测的指纹足够。
    // 注意它和本地链路用的 sha1 不是同一算法，两条链路之间不互通。
    result.hash = stat.hash || null
  }

  // 宽高 + EXIF 需要真实字节，只能回源读文件头。CDN 慢或不通时直接放弃，
  // 由调用方决定是否用其它手段补宽高 —— 不能让它拖住整个上传流程。
  const head = await fetchHeadBytes(url)
  if (head) {
    result.exifBuffer = head.buffer
    const size = imageSizeFromBuffer(head.buffer)
    if (size) {
      result.width = size.width
      result.height = size.height
    }
  }

  // CDN 读不到时，退回 HEAD 拿体积（能拿到多少算多少）。
  if (!result.fileSize) {
    try {
      const headRes = await httpsGet(url, { method: 'HEAD' })
      const length = headRes.headers['content-length']
      if (length) result.fileSize = Number(length)
    } catch {}
  }

  return result
}

/**
 * 用 pfop 持久化处理把缩略图生成成一个真实对象。
 * 七牛侧处理完成后，缩略图就是普通静态文件，不受 CDN 缓存键影响。
 */
export async function generateQiniuThumbnail(key, { width = THUMB_WIDTH } = {}) {
  const qiniu = await qiniuModule()
  const cfg = qiniuConfig()
  const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
  const manager = new qiniu.fop.OperationManager(mac, new qiniu.conf.Config())
  const target = thumbKeyFor(key)
  const fops = [`imageView2/2/w/${width}/format/webp|saveas/${qiniu.util.urlsafeBase64Encode(`${cfg.bucket}:${target}`)}`]

  const persistentId = await new Promise((resolve, reject) => {
    manager.pfop(cfg.bucket, key, fops, null, {}, (err, respBody) => {
      if (err) return reject(err)
      if (respBody && respBody.persistentId) return resolve(respBody.persistentId)
      reject(new Error('七牛没有返回 persistentId'))
    })
  })

  return { persistentId, thumbnailKey: target, thumbnailUrl: publicUrlFor(target) }
}

export async function deleteQiniuObject(key) {
  if (!key) return
  try {
    const qiniu = await qiniuModule()
    const cfg = qiniuConfig()
    const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
    const manager = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())
    await new Promise((resolve, reject) => {
      manager.delete(cfg.bucket, key, (err) => (err ? reject(err) : resolve()))
    })
  } catch (err) {
    console.warn('[storage] 七牛删除失败:', key, err.message)
  }
}

// 七牛返回的 Cache-Control 是 max-age=31536000（一年），删掉对象后 CDN 仍会继续
// 吐旧图。删除照片时必须主动刷新 CDN，否则「已删除的照片」还能被访问到。
export async function refreshQiniuUrls(urls) {
  const list = (urls || []).filter(Boolean)
  if (!list.length) return
  try {
    const qiniu = await qiniuModule()
    const cfg = qiniuConfig()
    const mac = new qiniu.auth.digest.Mac(cfg.accessKey, cfg.secretKey)
    const cdn = new qiniu.cdn.CdnManager(mac)
    await new Promise((resolve, reject) => {
      cdn.refreshUrls(list, (err, respBody, respInfo) => {
        if (err) return reject(err)
        if (respInfo && respInfo.statusCode === 200) return resolve(respBody)
        reject(new Error(`refresh 状态 ${respInfo?.statusCode}`))
      })
    })
  } catch (err) {
    console.warn('[storage] CDN 刷新失败:', err.message)
  }
}

// ---------------------------------------------------------------------------
// 本地驱动（开发用）
// ---------------------------------------------------------------------------
export async function saveLocalImage({ buffer, id, originalName }) {
  const sharp = (await import('sharp')).default
  const ext = (path.extname(originalName) || '.jpg').toLowerCase()
  const fileName = safeKeyName(id, ext)
  const thumbName = `${id}.webp`

  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.mkdirSync(UPLOAD_THUMB_DIR, { recursive: true })
  const originalPath = path.join(UPLOAD_DIR, fileName)
  fs.writeFileSync(originalPath, buffer)

  const metadata = await sharp(originalPath).metadata()
  await sharp(originalPath)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(UPLOAD_THUMB_DIR, thumbName))

  return {
    storageKey: `uploads/${fileName}`,
    thumbnailKey: `uploads/thumbs/${thumbName}`,
    originalUrl: `/uploads/${fileName}`,
    thumbnailUrl: `/uploads/thumbs/${thumbName}`,
    width: metadata.width || null,
    height: metadata.height || null,
    fileSize: buffer.length,
  }
}

export function deleteLocalImage(storageKey, thumbnailKey) {
  for (const key of [storageKey, thumbnailKey]) {
    if (typeof key !== 'string' || !key.startsWith('uploads/')) continue
    try {
      fs.unlinkSync(path.join(ROOT, 'public', key))
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// 统一入口
// ---------------------------------------------------------------------------
export function makeObjectKey(id, originalName) {
  const cfg = qiniuConfig()
  const ext = (path.extname(originalName) || '.jpg').toLowerCase()
  const name = safeKeyName(id, ext)
  return cfg.prefix ? `${cfg.prefix}/${name}` : name
}

export async function removeStoredImage(photo) {
  if (storageKind() === 'qiniu') {
    const urls = []
    for (const key of [photo.storageKey, photo.thumbnailKey]) {
      if (typeof key === 'string' && key && !key.startsWith('uploads/')) {
        await deleteQiniuObject(key)
        urls.push(publicUrlFor(key))
      }
    }
    // 刷新 CDN，否则旧图会在缓存里留一年
    await refreshQiniuUrls(urls)
    return
  }
  deleteLocalImage(photo.storageKey, photo.thumbnailKey)
}

export function thumbnailUrlForStored(photo) {
  return photo.thumbnailUrl || photo.originalUrl || ''
}

// ---------------------------------------------------------------------------
// 头像：独立于照片集合
//
// 头像只存一个 URL 到 user.avatar，不需要宽高/EXIF/缩略图那一套。
// key 固定放在 <prefix>/avatars/ 下，带用户 id 前缀，complete 时据此校验，
// 避免有人拿这个接口覆盖照片对象。
// ---------------------------------------------------------------------------
const AVATAR_SIZE = 512

export function avatarKeyPrefix(userId) {
  const cfg = qiniuConfig()
  const name = `avatars/u${Number(userId) || 0}-`
  return cfg.prefix ? `${cfg.prefix}/${name}` : name
}

export function makeAvatarKey(userId) {
  return `${avatarKeyPrefix(userId)}${Date.now()}.webp`
}

export async function saveLocalAvatar({ buffer, userId }) {
  const sharp = (await import('sharp')).default
  const dir = path.join(UPLOAD_DIR, 'avatars')
  fs.mkdirSync(dir, { recursive: true })
  const name = `u${Number(userId) || 0}-${Date.now()}.webp`
  await sharp(buffer)
    .rotate()
    .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: 'cover', position: 'centre' })
    .webp({ quality: 88 })
    .toFile(path.join(dir, name))
  return { url: `/uploads/avatars/${name}`, key: `uploads/avatars/${name}` }
}

// 换头像时清掉旧文件。外部链接、以及用户在「设置」里手填的品牌图都原样跳过
// —— 只删我们自己生成的 avatars/ 对象。
function isOwnAvatarKey(key) {
  return typeof key === 'string' && /(^|\/)avatars\/u\d+-/.test(key)
}

export async function removeStoredAvatar(url) {
  if (typeof url !== 'string' || !url) return
  if (url.startsWith('/uploads/avatars/')) {
    if (!isOwnAvatarKey(url)) return
    try {
      fs.unlinkSync(path.join(ROOT, 'public', url))
    } catch {}
    return
  }
  const cfg = qiniuConfig()
  if (!cfg.domain || !url.startsWith(`${cfg.domain}/`)) return
  const key = url.slice(cfg.domain.length + 1)
  if (!isOwnAvatarKey(key)) return
  await deleteQiniuObject(key)
  await refreshQiniuUrls([url])
}

export function contentHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex')
}
