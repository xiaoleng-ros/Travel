import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAmapKey,
  resolveAmapSecurityCode,
  resolveAmapWebServiceKey,
  wgs84ToGcj02,
} from '../server/geocode.js'

// 保存并恢复环境变量，避免测试之间互相污染。
function withEnv(pairs, fn) {
  const saved = {}
  for (const key of Object.keys(pairs)) {
    saved[key] = process.env[key]
    if (pairs[key] === undefined) delete process.env[key]
    else process.env[key] = pairs[key]
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('wgs84ToGcj02 在国内偏移、在国外原样返回', () => {
  const [lng, lat] = wgs84ToGcj02(104.0666, 30.6636)
  // 成都一带的 GCJ-02 偏移量级约 0.001~0.01 度，方向不固定，只校验量级
  assert.ok(Math.abs(lng - 104.0666) > 0.0005 && Math.abs(lng - 104.0666) < 0.01, `lng=${lng}`)
  assert.ok(Math.abs(lat - 30.6636) > 0.0005 && Math.abs(lat - 30.6636) < 0.01, `lat=${lat}`)

  // 东京不在国内偏移范围内
  assert.deepEqual(wgs84ToGcj02(139.6917, 35.6895), [139.6917, 35.6895])
})

test('三个 Amap Key 解析器各自读自己的字段', () => {
  const settings = {
    map: {
      'amap.key': 'js-key',
      'amap.securityCode': 'sec-code',
      'amap.webServiceKey': 'web-key',
    },
  }
  withEnv({ AMAP_KEY: undefined, AMAP_SECURITY_CODE: undefined, AMAP_WEB_SERVICE_KEY: undefined }, () => {
    assert.equal(resolveAmapKey(settings), 'js-key')
    assert.equal(resolveAmapSecurityCode(settings), 'sec-code')
    assert.equal(resolveAmapWebServiceKey(settings), 'web-key')
  })
})

test('环境变量优先于设置项', () => {
  const settings = { map: { 'amap.key': 'js-key', 'amap.webServiceKey': 'web-key' } }
  withEnv({ AMAP_KEY: 'env-js', AMAP_WEB_SERVICE_KEY: 'env-web' }, () => {
    assert.equal(resolveAmapKey(settings), 'env-js')
    assert.equal(resolveAmapWebServiceKey(settings), 'env-web')
  })
})

test('没有单独的 Web 服务 Key 时退回旧字段，方便老部署继续用', () => {
  const settings = { map: { 'amap.key': 'only-js' } }
  withEnv({ AMAP_WEB_SERVICE_KEY: undefined, AMAP_KEY: undefined }, () => {
    assert.equal(resolveAmapWebServiceKey(settings), 'only-js')
  })
})

test('全都没有时返回空字符串而不是 undefined', () => {
  withEnv({ AMAP_KEY: undefined, AMAP_SECURITY_CODE: undefined, AMAP_WEB_SERVICE_KEY: undefined }, () => {
    assert.equal(resolveAmapKey({}), '')
    assert.equal(resolveAmapSecurityCode(null), '')
    assert.equal(resolveAmapWebServiceKey({ map: {} }), '')
  })
})
