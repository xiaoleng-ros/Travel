/**
 * 真浏览器验收：在页面里造一张图塞进 <input type=file>，走完整的上传链路，
 * 检查头像 <img> 是否真的换成了七牛 CDN 地址并且能加载出来。
 *
 * 这一步能验证 curl/node 测不到的东西：七牛直传时的 CORS（withCredentials=false）。
 *
 * 用法：node --env-file-if-exists=.env scripts/verify-avatar-browser.mjs [baseUrl]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9336
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const OUT = 'tmp-avatar-browser.png'

const email = process.env.ADMIN_EMAIL || 'admin@memora.local'
const password = process.env.ADMIN_PASSWORD || ''
if (!password) {
  console.error('缺少 ADMIN_PASSWORD，无法登录')
  process.exit(1)
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars','--no-proxy-server',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let target = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((x) => x.type === 'page')
      if (target) break
    } catch {}
    await sleep(250)
  }
  if (!target) throw new Error('没有拿到 Chrome 调试目标')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let seq = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    } else if (m.method) {
      events.push(m)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(2500)

  const loginStatus = await evaluate(`
    (async () => {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }),
        credentials: 'include',
      })
      return r.status
    })()
  `)
  console.log('0. 登录 ->', loginStatus)

  await send('Page.navigate', { url: `${BASE}/admin/account` })
  await sleep(4000)

  const before = await evaluate(`
    (() => {
      const img = document.querySelector('section img')
      return JSON.stringify({ src: img?.getAttribute('src') || null, w: img?.naturalWidth || 0 })
    })()
  `)
  console.log('1. 上传前头像 ->', before)

  // 在页面里造一张 600×600 的图，塞进 file input，触发 change
  const injected = await evaluate(`
    (async () => {
      const input = document.querySelector('input[type=file]')
      if (!input) return 'no-input'
      const c = document.createElement('canvas')
      c.width = 600; c.height = 600
      const ctx = c.getContext('2d')
      const g = ctx.createLinearGradient(0, 0, 600, 600)
      g.addColorStop(0, '#2b6cb0'); g.addColorStop(1, '#e53e3e')
      ctx.fillStyle = g; ctx.fillRect(0, 0, 600, 600)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 200px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('M', 300, 310)
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
      const file = new File([blob], 'probe-avatar.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return 'dispatched ' + file.size + 'B'
    })()
  `)
  console.log('2. 注入文件 ->', injected)

  // 等上传 + complete + 重新渲染
  await sleep(20000)

  const after = await evaluate(`
    (() => {
      const img = document.querySelector('section img')
      return JSON.stringify({
        src: img?.getAttribute('src') || null,
        w: img?.naturalWidth || 0,
        h: img?.naturalHeight || 0,
        toast: document.body.innerText.includes('头像') ? 'has-avatar-text' : '',
      })
    })()
  `)
  console.log('3. 上传后头像 ->', after)

  const sidebar = await evaluate(`
    (() => {
      const imgs = [...document.images].map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth }))
      return JSON.stringify(imgs)
    })()
  `)
  console.log('4. 页面所有图片 ->', sidebar)

  const errs = events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const failed = events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText)
  console.log('5. 控制台错误 ->', JSON.stringify(errs.slice(0, 5)))
  console.log('6. 网络失败 ->', JSON.stringify([...new Set(failed)].slice(0, 5)))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('截图 ->', OUT)

  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
