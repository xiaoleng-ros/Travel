import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { getDeletedPhotos, restorePhoto, purgePhoto } from '../api/real'
import {
  Trash,
  ArrowCounterClockwise,
  Warning,
  X,
} from '@phosphor-icons/react'

function ConfirmModal({ title, desc, confirmText, danger, onClose, onConfirm }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm bg-white rounded-2xl border border-[#e7e2d8] p-6"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${danger ? 'bg-red-50' : 'bg-[#fef3c7]'}`}>
          <Warning size={20} className={danger ? 'text-red-500' : 'text-[#d97706]'} />
        </div>
        <div className="text-center mt-3">
          <h3 className="text-[15px] font-semibold text-[#292524]">{title}</h3>
          <p className="text-[13px] text-[#787168] mt-1.5">{desc}</p>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={onConfirm}
            className={`flex-1 h-10 flex items-center justify-center gap-2 rounded-lg text-white text-[13px] font-medium transition-all duration-150 active:scale-[0.98] ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#292524] hover:bg-[#44403c]'
            }`}
          >
            {confirmText}
          </button>
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-[#e7e2d8] text-[#787168] text-[13px] font-medium transition-all duration-150 hover:bg-[#f7f5f1]"
          >
            取消
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function RecycleBin() {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [target, setTarget] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDeletedPhotos()
      if (res.code === 200) setPhotos(res.data || [])
    } catch (err) {
      console.error(err)
      setError(err?.message || '加载回收站失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRestore = async () => {
    if (!target) return
    try {
      await restorePhoto(target.id)
      setPhotos(prev => prev.filter(p => p.id !== target.id))
    } catch (e) {
      setError(e?.message || '恢复失败')
    } finally {
      setTarget(null)
    }
  }

  const handlePurge = async () => {
    if (!target) return
    try {
      await purgePhoto(target.id)
      setPhotos(prev => prev.filter(p => p.id !== target.id))
    } catch (e) {
      setError(e?.message || '删除失败')
    } finally {
      setTarget(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="mb-6"
      >
        <h1 className="text-[20px] font-semibold tracking-tight text-[#292524]">回收站</h1>
        <p className="text-[12px] text-[#a8a098] mt-0.5">
          删除的照片会先放在这里，可以恢复；彻底删除后物理文件才会被清除
        </p>
      </motion.div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5" role="alert">
          <Warning size={16} className="shrink-0 text-red-500" />
          <span className="text-[13px] text-red-600 flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="关闭提示">
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-white border border-[#e7e2d8] animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-[#f0ece4] flex items-center justify-center mx-auto">
            <Trash size={32} className="text-[#c4bdb2]" />
          </div>
          <p className="mt-4 text-[15px] text-[#787168] font-medium">回收站是空的</p>
          <p className="text-[13px] text-[#a8a098] mt-1">删除的照片会先保留在这里</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photos.map((photo, i) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="group relative rounded-lg bg-white border border-[#e7e2d8] overflow-hidden"
            >
              <div className="aspect-square">
                <img
                  src={photo.thumb || photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover opacity-60"
                  loading="lazy"
                />
              </div>
              <div className="p-2.5 border-t border-[#f0ece4]">
                <p className="text-[12px] text-[#292524] truncate">{photo.title}</p>
                <p className="text-[11px] text-[#a8a098] mt-0.5">
                  {new Date(photo.deleted_at).toLocaleString('zh-CN')}
                </p>
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => setTarget({ ...photo, action: 'restore' })}
                    className="flex-1 h-7 flex items-center justify-center gap-1 rounded-md border border-[#e7e2d8] text-[11px] text-[#787168] hover:bg-[#f7f5f1] transition-colors"
                  >
                    <ArrowCounterClockwise size={12} />
                    恢复
                  </button>
                  <button
                    onClick={() => setTarget({ ...photo, action: 'purge' })}
                    className="flex-1 h-7 flex items-center justify-center gap-1 rounded-md border border-[#e7e2d8] text-[11px] text-[#787168] hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash size={12} />
                    彻底删除
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {target && (
          <ConfirmModal
            title={target.action === 'restore' ? '恢复照片' : '彻底删除'}
            desc={
              target.action === 'restore'
                ? '照片会重新出现在所属相册中。'
                : '照片与其物理文件都会被永久清除，无法恢复。'
            }
            confirmText={target.action === 'restore' ? '确认恢复' : '永久删除'}
            danger={target.action === 'purge'}
            onClose={() => setTarget(null)}
            onConfirm={target.action === 'restore' ? handleRestore : handlePurge}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
