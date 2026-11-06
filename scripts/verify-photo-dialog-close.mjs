// 验证照片编辑弹窗的 X 按钮 / 遮罩关闭
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9353
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

  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(3500)
  const loginStatus = await evaluate(
    `fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@memora.local',password:'123456789'})}).then(r=>r.status)`,
  )
  console.log('login status:', loginStatus)

  await send('Page.navigate', { url: `${BASE}/admin/photos` })
  await sleep(3500)

  const probe = `
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => n.textContent.trim() === '编辑照片');
      if (!h2) return { open: false };
      const card = h2.closest('.card');
      const x = card?.querySelector('button[aria-label]');
      return { open: true, hasX: Boolean(x), xLabel: x?.getAttribute('aria-label') || null };
    })()
  `

  // 点开第一张照片的编辑弹窗（点缩略图）
  const openEdit = await evaluate(`
    (() => {
      const img = document.querySelector('img[src*="seed-thumbs"], img[src*="img.iceuu.icu"]');
      if (!img) return 'no-image';
      img.click();
      return 'clicked-image';
    })()
  `)
  await sleep(900)
  let p = await evaluate(probe)
  console.log('打开照片编辑弹窗:', openEdit, p)
  await shot('.tmp-photo-dialog.png')

  const clickX = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => n.textContent.trim() === '编辑照片');
      const x = h2?.closest('.card')?.querySelector('button[aria-label]');
      if (!x) return 'no-x';
      x.click();
      return 'clicked-x';
    })()
  `)
  await sleep(700)
  let afterX = await evaluate(probe)
  console.log('点 X:', clickX, '→', afterX)

  // 再开一次，测遮罩
  await evaluate(`
    (() => {
      const img = document.querySelector('img[src*="seed-thumbs"], img[src*="img.iceuu.icu"]');
      img?.click();
    })()
  `)
  await sleep(900)
  const clickOverlay = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) => n.textContent.trim() === '编辑照片');
      const overlay = h2?.closest('.card')?.parentElement;
      if (!overlay) return 'no-overlay';
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'clicked-overlay';
    })()
  `)
  await sleep(700)
  let afterOverlay = await evaluate(probe)
  console.log('点遮罩:', clickOverlay, '→', afterOverlay)

  const ok = !afterX.open && !afterOverlay.open
  console.log(ok ? '\n✅ 照片编辑弹窗关闭正常' : '\n❌ 照片编辑弹窗关闭失败')

  ws.close()
  chrome.kill()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error('验证脚本出错:', err)
  chrome.kill()
  process.exit(1)
})
