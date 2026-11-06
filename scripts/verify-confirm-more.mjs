// 验证照片删除 + 回收站彻底删除也用卡片式确认框
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9349
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
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
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
  await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@memora.local',password:'123456789'})}).then(r=>r.status)`)

  // ---- 1. 照片页：编辑弹窗里的删除 ----
  await send('Page.navigate', { url: `${BASE}/admin/photos` })
  await sleep(4000)
  const opened = await evaluate(`(() => {
    // 照片墙是网格卡片，点第一张图片进入编辑弹窗
    const img = document.querySelector('img[src*="seed-thumbs"], img[src*="uploads"]');
    if (!img) return 'no-img';
    img.click();
    return 'opened';
  })()`)
  console.log('打开照片编辑:', opened)
  await sleep(1500)

  const delBtn = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const d = btns.find(b => b.getAttribute('aria-label') === '删除' || b.className.includes('btn-danger'));
    if (!d) return 'no-delete-btn';
    d.click();
    return 'delete-clicked';
  })()`)
  console.log('点删除:', delBtn)
  await sleep(900)
  const dlg1 = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return { found: false };
    return { found: true, text: d.textContent.replace(/\\s+/g,' ').trim(), buttons: [...d.querySelectorAll('button')].map(b=>b.textContent.trim()) };
  })()`)
  console.log('照片删除确认卡片:', JSON.stringify(dlg1))
  await shot('.tmp-confirm-photo.png')
  // 取消，不动数据
  await evaluate(`(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='取消'); b.click(); return 1; })()`)
  await sleep(600)
  console.log('取消后:', await evaluate(`document.querySelector('[role="dialog"]') ? 'still-open' : 'closed'`))

  // ---- 2. 回收站：彻底删除（先移一张照片进回收站，测完再恢复） ----
  const moved = await evaluate(`(async () => {
    const list = await (await fetch('/api/photos')).json();
    const photos = Array.isArray(list) ? list : (list.photos || []);
    const target = photos[0];
    const r = await fetch('/api/admin/photos/' + target.id, { method: 'DELETE' });
    return { status: r.status, id: target.id, title: target.title };
  })()`)
  console.log('移入回收站:', JSON.stringify(moved))

  await send('Page.navigate', { url: `${BASE}/admin/trash` })
  await sleep(3500)
  const trashInfo = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean);
    return { buttons: btns };
  })()`)
  console.log('回收站按钮:', JSON.stringify(trashInfo))

  if (trashInfo.buttons.some((b) => b.includes('彻底删除'))) {
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('彻底删除'));
      b.click(); return 1;
    })()`)
    await sleep(900)
    const dlg2 = await evaluate(`(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return { found: false };
      return { found: true, text: d.textContent.replace(/\\s+/g,' ').trim(), buttons: [...d.querySelectorAll('button')].map(b=>b.textContent.trim()) };
    })()`)
    console.log('彻底删除确认卡片:', JSON.stringify(dlg2))
    await shot('.tmp-confirm-trash.png')
    // 取消，不真的删
    await evaluate(`(() => { const d=document.querySelector('[role="dialog"]'); const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='取消'); b.click(); return 1; })()`)
    await sleep(500)
    console.log('取消后:', await evaluate(`document.querySelector('[role="dialog"]') ? 'still-open' : 'closed'`))
  }

  // 恢复刚移入回收站的照片，保持数据原样
  const restored = await evaluate(
    `fetch('/api/admin/photos/${moved.id}/restore', { method: 'POST' }).then(r => r.status)`,
  )
  console.log('恢复照片:', restored)

  console.log('ERRORS:', JSON.stringify(await evaluate(`window.__errs || []`)))
  ws.close()
}

main()
  .catch((e) => console.error('FAILED', e.message))
  .finally(() => {
    chrome.kill()
    setTimeout(() => process.exit(0), 500)
  })
