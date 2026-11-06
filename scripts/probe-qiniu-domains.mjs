// 查询空间绑定的所有域名，并用七牛官方域名测试图片处理是否可用
import qiniu from 'qiniu'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const KEY = process.env.T_KEY

const mac = new qiniu.auth.digest.Mac(AK, SK)

// 用管理 API 查空间域名
async function listDomains() {
  const cfg = new qiniu.conf.Config()
  const manager = new qiniu.rs.BucketManager(mac, cfg)
  // domains() 是 v7 里查 bucket 域名的接口
  if (typeof manager.domains === 'function') {
    await new Promise((resolve) => {
      manager.domains(BUCKET, (err, body) => {
        console.log('domains err:', err ? err.message : 'none')
        console.log('domains body:', JSON.stringify(body, null, 2))
        resolve()
      })
    })
  } else {
    console.log('SDK 没有 manager.domains，改用 REST')
  }

  // REST: GET https://api.qiniu.com/v7/domain/list?tbl=bucket
  const url = `https://api.qiniu.com/v7/domain/list?tbl=${encodeURIComponent(BUCKET)}`
  const auth = qiniu.util.generateAccessTokenV2
    ? qiniu.util.generateAccessTokenV2(mac, url, 'GET')
    : qiniu.util.generateAccessToken(mac, url, null)
  const res = await fetch(url, { headers: { Authorization: auth } })
  console.log('REST 域名列表:', res.status, (await res.text()).slice(0, 600))
}

async function testOn(host, label) {
  const base = `https://${host}/${KEY}`
  const targets = [
    ['原始', base],
    ['?imageInfo', `${base}?imageInfo`],
    ['?imageView2/2/w/640', `${base}?imageView2/2/w/640`],
  ]
  for (const [name, url] of targets) {
    const t0 = Date.now()
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      const ab = await res.arrayBuffer()
      const buf = Buffer.from(ab)
      const isImg = (res.headers.get('content-type') || '').startsWith('image/')
      console.log(
        `  ${label} ${name.padEnd(22)} ${res.status} ${(res.headers.get('content-type') || '-').padEnd(20)} ${String(buf.length).padStart(7)}B ${Date.now() - t0}ms` +
          (isImg ? '' : ' ' + buf.toString('utf8').slice(0, 100)),
      )
    } catch (e) {
      console.log(`  ${label} ${name.padEnd(22)} FAILED ${Date.now() - t0}ms ${e.message}`)
    }
  }
}

await listDomains()
console.log('')
for (const host of (process.env.T_HOSTS || '').split(',').filter(Boolean)) {
  await testOn(host, host)
}
