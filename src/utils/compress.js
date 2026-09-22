/**
 * 上传前压缩 —— 把旧版服务端 sharp 的能力补回浏览器端。
 *
 * 背景：旧版自托管后端在上传时用 sharp 把主图缩到最长边 2048、质量 85
 * （见旧版 `server/utils/image.js` 的 `MAX_DISPLAY_SIZE` 与 `.rotate()`），
 * 存进存储空间的是压缩后的图。改成浏览器直传后这一步丢失，
 * 于是手机拍的原图（3–5MB，上限 20MB）被原样上传。
 *
 * 这在本项目的实际链路上代价很大：跨国上传实测约 17–111 KB/s，
 * 一张 5MB 原图要传数分钟，且连接失败率高。压缩后体积通常降一个量级，
 * 上传才进入可用范围。
 *
 * 行为（与旧版保持一致）：
 * - 方向按 EXIF 归一化（canvas 绘制时浏览器已按方向渲染），重编码后 EXIF 不带回
 * - 最长边 2048，不放大
 * - 已经足够小的图不重编码，避免白白掉画质
 */

/** 最长边上限，与旧版 MAX_DISPLAY_SIZE 一致 */
export const MAX_EDGE = 2048
/** JPEG / WebP 编码质量，与旧版 toFormat({ quality: 85 }) 一致 */
export const QUALITY = 0.85

/** 低于这个体积且尺寸已在范围内就不重编码 */
const SKIP_BYTES = 800 * 1024

/** 取小写扩展名（不含点） */
export function extOf(filename) {
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

/** 替换扩展名：压缩后格式可能变了，key 的扩展名必须跟着变 */
export function renameExt(filename, ext) {
  const base = String(filename || '').replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${ext}`
}

/**
 * 按最长边限制算目标尺寸。纯函数，便于单测。
 * @returns {{width:number, height:number, scale:number, needsResize:boolean}}
 */
export function fitWithin(width, height, max = MAX_EDGE) {
  if (!width || !height) return { width: 0, height: 0, scale: 1, needsResize: false }
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    needsResize: scale < 1,
  }
}

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const el = new Image()
    el.onload = () => resolve({ el, url })
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    el.src = url
  })
}

function encode(canvas, type, quality) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 压缩一张图。
 *
 * @param {File} file
 * @returns {Promise<{blob: Blob, filename: string, width: number|null, height: number|null, compressed: boolean}>}
 *   `blob`/`filename` 为实际要上传的内容与文件名（扩展名已随格式更新）；
 *   `width`/`height` 为最终尺寸，直接用于元数据入库，无需再次解码。
 *   任何异常都回退为「原文件原样上传」，不阻断上传流程。
 */
export async function compressImage(file) {
  const passthrough = (w = null, h = null) => ({
    blob: file, filename: file.name, width: w, height: h, compressed: false,
  })

  const ext = extOf(file.name)

  // 动图不处理：canvas 重编码会把 GIF 压成静态首帧
  if (ext === 'gif') return passthrough()

  let decoded
  try {
    decoded = await decode(file)
  } catch {
    return passthrough()
  }

  const { el, url } = decoded
  try {
    const sw = el.naturalWidth || 0
    const sh = el.naturalHeight || 0
    if (!sw || !sh) return passthrough()

    const fit = fitWithin(sw, sh)

    // 尺寸与体积都已在范围内：不重编码，避免白白掉画质
    if (!fit.needsResize && file.size <= SKIP_BYTES) {
      return passthrough(sw, sh)
    }

    const canvas = document.createElement('canvas')
    canvas.width = fit.width
    canvas.height = fit.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return passthrough(sw, sh)
    ctx.drawImage(el, 0, 0, fit.width, fit.height)

    // PNG / WebP 可能带透明通道，转 JPEG 会变黑底；优先输出 WebP（体积小且保留透明）
    let blob = null
    let outExt = 'jpg'
    if (ext === 'png' || ext === 'webp') {
      blob = await encode(canvas, 'image/webp', QUALITY)
      if (blob) {
        outExt = 'webp'
      } else {
        blob = await encode(canvas, 'image/png')
        outExt = 'png'
      }
    } else {
      blob = await encode(canvas, 'image/jpeg', QUALITY)
    }

    // 编码失败，或压完反而更大（小图、已高度压缩的图）→ 退回原文件
    if (!blob || blob.size >= file.size) return passthrough(sw, sh)

    return {
      blob,
      filename: renameExt(file.name, outExt),
      width: fit.width,
      height: fit.height,
      compressed: true,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
