import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, renameExt, extOf, MAX_EDGE } from '../src/utils/compress.js'

// ---- fitWithin：压缩后的目标尺寸 ----
// 这是上传前压缩的核心计算，错了会导致图片被意外放大或比例失真。

test('横图按最长边缩到上限，比例保持', () => {
  const r = fitWithin(4000, 3000)
  assert.equal(r.width, MAX_EDGE)
  assert.equal(r.height, 1536)
  assert.equal(r.needsResize, true)
})

test('竖图按高度缩到上限', () => {
  const r = fitWithin(3000, 4000)
  assert.equal(r.width, 1536)
  assert.equal(r.height, MAX_EDGE)
  assert.equal(r.needsResize, true)
})

test('小图不放大（withoutEnlargement 语义）', () => {
  const r = fitWithin(1000, 800)
  assert.equal(r.width, 1000)
  assert.equal(r.height, 800)
  assert.equal(r.needsResize, false)
})

test('正好等于上限时不缩放', () => {
  const r = fitWithin(MAX_EDGE, 1000)
  assert.equal(r.width, MAX_EDGE)
  assert.equal(r.height, 1000)
  assert.equal(r.needsResize, false)
})

test('极端长边不会算出 0 像素', () => {
  const r = fitWithin(10000, 5)
  assert.equal(r.width, MAX_EDGE)
  assert.ok(r.height >= 1, '高度必须至少 1 像素，否则 canvas 无法创建')
})

test('宽高缺失时返回零尺寸而不是崩溃', () => {
  for (const [w, h] of [[0, 0], [null, 100], [100, undefined]]) {
    const r = fitWithin(w, h)
    assert.equal(r.width, 0)
    assert.equal(r.height, 0)
    assert.equal(r.needsResize, false)
  }
})

test('自定义上限生效', () => {
  const r = fitWithin(1000, 500, 500)
  assert.equal(r.width, 500)
  assert.equal(r.height, 250)
})

// ---- renameExt / extOf ----
// 压缩后格式会变（png → webp），key 的扩展名必须跟着变，
// 否则对象内容与扩展名不符，CDN 会给出错误的 Content-Type。

test('替换扩展名', () => {
  assert.equal(renameExt('IMG_1234.png', 'webp'), 'IMG_1234.webp')
  assert.equal(renameExt('a.jpg', 'jpg'), 'a.jpg')
})

test('文件名里有多个点时只替换最后一段', () => {
  assert.equal(renameExt('2024.09.21 海边.png', 'jpg'), '2024.09.21 海边.jpg')
})

test('无扩展名时补上，空名回退为 image', () => {
  assert.equal(renameExt('photo', 'jpg'), 'photo.jpg')
  assert.equal(renameExt('', 'jpg'), 'image.jpg')
})

test('扩展名大小写不敏感', () => {
  assert.equal(extOf('PHOTO.JPG'), 'jpg')
  assert.equal(extOf('a.PnG'), 'png')
  assert.equal(extOf('noext'), '')
  assert.equal(extOf(''), '')
})

test('中文文件名不被破坏', () => {
  assert.equal(renameExt('海边日落.jpg', 'webp'), '海边日落.webp')
})
