/**
 * 对象存储适配器
 * 统一封装阿里云 OSS、腾讯云 COS、七牛云 Kodo 的上传与连通性测试
 */

/**
 * 阿里云 OSS 适配器
 */
class OssAdapter {
  constructor(config) {
    this.config = config
  }

  async upload(buffer, key) {
    const OSS = require('ali-oss')
    const client = new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      secure: true,
    })
    const result = await client.put(key, buffer)
    return this.config.cdnDomain
      ? `${this.config.cdnDomain.replace(/\/$/, '')}/${result.name}`
      : result.url
  }

  async test() {
    try {
      const OSS = require('ali-oss')
      const client = new OSS({
        region: this.config.region,
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        secure: true,
      })
      // 调用 list 接口验证权限，最多返回 1 条
      await client.list({ 'max-keys': 1 })
      return true
    } catch (err) {
      return false
    }
  }

  async delete(key) {
    const OSS = require('ali-oss')
    const client = new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      secure: true,
    })
    await client.delete(key)
  }
}

/**
 * 腾讯云 COS 适配器
 */
class CosAdapter {
  constructor(config) {
    this.config = config
  }

  async upload(buffer, key) {
    const COS = require('cos-nodejs-sdk-v5')
    const cos = new COS({
      SecretId: this.config.secretId,
      SecretKey: this.config.secretKey,
    })
    return new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
          Body: buffer,
        },
        (err, data) => {
          if (err) return reject(err)
          const url = this.config.cdnDomain
            ? `${this.config.cdnDomain.replace(/\/$/, '')}/${key}`
            : `https://${this.config.bucket}.cos.${this.config.region}.myqcloud.com/${key}`
          resolve(url)
        }
      )
    })
  }

  async test() {
    try {
      const COS = require('cos-nodejs-sdk-v5')
      const cos = new COS({
        SecretId: this.config.secretId,
        SecretKey: this.config.secretKey,
      })
      await new Promise((resolve, reject) => {
        cos.getBucket(
          {
            Bucket: this.config.bucket,
            Region: this.config.region,
            MaxKeys: 1,
          },
          (err, data) => {
            if (err) return reject(err)
            resolve(data)
          }
        )
      })
      return true
    } catch (err) {
      return false
    }
  }

  async delete(key) {
    const COS = require('cos-nodejs-sdk-v5')
    const cos = new COS({
      SecretId: this.config.secretId,
      SecretKey: this.config.secretKey,
    })
    return new Promise((resolve, reject) => {
      cos.deleteObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
        },
        (err, data) => {
          if (err) return reject(err)
          resolve(data)
        }
      )
    })
  }
}

/**
 * 七牛存储区域别名 → SDK 的 Zone 类。
 * 用户填「华东-浙江」「cn-east-1」「z0」都指向同一个区域，这里统一归一化。
 */
const KODO_ZONE_ALIASES = {
  z0: 'Zone_z0',
  cneast1: 'Zone_z0',
  z1: 'Zone_z1',
  cnnorth1: 'Zone_z1',
  z2: 'Zone_z2',
  cnsouth1: 'Zone_z2',
  z2p: 'Zone_cn_east_2',
  cneast2: 'Zone_cn_east_2',
  na0: 'Zone_na0',
  usnorth1: 'Zone_na0',
  as0: 'Zone_as0',
  apsoutheast1: 'Zone_as0',
}

/**
 * 构造七牛 SDK 的 Config。
 *
 * 关键点：显式指定 zone 能让 SDK 跳过「查询存储区域」这一步
 * （见 qiniu/conf.js 的 getRegionsProviderFromZone —— 有 zone 就直接构造 Region，
 * 不再请求 /v4/query）。这既省掉一次网络往返，也规避了一个真实故障：
 * 区域查询失败时，SDK 会抛出它自己回调风格 API 没能接住的 Promise 拒绝，
 * 在 Node 15+ 下会直接终止整个进程 —— 表现为「一次上传失败，服务整体挂掉」。
 *
 * 未填写或无法识别区域时保持默认行为（走区域查询），
 * 此时由 index.js 中的 unhandledRejection 兜底保证进程不退出。
 *
 * @param {object} config - 解密后的七牛配置
 * @returns {object} qiniu.conf.Config 实例
 */
