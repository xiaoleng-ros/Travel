import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, sortPhotos } from '../src/lib/gallery.js'

const EMPTY = { tags: [], cameras: [], lenses: [], cities: [], ratings: [] }

const photos = [
  {
    id: 'a',
    title: '千岛湖',
    description: '冬天的湖边',
    tags: ['浙江', '湖'],
    city: '杭州市',
    rating: 5,
    fileSize: 300,
    dateTaken: '2024-01-02T00:00:00.000Z',
    exif: { Make: 'Canon', Model: 'EOS R5', LensModel: 'RF 24-70' },
  },
  {
    id: 'b',
    title: '成都秋梨水',
    description: '宽窄巷子',
    tags: ['四川'],
    city: '成都市',
    rating: 4,
    fileSize: 100,
    dateTaken: '2023-05-06T00:00:00.000Z',
    exif: { Make: 'Sony', Model: 'A7M4', LensModel: 'FE 35mm' },
  },
  {
    id: 'c',
    title: '没有拍摄时间的照片',
    tags: [],
    fileSize: 200,
    exif: {},
  },
]

test('applyFilters 不带条件时原样返回', () => {
  assert.equal(applyFilters(photos, { filters: EMPTY, search: '' }).length, 3)
})

test('applyFilters 搜索覆盖标题/描述/标签/城市/机身', () => {
  const ids = (search) =>
    applyFilters(photos, { filters: EMPTY, search }).map((photo) => photo.id)
  assert.deepEqual(ids('千岛'), ['a'])
  assert.deepEqual(ids('宽窄'), ['b'])
  assert.deepEqual(ids('四川'), ['b'])
  assert.deepEqual(ids('成都'), ['b'])
  assert.deepEqual(ids('A7M4'), ['b'])
  assert.deepEqual(ids('   '), ['a', 'b', 'c'])
  assert.deepEqual(ids('不存在的关键词'), [])
})

test('applyFilters 的标签/机身/镜头/城市/评分是 AND 关系', () => {
  const only = (patch) =>
    applyFilters(photos, { filters: { ...EMPTY, ...patch }, search: '' }).map((photo) => photo.id)

  assert.deepEqual(only({ tags: ['四川'] }), ['b'])
  // 机型优先取 Model，没有 Model 才退回 Make
  assert.deepEqual(only({ cameras: ['A7M4'] }), ['b'])
  assert.deepEqual(only({ cameras: ['Sony'] }), [])
  assert.deepEqual(only({ lenses: ['FE 35mm'] }), ['b'])
  assert.deepEqual(only({ cities: ['杭州市'] }), ['a'])
  assert.deepEqual(only({ ratings: [5] }), ['a'])
  // 没有评分的照片按 0 处理
  assert.deepEqual(only({ ratings: [0] }), ['c'])
  // 条件叠加后取交集
  assert.deepEqual(only({ tags: ['四川'], cities: ['杭州市'] }), [])
  assert.deepEqual(only({ tags: ['四川'], cameras: ['A7M4'] }), ['b'])
})

test('sortPhotos 各排序方式', () => {
  const ids = (sort) => sortPhotos(photos, sort).map((photo) => photo.id)
  assert.deepEqual(ids('dateAsc'), ['c', 'b', 'a'])
  assert.deepEqual(ids('dateDesc'), ['a', 'b', 'c'])
  assert.deepEqual(ids('sizeAsc'), ['b', 'c', 'a'])
  assert.deepEqual(ids('sizeDesc'), ['a', 'c', 'b'])
  // 中文按拼音排序：成 < 没 < 千
  assert.deepEqual(ids('titleAsc'), ['b', 'c', 'a'])
})

test('sortPhotos 不修改原数组', () => {
  const before = photos.map((photo) => photo.id)
  sortPhotos(photos, 'sizeAsc')
  assert.deepEqual(photos.map((photo) => photo.id), before)
})
