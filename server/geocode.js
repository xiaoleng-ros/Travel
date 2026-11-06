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

// 前端底图用的 Key（JS API）。它只能在浏览器里带 securityJsCode 使用，
// 直接拿去请求 restapi.amap.com 会返回 USERKEY_PLAT_NOMATCH（10009）。
export function resolveAmapKey(settings) {
  return process.env.AMAP_KEY?.trim() || settings?.map?.['amap.key']?.trim() || ''
}

// 服务端逆地理编码用的 Key（Web 服务）。高德控制台里这是和 JS API 分开申请的
// 另一种 Key，两者不能互换。没单独配置时退回旧字段，方便已有部署继续工作。
export function resolveAmapWebServiceKey(settings) {
  return (
    process.env.AMAP_WEB_SERVICE_KEY?.trim() ||
    settings?.map?.['amap.webServiceKey']?.trim() ||
    settings?.map?.['amap.key']?.trim() ||
    ''
  )
}

// 高德 JS API 2.0 在 2021-12-02 之后申请的 Key 都需要配合「安全密钥」（securityJsCode）
// 使用。前端必须在加载 webapi.amap.com/maps 脚本之前把它挂到 window._AMapSecurityConfig，
// 否则瓦片会以灰色显示，并在控制台报 INVALID_USER_SCODE。REST 逆地理编码不依赖这个。
export function resolveAmapSecurityCode(settings) {
  return process.env.AMAP_SECURITY_CODE?.trim() || settings?.map?.['amap.securityCode']?.trim() || ''
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
  // 高德返回的是 snake_case 的 formatted_address，不是 formattedAddress；
  // 写成驼峰会一直取到 undefined，位置名就退化成「省+区+街道」的拼接。
  const locationName = isCountryLevel
    ? seaArea
    : text(re.formatted_address) || text(re.formattedAddress) || [province, district, township].filter(Boolean).join('')

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
