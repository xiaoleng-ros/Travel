// 登录后截图后台页面
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
const base = process.argv[2] || 'http://127.0.0.1:3001'
const target = process.argv[3] || 'admin'
const targetPath = target.startsWith('/') ? target : `/${target}`
const out = process.argv[4] || '.tmp-admin-auth.png'

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
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let t = null
  for (let i = 0; i < 40; i += 1) {
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
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  // 先到登录页完成登录，再跳目标页
  await send('Page.navigate', { url: `${base}/signin` })
  await sleep(2500)

  const loginResult = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const r = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@memora.local', password: '123456789' }),
          credentials: 'include',
        })
        return r.status
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  })
  console.log('login status:', loginResult.result.value)

  await send('Page.navigate', { url: `${base}${targetPath}` })
  await sleep(4500)

  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      text: document.body.innerText.slice(0, 400),
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
      total: document.images.length,
    })`,
    returnByValue: true,
  })
  console.log('PROBE:', probe.result.value)

  const errs = events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const failed = events
    .filter((e) => e.method === 'Network.loadingFailed')
    .map((e) => `${e.params.errorText}`)
  console.log('ERRORS:', JSON.stringify(errs.slice(0, 6)))
  console.log('NET_FAILED:', JSON.stringify([...new Set(failed)].slice(0, 6)))

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
