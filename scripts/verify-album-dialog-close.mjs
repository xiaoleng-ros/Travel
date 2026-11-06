// 验证「新建相册 / 编辑相册」弹窗能通过 X 按钮、遮罩、Esc 关闭
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9351
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

  await send('Page.enable')
  await send('Runtime.enable')

  // 收集运行时错误
  await evaluate(`
    window.__ERRS = [];
    window.addEventListener('error', (e) => window.__ERRS.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__ERRS.push('rejection: ' + String(e.reason)));
  `)

  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(3500)
  const loginStatus = await evaluate(
    `fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@memora.local',password:'123456789'})}).then(r=>r.status)`,
  )
  console.log('login status:', loginStatus)

  await send('Page.navigate', { url: `${BASE}/admin/albums` })
  await sleep(3000)

  // 弹窗是否存在的探针：用弹窗标题文案定位
  const dialogProbe = `
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) =>
        ['新建相册', '编辑相册'].includes(n.textContent.trim()),
      );
      if (!h2) return { open: false };
      const card = h2.closest('.card');
      const x = card?.querySelector('button[aria-label]');
      return {
        open: true,
        title: h2.textContent.trim(),
        hasX: Boolean(x),
        xLabel: x?.getAttribute('aria-label') || null,
      };
    })()
  `

  const results = []

  // ---- 1. 新建相册 → 点 X 关闭 ----
  const openedNew = await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((n) => n.textContent.includes('新建相册'));
      if (!b) return 'no-button';
      b.click();
      return 'clicked';
    })()
  `)
  await sleep(700)
  let probe = await evaluate(dialogProbe)
  console.log('1. 打开新建相册:', openedNew, probe)

  const clickX = `
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) =>
        ['新建相册', '编辑相册'].includes(n.textContent.trim()),
      );
      const card = h2?.closest('.card');
      const x = card?.querySelector('button[aria-label]');
      if (!x) return 'no-x';
      x.click();
      return 'clicked-x';
    })()
  `
  const clickedX = await evaluate(clickX)
  await sleep(700)
  let afterX = await evaluate(dialogProbe)
  console.log('   点 X:', clickedX, '→', afterX)
  results.push({ case: '新建相册 - X 按钮', closed: !afterX.open })

  // ---- 2. 新建相册 → 点遮罩关闭 ----
  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((n) => n.textContent.includes('新建相册'));
      b?.click();
    })()
  `)
  await sleep(700)
  const opened2 = await evaluate(dialogProbe)

  const clickBackdrop = `
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) =>
        ['新建相册', '编辑相册'].includes(n.textContent.trim()),
      );
      const card = h2?.closest('.card');
      const overlay = card?.parentElement;
      if (!overlay) return 'no-overlay';
      // 点遮罩左上角空白处
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'clicked-overlay';
    })()
  `
  const clickedBackdrop = await evaluate(clickBackdrop)
  await sleep(700)
  let afterBackdrop = await evaluate(dialogProbe)
  console.log('2. 遮罩关闭:', opened2.open, clickedBackdrop, '→', afterBackdrop)
  results.push({ case: '新建相册 - 点遮罩', closed: !afterBackdrop.open })

  // ---- 3. 编辑已有相册 → 点 X 关闭 ----
  const editClicked = await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((n) => n.textContent.trim() === '编辑');
      if (!b) return 'no-edit-button';
      b.click();
      return 'clicked-edit';
    })()
  `)
  await sleep(700)
  let editProbe = await evaluate(dialogProbe)
  console.log('3. 打开编辑:', editClicked, editProbe)

  const clickedX2 = await evaluate(clickX)
  await sleep(700)
  let afterX2 = await evaluate(dialogProbe)
  console.log('   点 X:', clickedX2, '→', afterX2)
  results.push({ case: '编辑相册 - X 按钮', closed: !afterX2.open })

  // ---- 4. 卡片内容区点击不应关闭 ----
  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((n) => n.textContent.includes('新建相册'));
      b?.click();
    })()
  `)
  await sleep(700)
  const innerClick = await evaluate(`
    (() => {
      const h2 = [...document.querySelectorAll('h2')].find((n) =>
        ['新建相册', '编辑相册'].includes(n.textContent.trim()),
      );
      const card = h2?.closest('.card');
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'clicked-card';
    })()
  `)
  await sleep(600)
  let afterInner = await evaluate(dialogProbe)
  console.log('4. 点卡片内部:', innerClick, '→', afterInner)
  results.push({ case: '点卡片内部不关闭', closed: false, stillOpen: afterInner.open })

  // 收尾：关掉
  await evaluate(clickX)
  await sleep(500)

  const errs = await evaluate('window.__ERRS || []')
  console.log('\nERRORS:', JSON.stringify(errs))
  console.log('\n=== 结果 ===')
  for (const r of results) {
    if (r.stillOpen !== undefined) {
      console.log(`${r.case}: ${r.stillOpen ? 'OK（未关闭）' : 'FAIL（被关掉了）'}`)
    } else {
      console.log(`${r.case}: ${r.closed ? 'OK（已关闭）' : 'FAIL（没关掉）'}`)
    }
  }

  const failed = results.filter((r) =>
    r.stillOpen !== undefined ? !r.stillOpen : !r.closed,
  )
  console.log(failed.length ? `\n❌ ${failed.length} 项失败` : '\n✅ 全部通过')

  ws.close()
  chrome.kill()
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('验证脚本出错:', err)
  chrome.kill()
  process.exit(1)
})
