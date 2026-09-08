import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeGridLayout, DEFAULT_GAP } from '../src/utils/masonry.js'

// 覆盖常见视口宽度与临界值（含奇数宽度，最容易暴露取整导致的左右不对称）
const WIDTHS = [320, 480, 768, 1024, 1280, 1365, 1366, 1367, 1440, 1441, 1920, 2560]

test('容器宽度为 0 或负数时不产生列', () => {
  for (const w of [0, -100, undefined]) {
    const r = computeGridLayout(w)
    assert.equal(r.columns, 0)
    assert.equal(r.itemWidth, 0)
    assert.equal(r.offsetX, 0)
  }
})

test('任意宽度下网格总宽都不超出容器（不会被滚动条裁切）', () => {
  for (const w of WIDTHS) {
    const { columns, itemWidth, gridWidth } = computeGridLayout(w)
    const expected = columns * itemWidth + (columns - 1) * DEFAULT_GAP
    assert.equal(gridWidth, expected, `宽度 ${w} 的网格总宽计算错误`)
    assert.ok(gridWidth <= w, `宽度 ${w} 时网格 ${gridWidth} 超出了容器`)
  }
})

test('左右间距对称：这是此前两侧留白不一致问题的回归防线', () => {
  for (const w of WIDTHS) {
    const { offsetX, gridWidth } = computeGridLayout(w)
    const left = offsetX
    const right = w - offsetX - gridWidth
    // 允许 1px 的取整误差，但不允许一侧明显大于另一侧
    assert.ok(
      Math.abs(left - right) <= 1,
      `宽度 ${w} 时左右间距不对称：左 ${left}px / 右 ${right}px`
    )
  }
})

test('列数随宽度递增且至少为 2 列', () => {
  let prev = 0
  for (const w of WIDTHS) {
    const { columns } = computeGridLayout(w)
    assert.ok(columns >= 2, `宽度 ${w} 时列数应至少为 2，实际 ${columns}`)
    assert.ok(columns >= prev, `宽度 ${w} 时列数不应比更窄时更少`)
    prev = columns
  }
})

test('列宽为正整数，避免小数像素导致的缝隙', () => {
  for (const w of WIDTHS) {
    const { itemWidth } = computeGridLayout(w)
    assert.ok(Number.isInteger(itemWidth), `宽度 ${w} 时列宽应为整数，实际 ${itemWidth}`)
    assert.ok(itemWidth > 0, `宽度 ${w} 时列宽应为正数`)
  }
})

test('自定义间距与最小列宽生效', () => {
  const narrow = computeGridLayout(1000, 4, 200)
  const wide = computeGridLayout(1000, 4, 400)
  assert.ok(narrow.columns > wide.columns, '最小列宽越大，列数应越少')
})
