/**
 * 图片处理单元测试：EXIF 拍摄时间读取 + 缩略图输出。
 *
 * 时区固定为东八区：拍摄时间在 EXIF 中不带时区信息，
 * 若实现错误地把它当 UTC 解析，正好会偏移 8 小时 —— 在这个时区下最容易被测出来。
 */
process.env.TZ = 'Asia/Shanghai'

const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const os = require('os')
const sharp = require('sharp')
const { readCaptureTime, processThumbnail } = require('../utils/image')

/**
 * 生成一张测试用 JPEG。
 * 返回 Buffer 而非文件路径，与生产调用方式保持一致：
 * 生产链路上 sharp 与 exifr 都只处理内存中的 Buffer，
 * 不直接读文件，避免在 Windows 上持有句柄导致临时文件删不掉。
 */
async function makeJpegBuffer(exif) {
  let pipeline = sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 130, g: 110, b: 90 } },
  }).jpeg()
  if (exif) pipeline = pipeline.withExif(exif)
  return pipeline.toBuffer()
}

test('readCaptureTime: 读出 EXIF 中的拍摄时间', async () => {
  const buffer = await makeJpegBuffer({
    IFD0: { Make: 'TestCam' },
    IFD2: { DateTimeOriginal: '2021:07:15 18:42:11' },
  })
  assert.strictEqual(await readCaptureTime(buffer), '2021-07-15T18:42:11')
})

test('readCaptureTime: 返回的是拍摄当地时间，不做时区换算（回归防线）', async () => {
  // EXIF 里写 09:05，就必须原样返回 09:05。
  // 若实现改用 exifr 默认的日期解析，会把它当 UTC，在东八区得到 01:05 —— 此处即会失败。
  const buffer = await makeJpegBuffer({ IFD2: { DateTimeOriginal: '2023:01:02 09:05:00' } })
  const result = await readCaptureTime(buffer)
  assert.strictEqual(result, '2023-01-02T09:05:00')
  assert.ok(!result.endsWith('Z'), '不应带时区后缀')
})

test('readCaptureTime: 缺少 EXIF 时返回 null', async () => {
  const buffer = await makeJpegBuffer()
  assert.strictEqual(await readCaptureTime(buffer), null)
})

test('readCaptureTime: 相机时间未校准的非法日期被丢弃', async () => {
  const buffer = await makeJpegBuffer({ IFD2: { DateTimeOriginal: '0000:00:00 00:00:00' } })
  assert.strictEqual(await readCaptureTime(buffer), null)
})

test('readCaptureTime: 无效输入返回 null 而不抛错', async () => {
  const missing = path.join(os.tmpdir(), 'photo-memoir-not-exist.jpg')
  assert.strictEqual(await readCaptureTime(missing), null)
  assert.strictEqual(await readCaptureTime(null), null)
})

test('processThumbnail: 统一输出 WebP 且扩展名正确', async () => {
  const src = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 40, g: 80, b: 120 } },
  }).jpeg().toBuffer()

  const { buffer, ext } = await processThumbnail(src, 'jpeg')
  assert.strictEqual(ext, '.webp', '扩展名必须与实际内容一致，否则静态服务会给出错误的 Content-Type')

  const meta = await sharp(buffer).metadata()
  assert.strictEqual(meta.format, 'webp')
  assert.strictEqual(meta.width, 640, '长边应压缩到 640')
  assert.strictEqual(meta.height, 320, '保持原始宽高比')
})

test('processThumbnail: 小图不被放大', async () => {
  const src = await sharp({
    create: { width: 100, height: 50, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).png().toBuffer()

  const { buffer, ext } = await processThumbnail(src, 'png')
  assert.strictEqual(ext, '.webp')
  const meta = await sharp(buffer).metadata()
  assert.strictEqual(meta.width, 100)
  assert.strictEqual(meta.height, 50)
})
