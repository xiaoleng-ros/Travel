// 登录凭据统一从环境变量读取，脚本里不保存任何明文密码。
// 直接 node scripts/xxx.mjs 运行时 Node 不会自动加载 .env，
// 请用 `node --env-file-if-exists=.env scripts/xxx.mjs`，或先 export 对应变量。
export function credentials() {
  const email = process.env.ADMIN_EMAIL?.trim() || 'admin@memora.local'
  const password = process.env.ADMIN_PASSWORD || ''
  if (!password) {
    throw new Error(
      '缺少 ADMIN_PASSWORD：请在 .env 中填入数据库中管理员的密码，' +
        '再用 node --env-file-if-exists=.env scripts/<脚本名>.mjs 运行。',
    )
  }
  return { email, password }
}
