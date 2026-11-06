import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { detectFormat, imageSizeFromBuffer } from '../server/image-size.js'

// 用 sharp 现场生成各种格式的小图，避免往仓库里塞二进制测试素材。
async function make(format, width, height) {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
  if (format === 'jpeg') return pipeline.jpeg().toBuffer()
  if (format === 'png') return pipeline.png().toBuffer()
  if (format === 'webp') return pipeline.webp().toBuffer()
  if (format === 'gif') return pipeline.gif().toBuffer()
  throw new Error(`unsupported ${format}`)
}

test('detectFormat 认得常见图片格式的魔数', async () => {
  assert.equal(detectFormat(await make('jpeg', 8, 8)), 'jpeg')
  assert.equal(detectFormat(await make('png', 8, 8)), 'png')
  assert.equal(detectFormat(await make('webp', 8, 8)), 'webp')
  assert.equal(detectFormat(await make('gif', 8, 8)), 'gif')
})

test('detectFormat 对空/过短/非图片返回 null', () => {
  assert.equal(detectFormat(null), null)
  assert.equal(detectFormat(Buffer.alloc(4)), null)
  assert.equal(detectFormat(Buffer.from('这不是图片，只是一段很长的文字内容。', 'utf8')), null)
})

test('imageSizeFromBuffer 读出 JPEG / PNG / WebP / GIF 的真实宽高', async () => {
  for (const format of ['jpeg', 'png', 'webp', 'gif']) {
    const buf = await make(format, 37, 21)
    const size = imageSizeFromBuffer(buf)
    assert.ok(size, `${format} 应该能解析出尺寸`)
    assert.equal(size.format, format)
    assert.equal(size.width, 37, `${format} width`)
    assert.equal(size.height, 21, `${format} height`)
  }
})

test('imageSizeFromBuffer 对截断的头部安全返回 null', async () => {
  const jpeg = await make('jpeg', 40, 30)
  // 只给前 20 字节：还没走到 SOF 段，解析不出尺寸也不能抛错
  assert.equal(imageSizeFromBuffer(jpeg.subarray(0, 20)), null)
  assert.equal(imageSizeFromBuffer(Buffer.alloc(0)), null)
})