function createKodoConfig(config) {
  const qiniu = require('qiniu')
  const conf = new qiniu.conf.Config()
  const normalized = String(config.region || '').trim().toLowerCase().replace(/[\s_-]/g, '')
  const zoneName = KODO_ZONE_ALIASES[normalized]
  if (zoneName && qiniu.zone[zoneName]) {
    conf.zone = qiniu.zone[zoneName]
  }
  return conf
}

/**
 * 七牛云 Kodo 适配器
 */
class KodoAdapter {
  constructor(config) {
    this.config = config
  }

  async upload(buffer, key) {
    const qiniu = require('qiniu')
    const mac = new qiniu.auth.digest.Mac(this.config.accessKey, this.config.secretKey)
    const options = {
      scope: this.config.bucket,
    }
    const putPolicy = new qiniu.rs.PutPolicy(options)
    const uploadToken = putPolicy.uploadToken(mac)
    const formUploader = new qiniu.form_up.FormUploader(createKodoConfig(this.config))
    const putExtra = new qiniu.form_up.PutExtra()

    return new Promise((resolve, reject) => {
      formUploader.put(uploadToken, key, buffer, putExtra, (err, body, info) => {
        if (err) return reject(err)
        if (info.statusCode !== 200) return reject(new Error(body?.error || '上传失败'))
        const url = this.config.cdnDomain
          ? `${this.config.cdnDomain.replace(/\/$/, '')}/${body.key}`
          : `https://${this.config.bucket}.${this.config.region || 's3'}.qiniucs.com/${body.key}`
        resolve(url)
      })
    })
  }

  async test() {
    try {
      const qiniu = require('qiniu')
      const mac = new qiniu.auth.digest.Mac(this.config.accessKey, this.config.secretKey)
      const bucketManager = new qiniu.rs.BucketManager(mac, createKodoConfig(this.config))
      await new Promise((resolve, reject) => {
        bucketManager.listPrefix(
          this.config.bucket,
          { limit: 1 },
          (err, respBody, respInfo) => {
            if (err) return reject(err)
            if (respInfo.statusCode !== 200) return reject(new Error(respBody?.error || '测试失败'))
            resolve(respBody)
          }
        )
      })
      return true
    } catch (err) {
      return false
    }
  }

  async delete(key) {
    const qiniu = require('qiniu')
    const mac = new qiniu.auth.digest.Mac(this.config.accessKey, this.config.secretKey)
    const bucketManager = new qiniu.rs.BucketManager(mac, createKodoConfig(this.config))
    return new Promise((resolve, reject) => {
      bucketManager.delete(this.config.bucket, key, (err, respBody, respInfo) => {
        if (err) return reject(err)
        // 612 表示文件不存在，视为删除成功（幂等）
        if (respInfo.statusCode !== 200 && respInfo.statusCode !== 612) {
          return reject(new Error(respBody?.error || '删除失败'))
        }
        resolve(respBody)
      })
    })
  }
}

const ADAPTER_MAP = {
  oss: OssAdapter,
  cos: CosAdapter,
  kodo: KodoAdapter,
}

/**
 * 根据提供者名称创建适配器实例
 * @param {string} provider - 提供者标识：oss / cos / kodo
 * @param {object} config - 解密后的配置
 * @returns {object} 适配器实例
 */
function createAdapter(provider, config) {
  const AdapterClass = ADAPTER_MAP[provider]
  if (!AdapterClass) {
    throw new Error(`不支持的存储提供者：${provider}`)
  }
  return new AdapterClass(config)
}

module.exports = { createAdapter, ADAPTER_MAP, createKodoConfig }
