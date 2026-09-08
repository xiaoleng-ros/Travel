// 瀑布流布局计算：抽成纯函数，便于单元测试与回归验证
export const DEFAULT_GAP = 4
export const MIN_ITEM_WIDTH = 274

/**
 * 根据容器内容宽度计算列数、列宽与左右对称偏移。
 *
 * 关键点：
 * - 宽度必须取容器的 clientWidth（不含滚动条），否则网格会比可视区宽、右侧被裁
 * - 列宽向下取整，除不尽的剩余像素通过 offsetX 平分到左右两侧，保证两边间距一致
 *
 * @param {number} containerWidth 容器内容宽度（clientWidth）
 * @param {number} gap 列间距
 * @param {number} minItemWidth 单个格子的最小宽度，决定列数
 */
export function computeGridLayout(containerWidth, gap = DEFAULT_GAP, minItemWidth = MIN_ITEM_WIDTH) {
  if (!containerWidth || containerWidth <= 0) {
    return { columns: 0, itemWidth: 0, offsetX: 0, gridWidth: 0, gap }
  }

  const columns = Math.max(2, Math.floor((containerWidth + gap) / minItemWidth))
  const itemWidth = Math.floor((containerWidth - (columns - 1) * gap) / columns)
  const gridWidth = columns * itemWidth + (columns - 1) * gap
  const offsetX = Math.floor((containerWidth - gridWidth) / 2)

  return { columns, itemWidth, offsetX, gridWidth, gap }
}
