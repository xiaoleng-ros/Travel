// 诊断七牛图片处理参数：保留文件，逐个测试 query
import qiniu from 'qiniu'
import sharp from 'sharp'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const DOMAIN = process.env.T_QINIU_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
const UP_HOST = process.env.T_QINIU_UPLOAD_HOST

const KEY = `photos/__probe-${Date.now()}.jpg`
const BASE = `https://${DOMAIN}/${KEY}`

async function get(label, url, opts = {}) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts })
    const ab = await res.arrayBuffer()
    const buf = Buffer.from(ab)
    let extra = ''
    if ((res.headers.get('content-type') || '').startsWith('image/')) {
      try {
        const m = await sharp(buf).metadata()
        extra = ` ${m.width}x${m.height} ${m.format}`
      } catch {}
    } else {
      extra = ' ' + buf.toString('utf8').slice(0, 120)
    }
    console.log(
      `${label.padEnd(34)} ${res.status} ${(res.headers.get('content-type') || '-').padEnd(22)} ${String(buf.length).padStart(7)}B ${Date.now() - t0}ms${extra}`,
    )
    return { res, buf }
  } catch (e) {
    console.log(`${label.padEnd(34)} FAILED ${Date.now() - t0}ms ${e.message}`)
    return null
  }
}

async function main() {
  const buf = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 90, b: 60 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()

  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const policy = new qiniu.rs.PutPolicy({ scope: `${BUCKET}:${KEY}`, expires: 3600 })
  const form = new FormData()
  form.append('token', policy.uploadToken(mac))
  form.append('key', KEY)
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'probe.jpg')
  const up = await fetch(UP_HOST, { method: 'POST', body: form })
  console.log('上传:', up.status, (await up.text()).slice(0, 120))
  console.log('原图:', buf.length, 'bytes, 1600x1200')
  console.log('\nURL:', BASE, '\n')

  // 等 CDN 回源
  await new Promise((r) => setTimeout(r, 1500))

  await get('原始文件', BASE)
  await get('HEAD 原始', BASE, { method: 'HEAD' })
  await get('?imageInfo', `${BASE}?imageInfo`)
  await get('?imageView2/2/w/640', `${BASE}?imageView2/2/w/640`)
  await get('?imageView2/2/w/640/format/webp', `${BASE}?imageView2/2/w/640/format/webp`)
  await get('?imageMogr2/thumbnail/640x', `${BASE}?imageMogr2/thumbnail/640x`)
  await get('?imageView2|管道', `${BASE}?imageView2/2/w/640|imageMogr2/format/webp`)
  await get('Range bytes=0-2047', BASE, { headers: { Range: 'bytes=0-2047' } })
  await get('Range bytes=0-262143', BASE, { headers: { Range: 'bytes=0-262143' } })

  console.log('\n--- 保留文件供手工检查，不删除 ---')
  console.log('key:', KEY)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
