// 用自签 JWT 注入 memora_session，直接打开后台页面并截图（无需真实密码）
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9336
const base = process.argv[2] || 'http://127.0.0.1:3001'
const rawPath = process.argv[3] || 'admin/settings'
const targetPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
const out = process.argv[4] || '.tmp-admin-settings.png'
const width = Number(process.argv[5] || 1440)
const height = Number(process.argv[6] || 1000)
const fullPage = process.argv[7] === 'full'
const locale = process.argv[8] || ''

const SECRET = process.env.JWT_SECRET || 'memora-local-development-secret-please-change-me-2026'
const token = jwt.sign(
  { id: 1, email: 'iceuucloud@yeah.net', jti: crypto.randomUUID() },
  SECRET,
  { expiresIn: '1h' },
)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let t = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      t = list.find((x) => x.type === 'page')
      if (t) break
    } catch {}
    await sleep(250)
  }
  if (!t) throw new Error('no target')

  const ws = new WebSocket(t.webSocketDebuggerUrl)
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
    } else if (m.method) events.push(m)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  const host = new URL(base).hostname
  const set = await send('Network.setCookie', {
    name: 'memora_session',
    value: token,
    domain: host,
    path: '/',
    httpOnly: true,
  })
  console.log('cookie set:', JSON.stringify(set))

  await send('Page.navigate', { url: `${base}${targetPath}` })
  await sleep(1200)
  if (locale) {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('memora-locale', ${JSON.stringify(locale)}); true`,
      returnByValue: true,
    })
    await send('Page.reload')
    await sleep(4200)
  } else {
    await sleep(3800)
  }

  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      text: document.body.innerText.slice(0, 500),
      cards: document.querySelectorAll('section.card').length,
      h: document.documentElement.scrollHeight,
    })`,
    returnByValue: true,
  })
  console.log('PROBE:', probe.result.value)

  const errs = events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const exceptions = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.text)
  console.log('ERRORS:', JSON.stringify(errs.slice(0, 6)))
  console.log('EXCEPTIONS:', JSON.stringify(exceptions.slice(0, 5)))

  const params = { format: 'png' }
  if (fullPage) {
    const m = await send('Page.getLayoutMetrics')
    const h = Math.ceil(m.cssContentSize.height)
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await sleep(600)
  }
  const shot = await send('Page.captureScreenshot', params)
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('screenshot:', out)

  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
