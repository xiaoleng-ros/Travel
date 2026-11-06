// 用七牛「持久化处理 pfop」判断：图片处理能力本身是否可用（绕开 CDN 的 query 问题）
// 若 pfop 成功 → 账号图片处理正常，故障 100% 在 CDN 域名配置（过滤参数 / 未绑定存储域名）
// 若 pfop 失败 → 账号级图片处理未开通
import https from 'node:https'
import qiniu from 'qiniu'

const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const KEY = process.env.T_KEY

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 30000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }),
      )
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const config = new qiniu.conf.Config()
  config.zone = qiniu.zone.Zone_z0
  const opManager = new qiniu.fop.OperationManager(mac, config)

  const target = `${BUCKET}:__thumb/${KEY.split('/').pop().replace(/\.\w+$/, '')}.webp`
  const fops = `imageView2/2/w/300/format/webp|saveas/${qiniu.util.urlsafeBase64Encode(target)}`

  const id = await new Promise((resolve, reject) => {
    opManager.pfop(BUCKET, KEY, [fops], null, {}, (err, result) => {
      if (err) return reject(new Error(`${err.message || err} ${JSON.stringify(result || {})}`))
      resolve(result.persistentId || result.id)
    })
  })
  console.log('pfop 提交成功, persistentId =', id)

  for (let i = 0; i < 12; i++) {
    await sleep(1500)
    const j = await new Promise((resolve) => {
      opManager.prefop(id, (err, result) => resolve(err ? { error: err.message } : result))
    })
    const it = (j.items || [])[0] || {}
    console.log(`轮询 ${i + 1}: code=${it.code} cmd=${it.cmd || '-'} desc=${it.description || j.error || '-'}`)
    if (it.code === 0) {
      console.log('  → 成功，产物 key:', it.key)
      console.log('\n结论：账号图片处理能力正常 → 故障在 CDN 域名配置（query 被过滤/未透传）')
      return
    }
    if (it.code !== undefined && it.code !== 3 && it.code !== 4) {
      console.log('\n结论：图片处理本身不可用（账号级未开通或被限制）')
      return
    }
  }
  console.log('轮询超时')
}

main().catch((e) => {
  console.error('pfop 失败:', e.message)
  process.exit(1)
})
