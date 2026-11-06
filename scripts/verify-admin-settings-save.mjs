// 点击「保存设置」，确认 toast 与请求都成功；同时可切换深色模式截图
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9337
const base = process.argv[2] || 'http://127.0.0.1:3001'
const out = process.argv[3] || '.tmp-admin-settings-save.png'
const width = Number(process.argv[4] || 1440)
const height = Number(process.argv[5] || 1000)
const dark = process.argv[6] === 'dark'

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

  if (dark) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    })
  }

  await send('Network.setCookie', {
    name: 'memora_session',
    value: token,
    domain: new URL(base).hostname,
    path: '/',
    httpOnly: true,
  })

  await send('Page.navigate', { url: `${base}/admin/settings` })
  await sleep(4500)

  if (dark) {
    await send('Runtime.evaluate', {
      expression: `document.documentElement.classList.add('dark'); document.documentElement.style.colorScheme='dark'; true`,
      returnByValue: true,
    })
    await sleep(400)
  }

  const click = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存设置'))
      if (!btn) return 'no-button'
      btn.click()
      return 'clicked'
    })()`,
    returnByValue: true,
  })
  console.log('click:', click.result.value)
  await sleep(2500)

  const after = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ toasts: [...document.querySelectorAll('[role=status], .toast, [data-toast]')].map(n => n.innerText), bodyTail: document.body.innerText.slice(-200) })`,
    returnByValue: true,
  })
  console.log('AFTER:', after.result.value)

  const posts = events
    .filter((e) => e.method === 'Network.requestWillBeSent' && e.params.request.url.includes('/api/system/settings/batch'))
    .map((e) => e.params.request.method)
  console.log('BATCH_REQUESTS:', JSON.stringify(posts))

  const m = await send('Page.getLayoutMetrics')
  const h = Math.ceil(m.cssContentSize.height)
  if (h > height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await sleep(600)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
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
