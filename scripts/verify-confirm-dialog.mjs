// 验证卡片式确认框：点删除相册 -> 截确认卡片 -> 点取消 -> 再点删除 -> 点确定
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9347
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

  // 先登录
  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(3500)
  const login = await evaluate(`(async () => {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@memora.local', password: '123456789' }),
    });
    return r.status;
  })()`)
  console.log('login status:', login)

  await send('Page.navigate', { url: `${BASE}/admin/albums` })
  await sleep(4000)

  // 先用 API 建一个测试相册，避免动到真实数据
  const created = await evaluate(`(async () => {
    const r = await fetch('/api/admin/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__确认框测试相册', description: '临时' }),
    });
    const j = await r.json();
    return { status: r.status, id: j.album && j.album.id };
  })()`)
  console.log('创建测试相册:', JSON.stringify(created))
  await send('Page.navigate', { url: `${BASE}/admin/albums` })
  await sleep(3500)

  // 找到测试相册卡片的删除按钮
  const clicked = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find(c => c.textContent.includes('__确认框测试相册'));
    if (!card) return 'no-card';
    const del = [...card.querySelectorAll('button')].pop();
    del.click();
    return 'clicked';
  })()`)
  console.log('点击删除:', clicked)
  await sleep(900)

  const dialogInfo = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { found: false };
    const r = d.getBoundingClientRect();
    return {
      found: true,
      text: d.textContent.replace(/\\s+/g, ' ').trim(),
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      buttons: [...d.querySelectorAll('button')].map(b => b.textContent.trim()),
      nativeDialogOpen: false,
    };
  })()`)
  console.log('确认卡片:', JSON.stringify(dialogInfo))
  await shot('.tmp-confirm-album.png')

  // 点「取消」，卡片应消失
  await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const btn = [...d.querySelectorAll('button')].find(b => b.textContent.trim() === '取消');
    btn.click();
    return 'cancel-clicked';
  })()`)
  await sleep(600)
  const afterCancel = await evaluate(`document.querySelector('[role="dialog"]') ? 'still-open' : 'closed'`)
  console.log('取消后:', afterCancel)

  // 再点一次删除，点「删除相册」确认，验证相册真的消失
  const before = await evaluate(`document.body.textContent.includes('__确认框测试相册')`)
  await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.card')];
    const card = cards.find(c => c.textContent.includes('__确认框测试相册'));
    [...card.querySelectorAll('button')].pop().click();
    return 'ok';
  })()`)
  await sleep(800)
  await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const btn = [...d.querySelectorAll('button')].find(b => b.textContent.includes('删除相册'));
    btn.click();
    return 'confirm-clicked';
  })()`)
  await sleep(2500)
  const after = await evaluate(`document.body.textContent.includes('__确认框测试相册')`)
  const toast = await evaluate(`(() => {
    const li = document.querySelector('ol li');
    return li ? li.textContent.replace(/\\s+/g,' ').trim() : '';
  })()`)
  console.log('删除前含牛马生涯:', before, '| 删除后含牛马生涯:', after)
  console.log('toast:', toast)
  await shot('.tmp-confirm-after.png')

  const errors = await evaluate(`window.__errs || []`)
  console.log('ERRORS:', JSON.stringify(errors))

  ws.close()
}

main()
  .catch((e) => console.error('FAILED', e.message))
  .finally(() => {
    chrome.kill()
    setTimeout(() => process.exit(0), 500)
  })
