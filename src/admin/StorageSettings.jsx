import { useState, useEffect } from 'react'
import { getStorageSettings, getStorageProviderSchema, updateStorageSettings, testStorageProvider } from '../api/real'
import { FloppyDisk, TestTube, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'

const PROVIDER_ORDER = ['local', 'oss', 'cos', 'kodo']
const PROVIDER_LABELS = {
  local: '本地存储',
  oss: '阿里云 OSS',
  cos: '腾讯云 COS',
  kodo: '七牛云 Kodo',
}

export default function StorageSettings() {
  const [settings, setSettings] = useState(null)
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState(null)
  const [editingProvider, setEditingProvider] = useState('local')



  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [settingsRes, schemaRes] = await Promise.all([
        getStorageSettings(),
        getStorageProviderSchema(),
      ])
      if (settingsRes.code === 200) {
        setSettings(settingsRes.data)
        setEditingProvider(settingsRes.data.activeProvider || 'local')
      }
      if (schemaRes.code === 200) {
        setSchema(schemaRes.data)
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || '加载失败' })
    } finally {
      setLoading(false)
    }
  }

  function handleProviderChange(provider, field, value) {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...(prev.providers?.[provider] || {}),
          [field]: value,
        },
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await updateStorageSettings({
        activeProvider: editingProvider,
        providers: settings.providers,
      })
      if (res.code === 200) {
        setMessage({ type: 'success', text: '保存成功' })
        setSettings(res.data)
      } else {
        setMessage({ type: 'error', text: res.message || '保存失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(provider) {
    setTesting(true)
    setMessage(null)
    try {
      const config = settings.providers?.[provider] || {}
      const res = await testStorageProvider(provider, config)
      if (res.code === 200) {
        setMessage({ type: 'success', text: `${PROVIDER_LABELS[provider]} 连通性测试通过` })
      } else {
        setMessage({ type: 'error', text: res.message || '测试失败' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1a1a1a]/10 border-t-[#1a1a1a] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-normal text-[#292524]" style={{ fontFamily: "'Instrument Serif', serif" }}>对象存储配置</h1>
        <p className="text-sm text-[#787168] mt-1">配置后新上传的图片将保存到指定存储，已有图片保留在原位置</p>
      </div>

      {/* 当前启用存储：仅展示 */}
      <div className="bg-white rounded-2xl border border-[#e7e2d8] p-6 mb-6 shadow-sm">
        <label className="block text-sm font-medium text-[#292524] mb-3">当前启用的存储</label>
        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-[#f7f5f1] border border-[#e7e2d8] text-sm text-[#292524]">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {PROVIDER_LABELS[settings.activeProvider]}
        </div>
        {settings.activeProvider === 'local' ? (
          <p className="text-xs text-[#787168] mt-2">当前使用本地磁盘存储，图片保存在 server/uploads 目录</p>
        ) : (
          <p className="text-xs text-[#787168] mt-2">当前启用 {PROVIDER_LABELS[settings.activeProvider]}，新上传图片将保存到云端</p>
        )}
      </div>

      {/* 配置编辑区 */}
      <div className="bg-white rounded-2xl border border-[#e7e2d8] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-medium text-[#292524]">修改配置</h2>
        </div>

        <div className="mb-5">
          <label className="block text-sm text-[#292524] mb-1.5">要启用的存储</label>
          <select
            value={editingProvider}
            onChange={(e) => setEditingProvider(e.target.value)}
            className="w-full sm:w-64 h-10 px-3 rounded-xl border border-[#e7e2d8] bg-white text-sm text-[#292524] focus:outline-none focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706]"
          >
            {PROVIDER_ORDER.map(p => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {editingProvider === 'local' ? (
          <div className="text-center py-12 text-[#787168]">
            <p>选择本地存储后，保存即可切换回本地磁盘</p>
          </div>
        ) : schema?.[editingProvider] ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-[#292524]">{schema[editingProvider].name}</h3>
              <button
                onClick={() => handleTest(editingProvider)}
                disabled={testing}
                className="flex items-center gap-2 px-4 h-9 rounded-lg border border-[#e7e2d8] text-[#292524] text-sm hover:bg-[#f7f5f1] disabled:opacity-50 transition-colors"
              >
                <TestTube size={16} />
                {testing ? '测试中...' : '测试连通性'}
              </button>
            </div>

            {schema[editingProvider].fields.map(field => (
              <div key={field.key}>
                <label className="block text-sm text-[#292524] mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={settings.providers?.[editingProvider]?.[field.key] || ''}
                  placeholder={field.placeholder}
                  onChange={(e) => handleProviderChange(editingProvider, field.key, e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#e7e2d8] bg-[#f7f5f1] text-sm text-[#292524] placeholder:text-[#a8a098] focus:outline-none focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706]"
                />
                {field.type === 'password' && settings.providers?.[editingProvider]?.[field.key] === '' && (
                  <p className="text-xs text-[#a8a098] mt-1">留空表示保留已保存的密钥</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[#787168]">加载中...</div>
        )}
      </div>

      {/* 保存按钮 */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 h-11 rounded-xl bg-[#292524] text-white text-sm font-medium hover:bg-[#1a1a1a] disabled:opacity-50 transition-colors"
        >
          <FloppyDisk size={18} />
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      {/* 提示弹窗 */}
      {message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-[90%] text-center">
            <div className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${
              message.type === 'success'
                ? 'bg-green-100 text-green-600'
                : message.type === 'warning'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-red-100 text-red-600'
            }`}>
              {message.type === 'success' ? <CheckCircle size={28} /> : message.type === 'warning' ? <Warning size={28} /> : <XCircle size={28} />}
            </div>
            <h3 className="text-lg font-medium text-[#292524] mb-2">
              {message.type === 'success' ? '保存成功' : message.type === 'warning' ? '注意' : '保存失败'}
            </h3>
            <p className="text-sm text-[#787168] mb-6">{message.text}</p>
            <button
              onClick={() => setMessage(null)}
              className="w-full h-11 rounded-xl bg-[#292524] text-white text-sm font-medium hover:bg-[#1a1a1a] transition-colors"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
