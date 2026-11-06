// 一次性连通性测试：Turso + 七牛（凭据从环境变量读取，不落盘）
import { createClient } from '@libsql/client'
import qiniu from 'qiniu'

const TURSO_URL = process.env.T_TURSO_URL
const TURSO_TOKEN = process.env.T_TURSO_TOKEN
const AK = process.env.T_QINIU_AK
const SK = process.env.T_QINIU_SK
const BUCKET = process.env.T_QINIU_BUCKET
const DOMAIN = process.env.T_QINIU_DOMAIN

async function testTurso() {
  console.log('=== Turso ===')
  console.log('url:', TURSO_URL)
  try {
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
    const r = await client.execute('SELECT 1 AS ok')
    console.log('连接成功, SELECT 1 =>', JSON.stringify(r.rows[0]))

    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    console.log('现有表:', tables.rows.map((x) => String(x.name)).join(', ') || '(空库)')
  } catch (err) {
    console.log('连接失败:', err.message)
  }
}

async function testQiniu() {
  console.log('\n=== 七牛 ===')
  console.log('bucket:', BUCKET, '| domain:', DOMAIN)

  const mac = new qiniu.auth.digest.Mac(AK, SK)
  const policy = new qiniu.rs.PutPolicy({ scope: BUCKET, expires: 3600 })
  const token = policy.uploadToken(mac)
  console.log('生成上传凭证:', token ? `成功（${token.length} 字符）` : '失败')

  // 列空间内前 3 个文件，验证 AK/SK 有效
  const manager = new qiniu.rs.BucketManager(mac, new qiniu.conf.Config())
  await new Promise((resolve) => {
    manager.listPrefix(BUCKET, { limit: 3 }, (err, body) => {
      if (err) {
        console.log('listPrefix 失败:', err.message || JSON.stringify(err))
      } else {
        console.log('listPrefix 成功，空间内文件数:', body.items?.length ?? 0)
        for (const it of body.items || []) console.log('  -', it.key, it.fsize)
      }
      resolve()
    })
  })

  // 域名可达性
  for (const scheme of ['https', 'http']) {
    const url = `${scheme}://${DOMAIN.replace(/^https?:\/\//, '')}/`
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
      console.log(`${scheme} 域名 HEAD:`, res.status, res.headers.get('server') || '')
    } catch (e) {
      console.log(`${scheme} 域名 HEAD 失败:`, e.message)
    }
  }
}

await testTurso()
await testQiniu()
