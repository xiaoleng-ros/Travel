import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMeaninglessHash, getDisplayTitle } from '../src/utils/title.js'

test('32 位十六进制 hash 判定为无意义', () => {
  assert.equal(isMeaninglessHash('59fb0d8c8a45e4832401c16189b1b319'), true)
})

test('16 位以上纯十六进制判定为 hash', () => {
  assert.equal(isMeaninglessHash('b6b8f43ffabc4ec78157'), true)
})

test('有意义的标题不是 hash', () => {
  assert.equal(isMeaninglessHash('vlog3'), false)
  assert.equal(isMeaninglessHash('美妆16'), false)
  assert.equal(isMeaninglessHash('屏幕截图 2026-03-26'), false)
  assert.equal(isMeaninglessHash('展会英'), false)
})

test('空字符串 / 非字符串视为无意义', () => {
  assert.equal(isMeaninglessHash(''), true)
  assert.equal(isMeaninglessHash('   '), true)
  assert.equal(isMeaninglessHash(null), true)
  assert.equal(isMeaninglessHash(undefined), true)
})

test('getDisplayTitle 过滤 hash，保留有效标题', () => {
  assert.equal(getDisplayTitle('59fb0d8c8a45e4832401c16189b1b319'), null)
  assert.equal(getDisplayTitle(''), null)
  assert.equal(getDisplayTitle('美妆16'), '美妆16')
  assert.equal(getDisplayTitle('  vlog3  '), 'vlog3')
})
