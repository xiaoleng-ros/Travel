// 相册页回归：确认 4 个相册都在，且新建/编辑弹窗能关闭
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9357
const BASE = 'http://127.0.0.1:5173'

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
  let target = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((x) => x.type === 'page')
      if (target) break
    } catch {}
    await sleep(250)
  }
  if (!target) throw new Error('没有找到可用的 Chrome 页面')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r))

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
    return res.result.value
  }

  const shot = async (file) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    console.log('screenshot:', file)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')

  const netFailed = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      netFailed.push(m.params.entry.text)
    }
  })

  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(3500)
  const loginStatus = await evaluate(
    `fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@memora.local',password:'123456789'})}).then(r=>r.status)`,
  )
  console.log('login status:', loginStatus)

  await send('Page.navigate', { url: `${BASE}/admin/albums` })
  await sleep(3500)

  const albums = await evaluate(`
    (() => {
      const cards = [...document.querySelectorAll('.card')];
      return cards
        .map((c) => c.querySelector('h3')?.textContent?.trim())
        .filter(Boolean);
    })()
  `)
  console.log('页面上的相册:', JSON.stringify(albums))

  const broken = await evaluate(`
    [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length
  `)
  console.log('broken images:', broken)

  await shot('.tmp-albums-restored.png')

  // 打开新建相册弹窗，截图后关掉
  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((n) => n.textContent.includes('新建相册'));
      b?.click();
    })()
  `)
  await sleep(800)
  const openState = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => ['新建相册','编辑相册'].includes(n.textContent.trim()));
      return h2 ? h2.textContent.trim() : null;
    })()
  `)
  await shot('.tmp-albums-dialog.png')

  const closed = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => ['新建相册','编辑相册'].includes(n.textContent.trim()));
      const x = h2?.closest('.card')?.querySelector('button[aria-label]');
      x?.click();
      return 'clicked';
    })()
  `)
  await sleep(700)
  const afterClose = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => ['新建相册','编辑相册'].includes(n.textContent.trim()));
      return h2 ? h2.textContent.trim() : null;
    })()
  `)
  console.log('弹窗打开:', openState, '→ 点 X:', closed, '→ 现在:', afterClose)

  console.log('NET ERRORS:', JSON.stringify(netFailed.slice(0, 5)))

  const pass = albums.length === 4 && broken === 0 && openState && afterClose === null
  console.log(pass ? '\n✅ 相册恢复 + 弹窗关闭均正常' : '\n❌ 检查未通过')

  ws.close()
  chrome.kill()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('验证脚本出错:', err)
  chrome.kill()
  process.exit(1)
})
