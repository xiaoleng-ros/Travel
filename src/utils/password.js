/**
 * 密码规则 + 客户端哈希 —— 前端的唯一真相。
 *
 * 规则：长度 6-20 位，且需包含「大写字母 / 小写字母 / 数字 / 特殊字符」中的**至少两类**。
 * 后端 cloud-functions/api/[[default]].js 里是同一份定义（仅在明文提交时用于校验）。
 *
 * 为什么要客户端哈希：
 * 浏览器 DevTools 的 Network 面板展示的是**解密之后**的请求体，
 * 所以仅靠 HTTPS 挡不住「F12 里看到明文密码」。唯一办法是让发出去的东西
 * 本身就不是明文。
 *
 * 代价：服务端拿不到明文，因此密码强度只能在客户端校验（服务端只能验格式）。
 */

export const PASSWORD_MIN = 6
export const PASSWORD_MAX = 20

/** 四个字符类别：大写 / 小写 / 数字 / 特殊字符 */
const CLASS_RES = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^a-zA-Z0-9]/]

export const PASSWORD_RULE_TEXT = `长度 ${PASSWORD_MIN}-${PASSWORD_MAX} 位，需包含大写字母、小写字母、数字、特殊字符中的至少两类`

/** 客户端哈希值的形状：SHA-256 的十六进制表示 */
export const HASH_RE = /^[a-f0-9]{64}$/

/**
 * 校验**明文**密码是否符合规则。
 * @returns {string|null} 符合返回 null，否则返回给用户看的错误提示
 */
export function checkPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) return '请输入新密码'
  if (plain.length < PASSWORD_MIN || plain.length > PASSWORD_MAX) {
    return `密码长度需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`
  }
  const kinds = CLASS_RES.filter((re) => re.test(plain)).length
  if (kinds < 2) {
    return '密码需包含大写字母、小写字母、数字、特殊字符中的至少两类'
  }
  return null
}

/**
 * 与后端 clientHash() 一一对应的盐值。
 * 它在前端代码里是公开的 —— 这里的目标是「不暴露明文」，
 * 不是「防止别人逆推」（那是 HTTPS + bcrypt 的职责）。
 * 改动这里必须同步改后端，否则历史密码全部失效。
 */
const SALT = 'photo-memoir::v1::'

/**
 * 把明文密码转成发给服务端的凭证。
 * @param {string} plain
 * @returns {Promise<string>} 64 位十六进制字符串
 */
export async function hashPassword(plain) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Web Crypto 只在安全上下文可用（https / localhost）。
    // 用 http 访问非 localhost 的地址时会走到这里，宁可明确报错也不要静默发明文。
    throw new Error('当前环境不支持安全加密（需 https 或 localhost），无法登录')
  }
  const bytes = new TextEncoder().encode(SALT + plain)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
