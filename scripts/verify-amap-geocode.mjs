// 校验「高德 Web 服务 Key」是否真的可用（逆地理编码）。
// 用法：node scripts/verify-amap-geocode.mjs [纬度] [经度]
// 不传坐标时用成都宽窄巷子附近的点。

const BASE = process.env.MEMORA_BASE || 'http://127.0.0.1:3001'
const LAT = Number(process.argv[2] ?? 30.663566)
const LON = Number(process.argv[3] ?? 104.066666)

const settings = await (await fetch(`${BASE}/api/system/settings/all`)).json()
const map = settings?.data?.map || {}
const key = map['amap.webServiceKey'] || map['amap.key'] || ''

if (!key) {
  console.log('RESULT: 设置里还没有 Web 服务 Key，先去 /admin/settings → 地图 填一个。')
  process.exit(1)
}

console.log('key:', key, map['amap.webServiceKey'] ? '(webServiceKey)' : '(回退到 amap.key)')

const url =
  'https://restapi.amap.com/v3/geocode/regeo' +
  `?location=${LON},${LAT}&key=${encodeURIComponent(key)}&extensions=all`

const res = await fetch(url)
const data = await res.json()

if (data?.status === '1' && data.regeocode) {
  const c = data.regeocode.addressComponent || {}
  console.log('RESULT: PASS')
  console.log('formattedAddress:', data.regeocode.formattedAddress)
  console.log('country:', c.country, '| province:', c.province, '| city:', c.city, '| adcode:', c.adcode)
  process.exit(0)
}

console.log('RESULT: FAIL')
console.log('info:', data?.info, '| infocode:', data?.infocode)
console.log(
  {
    USERKEY_PLAT_NOMATCH: '这个 Key 是「Web端(JS API)」的，逆地理编码要「Web服务」平台新建的 Key。',
    INVALID_USER_IP: 'IP 白名单不匹配：控制台把白名单清空，或把服务器出口 IP 加进去。',
    INVALID_USER_SCODE: '该 Key 开了「数字签名」，请求必须带 sig，需要配私钥。',
    INVALID_USER_KEY: 'Key 不存在或已被删除。',
    USERKEY_PEOPLE_QPS_HANDPOST: '超过 QPS/日配额。',
  }[data?.info] || '对照 https://lbs.amap.com/api/webservice/guide/tools/info 的错误码表排查。',
)
process.exit(1)
