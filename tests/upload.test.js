import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUploadFiles } from '../src/utils/upload.js'

const MB = 1024 * 1024
const ok = (name, size = 1024) => ({ name, size })

test('合法格式与体积通过校验', () => {
  const files = [
    ok('a.jpg'), ok('b.jpeg'), ok('c.png'), ok('d.gif'),
    ok('e.webp'), ok('f.bmp'), ok('g.avif'),
  ]
  assert.equal(validateUploadFiles(files), null)
})

test('扩展名大小写不敏感', () => {
  assert.equal(validateUploadFiles([ok('PHOTO.JPG'), ok('x.PnG')]), null)
})

test('空数组视为通过', () => {
  assert.equal(validateUploadFiles([]), null)
})

test('超过 20MB 的文件被拒绝，并指出文件名', () => {
  const result = validateUploadFiles([ok('big.jpg', 21 * MB)])
  assert.match(result, /big\.jpg/)
  assert.match(result, /20MB/)
})

test('恰好 20MB 属于边界内，予以通过', () => {
  assert.equal(validateUploadFiles([ok('edge.jpg', 20 * MB)]), null)
})

test('不支持的格式被拒绝，并列出支持的类型', () => {
  const result = validateUploadFiles([ok('virus.exe')])
  assert.match(result, /virus\.exe/)
  assert.match(result, /格式不支持/)
})

test('仅凭后缀伪装的图片（如 .txt）无法通过', () => {
  assert.match(validateUploadFiles([ok('a.txt')]), /格式不支持/)
})

test('一批文件中只要有一个不合法就整体拒绝', () => {
  const files = [ok('good.jpg'), ok('bad.tiff')]
  const result = validateUploadFiles(files)
  assert.match(result, /bad\.tiff/)
})

test('超过服务端凭证签发上限（20 张）的批次被整体拒绝', () => {
  const files = Array.from({ length: 21 }, (_, i) => ok(`p${i}.jpg`))
  const result = validateUploadFiles(files)
  assert.match(result, /最多上传 20 张/)
  // 边界：恰好 20 张应通过
  assert.equal(validateUploadFiles(files.slice(0, 20)), null)
})
