import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// 高德提供的免费栅格瓦片，不需要 Key、不需要安全密钥、不需要域名白名单。
// style=7 是标准（含路网+注记），适合中国地图展示。
// 注：高德瓦片是 GCJ-02 坐标，照片坐标也已由服务端转成 GCJ-02，直接对应即可。
//
// 浏览器直连高德瓦片会被 referer 校验/运营商劫持干扰（表现为 ERR_EMPTY_RESPONSE），
// 所以统一走同源代理 /api/map/tile，由服务端取图并缓存。
const AMAP_RASTER_TILES = ['/api/map/tile?x={x}&y={y}&z={z}']

export function createMapLibreStyle(dark = false) {
  return {
    version: 8,
    sources: {
      amap: {
        type: 'raster',
        tiles: AMAP_RASTER_TILES,
        tileSize: 256,
        attribution: '© 高德地图',
      },
    },
    layers: [
      {
        id: 'amap-tiles',
        type: 'raster',
        source: 'amap',
        paint: dark ? { 'raster-brightness-min': 0.2, 'raster-brightness-max': 0.7 } : {},
      },
    ],
  }
}

export { maplibregl }
