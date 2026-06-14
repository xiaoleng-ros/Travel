import { getAlbumList as realGetAlbumList, getAlbumPhotos as realGetAlbumPhotos } from './real'

const albums = [
  {
    id: 1, name: '春日纪行',
    cover: 'https://picsum.photos/seed/spring1/400/300',
    create_time: '2026-03-15T08:00:00Z',
    photo_count: 42, description: '春天里的每一帧都是诗',
  },
  {
    id: 2, name: '城市掠影',
    cover: 'https://picsum.photos/seed/city1/400/300',
    create_time: '2026-04-02T10:30:00Z',
    photo_count: 36, description: '钢筋水泥中的温度',
  },
  {
    id: 3, name: '山海之间',
    cover: 'https://picsum.photos/seed/mountain1/400/300',
    create_time: '2026-05-10T06:15:00Z',
    photo_count: 28, description: '远山与海的对话',
  },
  {
    id: 4, name: '日常碎片',
    cover: 'https://picsum.photos/seed/daily1/400/300',
    create_time: '2026-05-20T12:00:00Z',
    photo_count: 55, description: '平凡日子里的光',
  },
  {
    id: 5, name: '黄昏收集者',
    cover: 'https://picsum.photos/seed/sunset1/400/300',
    create_time: '2026-06-01T18:30:00Z',
    photo_count: 19, description: '把黄昏装进口袋',
  },
]

const photoPool = [
  { width: 4, height: 3, title: '晨光中的小路', description: '清晨的阳光穿过树叶，洒在蜿蜒的小路上。' },
  { width: 3, height: 4, title: '雨后的窗台', description: '雨滴还挂在玻璃上，窗外的世界格外清晰。' },
  { width: 4, height: 3, title: '街角的咖啡店', description: '转角遇到的那家小店，散发着温暖的香气。' },
  { width: 3, height: 4, title: '秋叶', description: '一片落叶，记录着季节的更迭。' },
  { width: 4, height: 3, title: '海边的黄昏', description: '夕阳把大海染成了金色。' },
  { width: 4, height: 4, title: '猫咪的午后', description: '慵懒的午后，和猫咪一起晒太阳。' },
  { width: 3, height: 4, title: '城市天际线', description: '站在高处俯瞰这座永不眠的城市。' },
  { width: 4, height: 3, title: '花田', description: '一望无际的花海，风吹过泛起层层波浪。' },
  { width: 3, height: 4, title: '老街区', description: '斑驳的墙壁诉说着岁月的故事。' },
  { width: 4, height: 3, title: '星空', description: '抬头仰望，银河横亘天际。' },
  { width: 4, height: 5, title: '窗', description: '每一扇窗后面，都有一个故事。' },
  { width: 4, height: 3, title: '雪景', description: '银装素裹的世界，安静而纯粹。' },
  { width: 3, height: 4, title: '书桌一角', description: '凌乱的书桌，是生活的痕迹。' },
  { width: 16, height: 9, title: '湖面倒影', description: '平静的湖面像一面镜子。' },
  { width: 4, height: 3, title: '街头艺人', description: '用音乐温暖着路人的心。' },
  { width: 3, height: 4, title: '黄昏的灯塔', description: '灯塔在暮色中静静伫立。' },
  { width: 4, height: 3, title: '春天的樱花', description: '樱花树下，是一场粉色的梦。' },
  { width: 3, height: 4, title: '老照片', description: '泛黄的照片里，藏着旧时光。' },
  { width: 4, height: 3, title: '日落大道', description: '行驶在通往日落的大道上。' },
  { width: 4, height: 5, title: '雨后彩虹', description: '风雨过后，彩虹悄然出现。' },
]

const photoCache = {}

function generatePhotos(albumId, count) {
  const photos = []
  for (let i = 0; i < count; i++) {
    const template = photoPool[i % photoPool.length]
    const seed = `album${albumId}-photo${i}`
    photos.push({
      id: albumId * 1000 + i,
      album_id: albumId,
      url: `https://picsum.photos/seed/${seed}/400`,
      original_url: `https://picsum.photos/seed/${seed}/1200/${Math.round(1200 * template.height / template.width)}`,
      width: template.width,
      height: template.height,
      name: template.title,
      title: template.title,
      description: template.description,
      create_time: new Date(Date.now() - (count - i) * 86400000).toISOString(),
    })
  }
  return photos
}

function delay(ms = 300) {
  return new Promise(r => setTimeout(r, ms))
}

export async function getAlbumList(params = {}) {
  try {
    const res = await realGetAlbumList(params)
    if (res.code === 200 && res.data) return res
  } catch {}
  // Fallback to mock
  await delay(400)
  const { page = 1, limit = 100 } = params
  const start = (page - 1) * limit
  const result = albums.slice(start, start + limit)
  return {
    code: 200,
    message: 'success',
    data: { result, total: albums.length, page, limit },
  }
}

export async function getAlbumPhotos(albumId, params = {}) {
  try {
    const res = await realGetAlbumPhotos(albumId, params)
    if (res.code === 200 && res.data && res.data.result && res.data.result.length > 0) return res
  } catch {}
  // Fallback to mock
  await delay(500)
  const { page = 1, limit = 40 } = params
  if (!photoCache[albumId]) {
    const album = albums.find(a => a.id === albumId)
    photoCache[albumId] = generatePhotos(albumId, album ? album.photo_count : 40)
  }
  const all = photoCache[albumId]
  const start = (page - 1) * limit
  const result = all.slice(start, start + limit).map(p => ({
    ...p,
    create_time: new Date(p.create_time).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
  }))
  return {
    code: 200,
    message: 'success',
    data: { result, total: all.length, page, limit },
  }
}

export async function getAlbumById(id) {
  try {
    const { getAdminAlbum } = await import('./real')
    const res = await getAdminAlbum(id)
    if (res.code === 200 && res.data && res.data.name) {
      return { code: 200, message: 'success', data: res.data }
    }
  } catch {}
  await delay(200)
  const numId = Number(id)
  if (numId === 0) {
    return {
      code: 200, message: 'success', data: {
        id: 0, name: '全部', cover: albums[0]?.cover || '',
        create_time: new Date().toISOString(), photo_count: albums.reduce((s, a) => s + a.photo_count, 0),
      },
    }
  }
  const album = albums.find(a => a.id === numId)
  if (!album) return { code: 404, message: '相册不存在', data: null }
  return { code: 200, message: 'success', data: album }
}
