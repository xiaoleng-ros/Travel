/**
 * 前台验收：未登录时顶栏 / 登录页 / 首页加载态都不许出现默认头像占位图。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9349
const BASE = process.argv[2] || 'http://127.0.0.1:5173'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-proxy-server',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const pass = (label, ok, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

async function main() {
  let target = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((x) => x.type === 'page')
      if (target) break
    } catch {}
    await sleep(250)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let seq = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    } else if (m.method) events.push(m)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) return { error: r.exceptionDetails.text }
    return r.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  const probe = `JSON.stringify({
    hasDefault: document.body.innerHTML.includes('/brand/avatar.webp'),
    imgs: [...document.images].map(i=>i.getAttribute('src')).filter(Boolean).slice(0,6),
    emptyRing: !!document.querySelector('.masonry-topbar__avatar--empty'),
  })`

  // 首页（未登录）
  await send('Page.navigate', { url: `${BASE}/` })
  await sleep(4000)
  const home = JSON.parse(await ev(probe))
  pass('首页没有 /brand/avatar.webp', home.hasDefault === false, JSON.stringify(home))

  // 登录页
  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(3000)
  const signin = JSON.parse(await ev(probe))
  pass('登录页没有 /brand/avatar.webp', signin.hasDefault === false, JSON.stringify(signin))
  pass('登录页不渲染 logo img', signin.imgs.length === 0, JSON.stringify(signin.imgs))

  // 首页截图看顶栏空圆环
  await send('Page.navigate', { url: `${BASE}/` })
  await sleep(4000)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('tmp-topbar-empty.png', Buffer.from(shot.data, 'base64'))

  const shot2tmp = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 300, height: 80, scale: 2 },
  })
  fs.writeFileSync('tmp-topbar-crop.png', Buffer.from(shot2tmp.data, 'base64'))

  const fails = events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText)
  console.log('网络失败:', JSON.stringify([...new Set(fails)]))
  console.log('截图 -> tmp-topbar-empty.png / tmp-topbar-crop.png')
  ws.close()
  chrome.kill()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
