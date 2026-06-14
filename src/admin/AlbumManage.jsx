import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { getAdminAlbums, createAlbum, deleteAlbum } from '../api/real'
import {
  Plus,
  FolderOpen,
  ImageSquare,
  Trash,
  CaretRight,
  X,
  Warning,
} from '@phosphor-icons/react'

function AlbumCardSkeleton() {
  return (
    <div className="rounded-xl bg-white border border-[#e7e2d8] overflow-hidden animate-pulse">
      <div className="aspect-video bg-[#f0ece4]" />
      <div className="p-4 space-y-2">
        <div className="w-2/3 h-4 rounded bg-[#f0ece4]" />
        <div className="w-1/3 h-3 rounded bg-[#f0ece4]" />
      </div>
    </div>
  )
}

function CreateAlbumModal({ onClose, onCreated }) {
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!formName.trim()) {
      setFormError('请输入相册名称')
      return
    }
    setFormError('')
    setFormLoading(true)
    try {
      const res = await createAlbum(formName.trim(), formDesc.trim())
      if (res.code === 200) {
        onCreated()
      } else {
        setFormError(res.message || '创建失败')
      }
    } catch {
      setFormError('网络错误')
    } finally {
      setFormLoading(false)
    }
  }

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
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white rounded-2xl border border-[#e7e2d8] shadow-[0_8px_32px_rgba(0,0,0,0.1)]"
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#292524]">新建相册</h2>
            <p className="text-[12px] text-[#a8a098] mt-0.5">创建一个新的照片相册</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#a8a098] hover:text-[#292524] hover:bg-[#f7f5f1] transition-all duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-6 pb-6 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="album-name" className="block text-[13px] font-medium text-[#787168]">
              相册名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="album-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="例如：春日纪行"
              className="w-full h-10 bg-[#faf8f5] border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="album-desc" className="block text-[13px] font-medium text-[#787168]">
              描述
            </label>
            <textarea
              id="album-desc"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              placeholder="可选：简短描述这个相册"
              className="w-full bg-[#faf8f5] border border-[#e7e2d8] rounded-lg px-3.5 py-2 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white resize-none"
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-[13px] text-red-600 bg-red-50 rounded-lg px-3.5 py-2.5" role="alert">
              <Warning size={14} className="shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={formLoading}
              className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {formLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  创建中
                </>
              ) : '创建相册'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-lg border border-[#e7e2d8] text-[#a8a098] text-[13px] transition-all duration-150 hover:bg-[#f7f5f1]"
            >
              取消
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

function DeleteConfirmModal({ albumName, onClose, onConfirm }) {
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
        className="w-full max-w-sm bg-white rounded-2xl border border-[#e7e2d8] shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-6"
      >
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <Warning size={20} className="text-red-500" />
        </div>
        <div className="text-center mt-3">
          <h3 className="text-[15px] font-semibold text-[#292524]">确认删除</h3>
          <p className="text-[13px] text-[#787168] mt-1.5">
            确定要删除「{albumName}」吗？<br />
            所有照片也将被删除，此操作不可撤销。
          </p>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={onConfirm}
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg bg-red-500 text-white text-[13px] font-medium transition-all duration-150 hover:bg-red-600 active:scale-[0.98]"
          >
            <Trash size={14} />
            确认删除
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

export default function AlbumManage() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const navigate = useNavigate()

  const fetchAlbums = () => {
    setLoading(true)
    getAdminAlbums()
      .then((res) => { if (res.code === 200) setAlbums(res.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAlbums() }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await deleteAlbum(deleteTarget.id)
    if (res.code === 200) {
      setDeleteTarget(null)
      fetchAlbums()
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-[#292524]">相册管理</h1>
          <p className="text-[13px] text-[#a8a098] mt-1">管理你的所有照片相册</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          新建相册
        </button>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <AlbumCardSkeleton key={i} />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#fef3c7] flex items-center justify-center mx-auto">
            <FolderOpen size={32} className="text-[#d97706]" />
          </div>
          <p className="mt-4 text-[15px] text-[#787168] font-medium">还没有相册</p>
          <p className="text-[13px] text-[#a8a098] mt-1">创建一个相册来开始记录你的旅程</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 h-10 px-6 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c]"
          >
            创建第一个相册
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {albums.map((album, i) => (
            <motion.div
              key={album.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="group rounded-xl bg-white border border-[#e7e2d8] overflow-hidden transition-all duration-200 hover:border-[#d4cdc0] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
            >
              <button
                onClick={() => navigate(`/admin/albums/${album.id}`)}
                className="block w-full text-left"
              >
                <div className="aspect-video bg-[#f0ece4] relative overflow-hidden">
                  {album.cover ? (
                    <>
                      <img
                        src={album.cover}
                        alt={album.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageSquare size={36} className="text-[#c4bdb2]" />
                    </div>
                  )}
                </div>
              </button>

              <div className="p-5">
                <button
                  onClick={() => navigate(`/admin/albums/${album.id}`)}
                  className="text-[14px] font-medium text-[#292524] truncate block w-full text-left hover:text-[#d97706] transition-colors"
                >
                  {album.name}
                </button>
                <div className="flex items-center gap-1 text-[12px] text-[#a8a098] mt-1">
                  <ImageSquare size={12} weight="regular" />
                  {album.photo_count || 0} 张照片
                </div>
                {album.description && (
                  <p className="text-[12px] text-[#c4bdb2] mt-1.5 truncate">{album.description}</p>
                )}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#f0ece4]">
                  <button
                    onClick={() => navigate(`/admin/albums/${album.id}`)}
                    className="flex-1 flex items-center justify-center gap-1 h-9 rounded-lg bg-[#fef3c7] text-[#d97706] text-[13px] font-medium transition-all duration-150 hover:bg-[#fde68a]"
                  >
                    <CaretRight size={13} weight="bold" />
                    管理照片
                  </button>
                  <button
                    onClick={() => setDeleteTarget(album)}
                    className="flex items-center justify-center gap-1 h-9 px-4 rounded-lg text-[#a8a098] text-[13px] transition-all duration-150 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateAlbumModal
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); fetchAlbums() }}
          />
        )}
        {deleteTarget && (
          <DeleteConfirmModal
            albumName={deleteTarget.name}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
