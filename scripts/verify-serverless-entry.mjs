// 验证：以 EdgeOne Cloud Functions 的方式 import 入口，不应占用端口
import { spawn } from 'node:child_process'

const child = spawn(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
      const mod = await import('./cloud-functions/[[default]].js')
      const app = mod.default
      console.log('exported type:', typeof app)
      console.log('is express app:', typeof app === 'function' && typeof app.listen === 'function')
      // 稍微等一下，看是否会意外 listen
      await new Promise(r => setTimeout(r, 1500))
      console.log('STILL_ALIVE_NO_LISTEN')
      process.exit(0)
    `,
  ],
  { cwd: process.cwd(), stdio: 'inherit' },
)

child.on('exit', (code) => {
  console.log('child exit code:', code)
})
