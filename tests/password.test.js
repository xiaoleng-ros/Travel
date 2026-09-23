import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkPassword,
  hashPassword,
  PASSWORD_MIN,
  PASSWORD_MAX,
  HASH_RE,
} from '../src/utils/password.js'

// 样本一律用构造式生成，避免源码里出现看着像真实密码的字面量
const twoKinds = 'q'.repeat(4) + '7'.repeat(4)              // 8 位：小写 + 数字
const fourKinds = ['A', 'b', '1', '!', 'c', 'd'].join('')   // 6 位：四类齐全（下限）
const upperAndSymbol = ['Z', 'x', 'y', 'z', '@'].join('') + 'z' // 6 位：大写 + 特殊字符
const onlyDigits = '9'.repeat(8)                            // 仅数字
const onlyLower = 'q'.repeat(8)                             // 仅小写
const onlyUpper = 'Q'.repeat(8)                             // 仅大写
const tooShort = 'a1'.repeat(2)                             // 4 位
const tooLong = 'a1' + 'b'.repeat(19)                       // 21 位

test('长度在 6-20 区间内、且含两类字符时通过', () => {
  assert.equal(checkPassword(twoKinds), null)
  assert.equal(checkPassword(fourKinds), null)
  assert.equal(checkPassword(upperAndSymbol), null)
})

test('短于下限或长于上限一律拒绝', () => {
  assert.equal(checkPassword(tooShort), `密码长度需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`)
  assert.equal(checkPassword(tooLong), `密码长度需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`)
})

test('只含单一字符类别的密码被拒绝（任选其二）', () => {
  const expect = '密码需包含大写字母、小写字母、数字、特殊字符中的至少两类'
  assert.equal(checkPassword(onlyDigits), expect)
  assert.equal(checkPassword(onlyLower), expect)
  assert.equal(checkPassword(onlyUpper), expect)
})

test('空值与非字符串输入被拒绝', () => {
  assert.equal(checkPassword(''), '请输入新密码')
  assert.equal(checkPassword(undefined), '请输入新密码')
  assert.equal(checkPassword(null), '请输入新密码')
})

test('6 位与 20 位是合法边界', () => {
  assert.equal(checkPassword(fourKinds), null)                        // 恰好 6 位
  assert.equal(checkPassword('aB1'.repeat(6) + 'cd'), null)           // 恰好 20 位
})

test('hashPassword 输出 64 位十六进制，且同样输入结果稳定', async () => {
  const a = await hashPassword(twoKinds)
  const b = await hashPassword(twoKinds)
  assert.equal(a, b)
  assert.match(a, HASH_RE)
  assert.equal(a.length, 64)
})

test('hashPassword 对不同输入产生不同结果', async () => {
  const a = await hashPassword(twoKinds)
  const b = await hashPassword(fourKinds)
  assert.notEqual(a, b)
})

test('哈希结果里不含明文片段', async () => {
  const plain = fourKinds
  const hashed = await hashPassword(plain)
  assert.equal(hashed.includes(plain), false)
})
