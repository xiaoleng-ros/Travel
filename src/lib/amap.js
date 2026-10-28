let configPromise = null
let loadPromise = null

export function getMapConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/map/config')
      .then((res) => {
        if (!res.ok) throw new Error('地图配置获取失败')
        return res.json()
      })
      .catch((err) => {
        configPromise = null
        throw err
      })
  }
  return configPromise
}

export function amapStyle(config, dark) {
  return (dark ? config?.styleDark : config?.style) || 'amap://styles/whitesmoke'
}

// 高德 JS API 2.0 只能整站加载一次，重复注入会互相覆盖全局 AMap
export function loadAmap(plugins = []) {
  if (window.AMap) {
    return Promise.resolve(window.AMap)
  }
  if (!loadPromise) {
    loadPromise = getMapConfig()
      .then((config) => {
        if (!config?.key) throw new Error('未配置高德地图 Key')
        const src =
          'https://webapi.amap.com/maps?v=2.0&key=' +
          encodeURIComponent(config.key) +
          (plugins.length ? '&plugin=' + plugins.join(',') : '')
        return new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.async = true
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('高德地图脚本加载失败'))
          document.head.appendChild(script)
        })
      })
      .then(() => window.AMap)
      .then((AMap) => {
        if (!AMap) throw new Error('高德地图初始化失败')
        const missing = plugins.filter((name) => !AMap[name.split('.').pop()])
        if (!missing.length) return AMap
        return new Promise((resolve) => {
          AMap.plugin(missing, () => resolve(AMap))
          // 插件偶尔不回调（离线或被拦截），超时后交给调用方按缺省渲染
          setTimeout(() => resolve(AMap), 6000)
        })
      })
      .catch((err) => {
        loadPromise = null
        throw err
      })
  }
  return loadPromise
}
