// 测量设置页每张卡片的实际几何尺寸，找出比例不协调的卡片
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9341
const base = process.argv[2] || 'http://127.0.0.1:3001'
const width = Number(process.argv[3] || 1440)
const height = Number(process.argv[4] || 1000)

const SECRET = process.env.JWT_SECRET || 'memora-local-development-secret-please-change-me-2026'
const token = jwt.sign({ id: 1, email: 'iceuucloud@yeah.net', jti: crypto.randomUUID() }, SECRET, {
  expiresIn: '1h',
})

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
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Network.setCookie', {
    name: 'memora_session',
    value: token,
    domain: new URL(base).hostname,
    path: '/',
    httpOnly: true,
  })
  await send('Page.navigate', { url: `${base}/admin/settings` })
  await sleep(4500)

  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('section.card')].map(s => {
      const rect = s.getBoundingClientRect()
      const body = s.querySelector(':scope > div:nth-of-type(2)')
      const actions = s.querySelector(':scope > div:last-child')
      const ar = actions?.getBoundingClientRect()
      const br = body?.getBoundingClientRect()
      return {
        title: s.querySelector('h2')?.textContent,
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
        bodyH: br ? Math.round(br.height) : null,
        gapBeforeActions: ar && br ? Math.round(ar.top - br.bottom) : null,
      }
    }))`,
    returnByValue: true,
  })
  console.log(r.result.value)
  const m = await send('Page.getLayoutMetrics')
  console.log('PAGE_HEIGHT', Math.ceil(m.cssContentSize.height))
  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
