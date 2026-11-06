import test from 'node:test'
import assert from 'node:assert/strict'
import {
  basename,
  colorSpaceLabel,
  downloadName,
  formatAperture,
  formatBytes,
  formatCoordinate,
  formatExposure,
  formatFocalLength,
  formatMegapixels,
  photoAspect,
  thumbnailFor,
} from '../src/lib/format.js'

test('formatBytes 走 1024 进制并带单位', () => {
  assert.equal(formatBytes(0), '—')
  assert.equal(formatBytes(-1), '—')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.0 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB')
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), '3.00 GB')
})

test('formatMegapixels 按百万像素换算', () => {
  assert.equal(formatMegapixels(4000, 3000), '12.00 MP')
  assert.equal(formatMegapixels(0, 100), '—')
  assert.equal(formatMegapixels(undefined, undefined), '—')
})

test('formatAperture / formatExposure / formatFocalLength 处理 0 与小数', () => {
  assert.equal(formatAperture(2.8), 'f/2.8')
  assert.equal(formatAperture(8), 'f/8')
  assert.equal(formatAperture(undefined), '—')
  assert.equal(formatExposure(1 / 250), '1/250')
  assert.equal(formatExposure(2), '2.0s')
  assert.equal(formatExposure(0), '—')
  assert.equal(formatFocalLength(35), '35mm')
  assert.equal(formatFocalLength(50.5), '50.5mm')
})

test('formatCoordinate 输出度分秒并带方向', () => {
  assert.equal(formatCoordinate(30.6636, 104.0666), `30°39'48.96"N 104°03'59.76"E`)
  assert.equal(formatCoordinate(-33.86, -70.65), `33°51'36.00"S 70°39'00.00"W`)
  assert.equal(formatCoordinate(null, 1), '—')
})

test('basename / thumbnailFor / photoAspect / downloadName 的兜底行为', () => {
  assert.equal(basename('uploads/a/b.jpg'), 'b.jpg')
  assert.equal(basename(''), '—')
  assert.equal(thumbnailFor({ thumbnailUrl: 't', originalUrl: 'o' }), 't')
  assert.equal(thumbnailFor({ originalUrl: 'o' }), 'o')
  assert.equal(thumbnailFor(null), '')
  assert.equal(photoAspect({ width: 1600, height: 900 }), 1600 / 900)
  assert.equal(photoAspect({}), 1)
  // 优先用上传时保留的原始文件名
  assert.equal(downloadName({ originalName: '截图 2026.png', storageKey: 'uploads/x.png' }), '截图 2026.png')
  assert.equal(downloadName({ storageKey: 'uploads/x.png' }), 'x.png')
  assert.equal(downloadName({}), 'photo.jpg')
})

test('colorSpaceLabel 已知值翻译、未知值原样返回', () => {
  assert.equal(colorSpaceLabel(1), 'sRGB')
  assert.equal(colorSpaceLabel(65535), 'Uncalibrated')
  assert.equal(colorSpaceLabel(99), '99')
  assert.equal(colorSpaceLabel(undefined), '—')
})
