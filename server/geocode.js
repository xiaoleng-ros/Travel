// 高德 Web 服务 API 逆地理编码。照片 EXIF 里的经纬度是 WGS-84，
// 而高德全链路（瓦片、地理编码、坐标）都是 GCJ-02，所以查询前必须纠偏，
// 否则在上海这类东部长经度区域会有 500m 以上偏移，街道级地址会认错。
const A = 6378245.0
const EE = 0.006693421622965943

function outOfChina(lon, lat) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLon(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return r
}

function transformLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return r
}

export function wgs84ToGcj02(lon, lat) {
  if (outOfChina(lon, lat)) return [lon, lat]
  let dLon = transformLon(lon - 105, lat - 35)
  let dLat = transformLat(lon - 105, lat - 35)
  const radLon = (lon * Math.PI) / 180
  const radLat = (lat * Math.PI) / 180
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLon = (dLon * 180) / (A / sqrtMagic * Math.cos(radLon) * Math.PI)
  dLat = (dLat * 180) / ((A * (1 - EE)) / (magic * sqrtMagic) * Math.PI)
  return [lon + dLon, lat + dLat]
}

export function resolveAmapKey(settings) {
  return process.env.AMAP_KEY?.trim() || settings?.map?.['amap.key']?.trim() || ''
}

function text(value) {
  // 高德的 city / district 在直辖市的边界外会返回空数组 []
  if (Array.isArray(value)) return value[0] || ''
  return typeof value === 'string' ? value : ''
}

export async function reverseGeocode({ latitude, longitude, key, timeoutMs = 3000 }) {
  if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const [gcjLon, gcjLat] = wgs84ToGcj02(longitude, latitude)
  const url =
    'https://restapi.amap.com/v3/geocode/regeo' +
    `?location=${gcjLon.toFixed(6)},${gcjLat.toFixed(6)}` +
    `&key=${encodeURIComponent(key)}&extensions=all`

  let data
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    data = await res.json()
  } catch {
    return null
  }

  if (data?.status !== '1' || !data.regeocode) return null

  const re = data.regeocode
  const c = re.addressComponent || {}
  const adcode = text(c.adcode)
  // 高德对海域、边界外只给到国家级：adcode=100000、province=中华人民共和国
  const isCountryLevel = !adcode || adcode === '100000'
  const province = isCountryLevel ? '' : text(c.province)
  const city = isCountryLevel ? '' : text(c.city) || province
  const district = text(c.district)
  const township = text(c.township)
  const seaArea = text(c.seaArea)
  const locationName = isCountryLevel
    ? seaArea
    : text(re.formattedAddress) || [province, district, township].filter(Boolean).join('')

  return {
    locationName: locationName || null,
    city: city || null,
    province: province || null,
    country: text(c.country) || null,
    district: district || null,
    township: township || null,
    adcode: adcode || null,
    citycode: text(c.citycode) || null,
    provider: 'amap',
    queriedAt: new Date().toISOString(),
    gcj02: [Number(gcjLon.toFixed(6)), Number(gcjLat.toFixed(6))],
  }
}
