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
    const formUploader = new qiniu.form_up.FormUploader()
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
      const bucketManager = new qiniu.rs.BucketManager(mac)
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

module.exports = { createAdapter, ADAPTER_MAP }
