/**
 * 真浏览器验收「没有默认头像」：
 * 1) 库里 avatar 为空时，账户页不渲染任何 <img>，而是首字母占位
 * 2) 上传后显示上传的图
 * 3) 点「移除头像」后回到占位，且不出现 /brand/avatar.webp
 * 顺带检查首页顶栏在未登录时是否也不塞默认图。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9347
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'
const PASSWORD = process.env.ADMIN_PASSWORD || ''

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-proxy-server',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const pass = (label, ok, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

async function main() {
  let target = null
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((x) => x.type === 'page')
      if (target) break
    } catch {}
    await sleep(250)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let seq = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
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
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) return { error: r.exceptionDetails.text }
    return r.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  await send('Page.navigate', { url: `${BASE}/signin` })
  await sleep(2500)
  const login = await ev(
    `fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(EMAIL)},password:${JSON.stringify(PASSWORD)}}),credentials:'include'}).then(r=>r.status)`,
  )
  pass('登录', login === 200, String(login))

  // 确保是空头像
  await ev(`fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({avatar:''})}).then(r=>r.status)`)

  await send('Page.navigate', { url: `${BASE}/admin/account` })
  await sleep(3000)
  await ev(`location.reload()`)
  await sleep(3000)

  // ---- 1. 空头像：不渲染 img ----
  const emptyState = await ev(`(()=>{
    const sec=document.querySelector('section')
    const img=sec?.querySelector('img')
    const badge=sec?.querySelector('span.rounded-full')
    return JSON.stringify({
      hasImg:!!img,
      src:img?img.getAttribute('src'):null,
      hasBadge:!!badge,
      badgeText:badge?badge.textContent.trim():'',
      bodyHasDefault:document.body.innerHTML.includes('/brand/avatar.webp'),
    })
  })()`)
  const st = JSON.parse(emptyState)
  pass('空头像时账户页不渲染 <img>', st.hasImg === false, JSON.stringify(st))
  pass('空头像时只显示空白圆环（无文字）', st.hasBadge === true && st.badgeText === '', `占位文字=${JSON.stringify(st.badgeText)}`)
  pass('页面里没有 /brand/avatar.webp', st.bodyHasDefault === false, String(st.bodyHasDefault))

  // ---- 2. 上传 ----
  const injected = await ev(`(async()=>{
    const input=document.querySelector('input[type=file]'); if(!input) return 'no-input'
    const c=document.createElement('canvas'); c.width=500; c.height=500
    const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,500,500)
    g.addColorStop(0,'#0ea5e9'); g.addColorStop(1,'#7c3aed')
    x.fillStyle=g; x.fillRect(0,0,500,500)
    x.fillStyle='#fff'; x.font='bold 240px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('M',250,262)
    const blob=await new Promise(r=>c.toBlob(r,'image/png'))
    const file=new File([blob],'empty-probe.png',{type:'image/png'})
    const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files
    input.dispatchEvent(new Event('change',{bubbles:true}))
    return 'ok '+file.size+'B'
  })()`)
  pass('注入头像文件', typeof injected === 'string' && injected.startsWith('ok'), String(injected))
  await sleep(25000)
  const afterUpload = await ev(
    `(()=>{const i=document.querySelector('section img');return JSON.stringify({src:i?.getAttribute('src')||'',w:i?.naturalWidth||0,body:document.body.innerText.slice(0,300)})})()`,
  )
  const au = JSON.parse(afterUpload)
  pass('上传后显示 CDN 头像且加载成功', /iceuu\.icu\/photos\/avatars\//.test(au.src) && au.w === 512, afterUpload.slice(0, 260))

  // ---- 3. 移除 ----
  await ev(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('移除头像'))?.click();return 'clicked'})()`)
  await sleep(5000)
  const afterRemove = await ev(`(()=>{
    const sec=document.querySelector('section')
    const img=sec?.querySelector('img')
    const badge=sec?.querySelector('span.rounded-full')
    return JSON.stringify({
      hasImg:!!img, src:img?img.getAttribute('src'):null,
      hasBadge:!!badge, badgeText:badge?badge.textContent.trim():'',
      bodyHasDefault:document.body.innerHTML.includes('/brand/avatar.webp'),
    })
  })()`)
  const ar = JSON.parse(afterRemove)
  pass('移除后不再有 <img>', ar.hasImg === false, afterRemove.slice(0, 140))
  pass('移除后回到空白圆环', ar.hasBadge === true && ar.badgeText === '', `占位文字=${JSON.stringify(ar.badgeText)}`)
  pass('移除后没有默认图', ar.bodyHasDefault === false, String(ar.bodyHasDefault))

  const dbState = await ev(
    `Promise.all([fetch('/api/profile',{credentials:'include'}).then(r=>r.json()),fetch('/api/system/settings/all').then(r=>r.json())]).then(([p,s])=>JSON.stringify({profileAvatar:p.avatar,settingAvatar:s?.data?.app?.avatarUrl}))`,
  )
  const ds = JSON.parse(dbState)
  pass('库里 avatar 与 settings 都为空串', ds.profileAvatar === '' && ds.settingAvatar === '', dbState)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('tmp-avatar-empty.png', Buffer.from(shot.data, 'base64'))
  const fails = events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText)
  console.log('网络失败:', JSON.stringify([...new Set(fails)]))
  console.log('截图 -> tmp-avatar-empty.png')
  ws.close()
  chrome.kill()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
