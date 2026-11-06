/**
 * 账户页真浏览器验收：上传头像、恢复默认、改用户名、改邮箱、改密码。
 * 用 CDP 直接操作真实 DOM，等价于人工点击。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9345
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const EMAIL = process.env.ADMIN_EMAIL || 'admin@memora.local'
const PASSWORD = process.env.ADMIN_PASSWORD || ''
const OUT = 'tmp-account-browser.png'

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pass = (l, c, e = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`)

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
    if (r.exceptionDetails) return { error: r.exceptionDetails.text, desc: r.exceptionDetails.exception?.description }
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

  await send('Page.navigate', { url: `${BASE}/admin/account` })
  await sleep(3500)

  // ---- 1. 上传头像 ----
  const injected = await ev(`(async()=>{
    const input=document.querySelector('input[type=file]'); if(!input) return 'no-input'
    const c=document.createElement('canvas'); c.width=500; c.height=500
    const x=c.getContext('2d'); const g=x.createLinearGradient(0,0,500,500)
    g.addColorStop(0,'#0ea5e9'); g.addColorStop(1,'#7c3aed')
    x.fillStyle=g; x.fillRect(0,0,500,500)
    x.fillStyle='#fff'; x.font='bold 240px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('M',250,262)
    const blob=await new Promise(r=>c.toBlob(r,'image/png'))
    const file=new File([blob],'account-probe.png',{type:'image/png'})
    const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files
    input.dispatchEvent(new Event('change',{bubbles:true}))
    return 'ok '+file.size+'B'
  })()`)
  pass('注入头像文件', typeof injected === 'string' && injected.startsWith('ok'), String(injected))
  await sleep(18000)
  const avatarAfter = await ev(
    `(()=>{const i=document.querySelector('section img');return JSON.stringify({src:i?.getAttribute('src')||'',w:i?.naturalWidth||0})})()`,
  )
  pass('头像换成 CDN 且加载成功', /iceuu\.icu\/photos\/avatars\//.test(avatarAfter) && /"w":512/.test(avatarAfter), avatarAfter.slice(0, 110))

  // ---- 2. 改用户名 ----
  await ev(`(async()=>{
    const inputs=[...document.querySelectorAll('input')].filter(i=>i.type!=='file'&&i.type!=='password'&&i.type!=='checkbox')
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    setter.call(inputs[0],'旅行者'); inputs[0].dispatchEvent(new Event('input',{bubbles:true}))
    await new Promise(r=>setTimeout(r,300))
    ;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存资料')?.click()
    await new Promise(r=>setTimeout(r,2500))
  })()`)
  await sleep(1500)
  const profile1 = await ev(`fetch('/api/profile',{credentials:'include'}).then(r=>r.json()).then(j=>JSON.stringify(j))`)
  pass('用户名改成「旅行者」', /旅行者/.test(profile1), profile1.slice(0, 120))

  // ---- 3. 改邮箱 ----
  await ev(`(async()=>{
    const inputs=[...document.querySelectorAll('input')].filter(i=>i.type!=='file'&&i.type!=='password'&&i.type!=='checkbox')
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    setter.call(inputs[1],'traveller@memora.local'); inputs[1].dispatchEvent(new Event('input',{bubbles:true}))
    await new Promise(r=>setTimeout(r,300))
    ;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存资料')?.click()
    await new Promise(r=>setTimeout(r,2500))
  })()`)
  await sleep(1500)
  const profile2 = await ev(`fetch('/api/profile',{credentials:'include'}).then(r=>r.json()).then(j=>JSON.stringify(j))`)
  pass('邮箱改成 traveller@', /traveller@memora\.local/.test(profile2), profile2.slice(0, 120))

  // ---- 4. 改密码 ----
  const nextPw = PASSWORD + '.z9'
  const pwResult = await ev(`(async()=>{
    const pws=[...document.querySelectorAll('input[type=password]')]
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    setter.call(pws[0], ${JSON.stringify(PASSWORD)}); pws[0].dispatchEvent(new Event('input',{bubbles:true}))
    setter.call(pws[1], ${JSON.stringify(nextPw)}); pws[1].dispatchEvent(new Event('input',{bubbles:true}))
    await new Promise(r=>setTimeout(r,300))
    const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='修改密码')
    if(!btn) return 'no-button'
    btn.click()
    await new Promise(r=>setTimeout(r,2500))
    return document.body.innerText.includes('密码已修改') ? 'toast-ok' : 'no-toast'
  })()`)
  pass('改密码提示成功', pwResult === 'toast-ok', String(pwResult))

  const stillIn = await ev(
    `fetch('/api/profile',{credentials:'include'}).then(r=>r.json()).then(j=>j&&j.id?'still-in':'logged-out')`,
  )
  pass('改密码后会话仍有效', stillIn === 'still-in', String(stillIn))

  await ev(`(async()=>{
    const pws=[...document.querySelectorAll('input[type=password]')]
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    setter.call(pws[0], ${JSON.stringify(nextPw)}); pws[0].dispatchEvent(new Event('input',{bubbles:true}))
    setter.call(pws[1], ${JSON.stringify(PASSWORD)}); pws[1].dispatchEvent(new Event('input',{bubbles:true}))
    await new Promise(r=>setTimeout(r,300))
    ;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='修改密码')?.click()
    await new Promise(r=>setTimeout(r,2500))
  })()`)

  // ---- 5. 移除头像（置空，不回退默认图） ----
  await ev(`(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes('移除头像'))?.click();return 'clicked'})()`)
  await sleep(5000)
  const avatarReset = await ev(
    `(()=>{const i=document.querySelector('section img');return JSON.stringify({hasImg:!!i,src:i?.getAttribute('src')||'',bodyHasDefault:document.body.innerHTML.includes('/brand/avatar.webp')})})()`,
  )
  const arv = JSON.parse(avatarReset)
  pass('移除头像后不再渲染图片', arv.hasImg === false && arv.bodyHasDefault === false, avatarReset)

  // 收尾：用户名邮箱改回
  await ev(
    `fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username:'admin',email:${JSON.stringify(EMAIL)}})}).then(r=>r.status)`,
  )

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  const fails = events.filter((e) => e.method === 'Network.loadingFailed').map((e) => e.params.errorText)
  console.log('网络失败:', JSON.stringify([...new Set(fails)]))
  console.log('截图 ->', OUT)
  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  chrome.kill()
  process.exit(1)
})
