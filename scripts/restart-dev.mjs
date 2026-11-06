#!/usr/bin/env node
/**
 * 一键重启本地开发环境。
 *
 * 为什么需要它：server/ 下的代码是 Node 直接跑的，改完不会热更新。
 * 如果忘了重启，前端就会一直拿到 404（旧进程里根本没有新路由）。
 *
 * 用法：  node scripts/restart-dev.mjs
 * 如果提示 access denied，用管理员身份打开终端再跑一次。
 */
import { execSync, spawn } from 'node:child_process'

const PORTS = [3001, 5173]

function listeningPids() {
  let out = ''
  try {
    out = execSync('netstat -ano', { encoding: 'utf8' })
  } catch {
    return []
  }
  const pids = new Set()
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue
    for (const port of PORTS) {
      // 匹配 ":3001 " / ":3001\t"，避免误伤 30010 这类端口
      if (!new RegExp(`:${port}\\s`).test(line)) continue
      const cols = line.trim().split(/\s+/)
      const pid = cols[cols.length - 1]
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(Number(pid))
    }
  }
  return [...pids]
}

function kill(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const pids = listeningPids()
if (!pids.length) {
  console.log('没有进程占用 3001 / 5173。')
} else {
  console.log(`占用 3001 / 5173 的进程：${pids.join(', ')}`)
  let failed = 0
  for (const pid of pids) {
    if (kill(pid)) console.log(`  已结束 PID ${pid}`)
    else {
      failed += 1
      console.error(`  结束 PID ${pid} 失败（权限不足）`)
    }
  }
  if (failed) {
    console.error('\n请用管理员身份打开终端重跑，或在任务管理器里结束所有 node.exe。')
    process.exit(1)
  }
}

// 等一下让端口真正释放
await new Promise((r) => setTimeout(r, 1200))

console.log('\n启动 npm run dev ...\n')
const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
})
child.on('exit', (code) => process.exit(code ?? 0))
