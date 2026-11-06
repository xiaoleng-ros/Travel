// 七牛端到端：上传一张图 → 用自定义域名读回 → 验证图片处理（缩略图）
import qiniu from 'qiniu'
import fs from 'node:fs'
import sharp from 'sharp'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const DOMAIN = process.env.T_QINIU_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
const UP_HOST = process.env.T_QINIU_UPLOAD_HOST || 'https://upload.qiniup.com'

const KEY = `photos/__conn-test-${Date.now()}.jpg`

async function main() {
  // 造一张 800x600 的测试图
  const buf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 40, g: 160, b: 220 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer()
  console.log('测试图大小:', buf.length, 'bytes')

  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const policy = new qiniu.rs.PutPolicy({ scope: `${BUCKET}:${KEY}`, expires: 3600 })
  const token = policy.uploadToken(mac)

  const form = new FormData()
  form.append('token', token)
  form.append('key', KEY)
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'test.jpg')

  console.log('\n--- 上传到', UP_HOST, '---')
  const up = await fetch(UP_HOST, { method: 'POST', body: form })
  const upText = await up.text()
  console.log('上传状态:', up.status, upText.slice(0, 200))
  if (!up.ok) return

  console.log('\n--- 通过自定义域名读回 ---')
  const httpsUrl = `https://${DOMAIN}/${KEY}`
  const httpUrl = `http://${DOMAIN}/${KEY}`
  for (const url of [httpsUrl, httpUrl]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      console.log(
        url,
        '=>',
        res.status,
        res.headers.get('content-type'),
        res.headers.get('content-length'),
        '| cache:',
        res.headers.get('cache-control'),
      )
    } catch (e) {
      console.log(url, '=> 失败:', e.message)
    }
  }

  console.log('\n--- 图片处理（缩略图）---')
  const thumbUrl = `${httpsUrl}?imageView2/2/w/640/format/webp`
  try {
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(15000) })
    const ab = await res.arrayBuffer()
    console.log('缩略图:', res.status, res.headers.get('content-type'), ab.byteLength, 'bytes')
    if (res.ok && ab.byteLength) {
      fs.writeFileSync('.tmp-qiniu-thumb.webp', Buffer.from(ab))
      const meta = await sharp(Buffer.from(ab)).metadata()
      console.log('缩略图尺寸:', meta.width, 'x', meta.height, meta.format)
    }
  } catch (e) {
    console.log('缩略图失败:', e.message)
  }

  console.log('\n--- imageInfo ---')
  try {
    const res = await fetch(`${httpsUrl}?imageInfo`, { signal: AbortSignal.timeout(10000) })
    console.log('imageInfo:', res.status, (await res.text()).slice(0, 200))
  } catch (e) {
    console.log('imageInfo 失败:', e.message)
  }

  console.log('\n--- EXIF Range 请求 ---')
  try {
    const res = await fetch(httpsUrl, {
      headers: { Range: 'bytes=0-262143' },
      signal: AbortSignal.timeout(10000),
    })
    console.log('Range:', res.status, 'content-length:', res.headers.get('content-length'))
  } catch (e) {
    console.log('Range 失败:', e.message)
  }

  // 清理
  console.log('\n--- 删除测试文件 ---')
  const manager = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())
  await new Promise((resolve) => {
    manager.delete(BUCKET, KEY, (err) => {
      console.log(err ? `删除失败: ${err.message}` : '已删除')
      resolve()
    })
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
