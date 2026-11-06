// 验证「每个卡片单独保存」：改一个卡片里的值 → 只提交该分组 → 只有该卡片变干净
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9338
const base = process.argv[2] || 'http://127.0.0.1:3001'
const out = process.argv[3] || '.tmp-admin-settings-percard.png'
const width = Number(process.argv[4] || 1440)
const height = Number(process.argv[5] || 1000)
const mode = process.argv[6] || 'save'

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
  await send('Network.setCookie', {
    name: 'memora_session',
    value: token,
    domain: new URL(base).hostname,
    path: '/',
    httpOnly: true,
  })
  await send('Page.navigate', { url: `${base}/admin/settings` })
  await sleep(4500)

  const state0 = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('section.card')].map(s => ({
      title: s.querySelector('h2')?.textContent,
      buttons: [...s.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })),
    })))`,
    returnByValue: true,
  })
  console.log('INITIAL_CARDS:', state0.result.value)

  // 在「应用」卡里改站点标题
  const edit = await send('Runtime.evaluate', {
    expression: `(() => {
      const card = [...document.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent.includes('应用'))
      const input = card.querySelector('input[type=text]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, input.value + ' ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return input.value
    })()`,
    returnByValue: true,
  })
  console.log('EDITED_TITLE:', JSON.stringify(edit.result.value))

  if (mode === 'all') {
    const edit2 = await send('Runtime.evaluate', {
      expression: `(() => {
        const card = [...document.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent.includes('系统'))
        const input = card.querySelector('input[type=number]')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, '33')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return input.value
      })()`,
      returnByValue: true,
    })
    console.log('EDITED_MAXSIZE:', edit2.result.value)
  }
  await sleep(600)

  const state1 = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('section.card')].map(s => ({
      title: s.querySelector('h2')?.textContent,
      badge: !!s.querySelector('.bg-amber-50, [class*=amber]'),
      buttons: [...s.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })),
    })))`,
    returnByValue: true,
  })
  console.log('AFTER_EDIT:', state1.result.value)

  // 点「应用」卡里的「保存」
  const click = await send('Runtime.evaluate', {
    expression:
      mode === 'dirty'
        ? `'skipped'`
        : mode === 'revert'
          ? `(() => {
      const card = [...document.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent.includes('应用'))
      const btn = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '撤销')
      if (!btn) return 'no-button'
      if (btn.disabled) return 'disabled'
      btn.click()
      return 'reverted'
    })()`
          : mode === 'all'
            ? `(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '全部保存')
      if (!btn) return 'no-button'
      if (btn.disabled) return 'disabled'
      btn.click()
      return 'saved-all'
    })()`
            : `(() => {
      const card = [...document.querySelectorAll('section.card')].find(s => s.querySelector('h2')?.textContent.includes('应用'))
      const btn = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '保存')
      if (!btn) return 'no-button'
      if (btn.disabled) return 'disabled'
      btn.click()
      return 'clicked'
    })()`,
    returnByValue: true,
  })
  console.log('CLICK_CARD_SAVE:', click.result.value)
  await sleep(2500)

  const bodies = events
    .filter(
      (e) =>
        e.method === 'Network.requestWillBeSent' &&
        e.params.request.url.includes('/api/system/settings/batch'),
    )
    .map((e) => e.params.request.postData || '')
  console.log('BATCH_BODIES:', JSON.stringify(bodies))

  const state2 = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('section.card')].map(s => ({
      title: s.querySelector('h2')?.textContent,
      badge: !!s.querySelector('.bg-amber-50, [class*=amber]'),
      buttons: [...s.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), disabled: b.disabled })),
    })))`,
    returnByValue: true,
  })
  console.log('AFTER_SAVE:', state2.result.value)

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
