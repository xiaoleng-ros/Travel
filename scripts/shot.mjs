// 用原生 CDP 打开页面、等待渲染、截图（本机没有 playwright/puppeteer）
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const url = process.argv[2] || 'http://127.0.0.1:3001/'
const out = process.argv[3] || '.tmp-shot.png'
const waitMs = Number(process.argv[4] || 5000)

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

async function json(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return res.json()
}

async function main() {
  let target = null
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await json('/json/list')
      target = list.find((t) => t.type === 'page')
      if (target) break
    } catch {}
    await sleep(250)
  }
  if (!target) throw new Error('没有找到 CDP target')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let seq = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    } else if (msg.method) {
      events.push(msg)
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
  await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await send('Page.navigate', { url })
  await sleep(waitMs)

  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      bodyLen: document.body.innerText.length,
      text: document.body.innerText.slice(0, 300),
      images: [...document.images].map(i => ({src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight})).slice(0, 12),
      brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
      canvas: [...document.querySelectorAll('canvas')].map(c => ({w: c.clientWidth, h: c.clientHeight})),
    })`,
    returnByValue: true,
  })

  const errors = events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const exceptions = events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.text)

  console.log('URL:', url)
  console.log('PROBE:', probe.result.value)
  console.log('ERRORS:', JSON.stringify(errors.slice(0, 8)))
  console.log('EXCEPTIONS:', JSON.stringify(exceptions.slice(0, 5)))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('screenshot:', out)

  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  chrome.kill()
  process.exit(1)
})
