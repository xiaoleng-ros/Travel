// 验证「设置 → 访问统计」里的脚本真的被注入到了 SPA 外壳里。
// 用法: node scripts/verify-analytics-injection.mjs [baseUrl]
// 检查两件事: 1) 服务端返回的 HTML 里有没有脚本原文; 2) 浏览器里脚本是否真的执行/发起请求。
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const BASE = process.argv[2] || 'http://127.0.0.1:3001'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const PROFILE = path.join(os.tmpdir(), `memora-verify-${Date.now()}`)

const settings = await (await fetch(`${BASE}/api/system/settings/all`)).json()
const head = String(settings?.data?.analytics?.headScripts || '').trim()
const body = String(settings?.data?.analytics?.bodyScripts || '').trim()

console.log('HEAD_SCRIPTS:', head ? `${head.slice(0, 80)}…` : '(empty)')
console.log('BODY_SCRIPTS:', body ? `${body.slice(0, 80)}…` : '(empty)')

const html = await (await fetch(`${BASE}/photos`)).text()
console.log('HTML_HAS_HEAD:', head ? html.includes(head) : 'skipped')
console.log('HTML_HAS_BODY:', body ? html.includes(body) : 'skipped')

if (!head && !body) {
  console.log('RESULT: 没有配置任何脚本，注入逻辑无可验证内容。')
  process.exit(0)
}

// 从脚本里挑出外链 src，用来判断浏览器是否真的去加载了。
const srcMatch = head.match(/src=["']([^"']+)["']/) || body.match(/src=["']([^"']+)["']/)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const cleanup = () => {
  try {
    chrome.kill()
  } catch {}
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true })
  } catch {}
}
process.on('exit', cleanup)

const getJson = (p) =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
        let raw = ''
        res.on('data', (chunk) => (raw += chunk))
        res.on('end', () => resolve(JSON.parse(raw)))
      })
      .on('error', reject)
  })

let target = null
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = (await getJson('/json/list')).filter(
      (t) => t.type === 'page' && !t.url.startsWith('chrome-extension'),
    )
    if (list.length) target = list[0]
  } catch {}
  if (!target) await new Promise((r) => setTimeout(r, 250))
}
if (!target) {
  console.log('RESULT: 无法连接 Chrome。')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let seq = 0
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

const requests = []
const errors = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text)
})
await new Promise((r) => ws.addEventListener('open', r))
await send('Network.enable')
await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: `${BASE}/` })
await new Promise((r) => setTimeout(r, 6000))

const matched = srcMatch ? requests.filter((u) => u.startsWith(srcMatch[1])) : []
console.log('SCRIPT_SRC:', srcMatch ? srcMatch[1] : '(inline only)')
console.log('LOADED_IN_BROWSER:', srcMatch ? matched.length > 0 : 'n/a')
console.log('REQUESTS_TO_HOST:', JSON.stringify([...new Set(requests.filter((u) => srcMatch && u.includes(new URL(srcMatch[1]).host)))].slice(0, 5)))
console.log('EXCEPTIONS:', JSON.stringify(errors))
console.log('RESULT:', (srcMatch ? matched.length > 0 : true) && errors.length === 0 ? 'PASS' : 'CHECK')
ws.close()
process.exit(0)
