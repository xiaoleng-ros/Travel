// 判断照片标题是否为无意义的自动生成 hash（如 32 位十六进制随机串）
// 这类标题由上传工具/临时文件名产生，展示出来会破坏观感，应隐藏。
// 形如：59fb0d8c8a45e4832401c16189b1b319
export function isMeaninglessHash(title) {
  if (typeof title !== 'string') return true
  const t = title.trim()
  if (!t) return true
  // 纯 16 进制、长度 >= 16：判定为自动生成的 hash/随机 id
  return /^[0-9a-f]{16,}$/i.test(t)
}

// 返回可用于展示的标题；无意义 hash / 空标题时返回 null
export function getDisplayTitle(title) {
  if (typeof title !== 'string') return null
  const t = title.trim()
  if (!t) return null
  if (isMeaninglessHash(t)) return null
  return t
}
