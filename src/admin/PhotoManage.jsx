import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { getAdminAlbum, getAdminPhotos, uploadPhotos, deletePhoto } from '../api/real'
import {
  ArrowLeft,
  UploadSimple,
  Trash,
  FileImage,
  Plus,
  X,
  Warning,
} from '@phosphor-icons/react'

function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="aspect-square rounded-lg bg-white border border-[#e7e2d8] animate-pulse" />
      ))}
    </div>
  )
}

function DeleteConfirmModal({ onClose, onConfirm }) {
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
          <p className="text-[13px] text-[#787168] mt-1.5">确定要删除这张照片吗？此操作不可撤销。</p>
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

function Lightbox({ photo, onClose, onPrev, onNext }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev?.()
      if (e.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
      >
        <X size={20} />
      </button>

      {onPrev && (
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {onNext && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <motion.img
        key={photo.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        src={photo.url}
        alt={photo.title}
        className="max-w-full max-h-[85vh] object-contain rounded-lg"
      />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-[13px]">
        {photo.title}
      </div>
    </motion.div>
  )
}

export default function PhotoManage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [album, setAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const fileRef = useRef(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [albumRes, photoRes] = await Promise.all([
        getAdminAlbum(Number(id)),
        getAdminPhotos(Number(id)),
      ])
      if (albumRes.code === 200) setAlbum(albumRes.data)
      if (photoRes.code === 200) setPhotos(photoRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [id])

  const handleFiles = async (files) => {
    if (files.length === 0) return
    setUploading(true)
    try {
      const res = await uploadPhotos(Number(id), files)
      if (res.code === 200) fetchData()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await deletePhoto(deleteTarget.id)
    if (res.code === 200) {
      setPhotos((prev) => prev.filter((p) => p.id !== deleteTarget.id))
    }
    setDeleteTarget(null)
  }

  const currentIndex = previewPhoto ? photos.findIndex((p) => p.id === previewPhoto.id) : -1

  return (
    <div className="p-6 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <button
          onClick={() => navigate('/admin/albums')}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[#a8a098] hover:text-[#292524] hover:bg-white/80 transition-all duration-150"
          aria-label="返回相册列表"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight text-[#292524] truncate">
            {album?.name || '相册'}
          </h1>
          {!loading && (
            <p className="text-[12px] text-[#a8a098] mt-0.5">{photos.length} 张照片</p>
          )}
        </div>
      </motion.div>

      <div className="rounded-xl bg-white border border-[#e7e2d8] p-5 mb-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/')))
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all duration-150 ${
            dragOver
              ? 'border-[#d97706] bg-[#fef3c7]/20'
              : uploading
                ? 'border-[#c4bdb2] bg-[#faf8f5]'
                : 'border-[#e7e2d8] hover:border-[#c4bdb2] hover:bg-[#faf8f5]'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
            className="hidden"
          />
          {uploading ? (
            <div className="space-y-3">
              <svg className="animate-spin w-8 h-8 mx-auto text-[#d97706]" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <p className="text-[14px] text-[#787168] font-medium">正在上传照片...</p>
              <div className="max-w-xs mx-auto h-1.5 rounded-full bg-[#f0ece4] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#fef3c7] to-[#d97706]"
                  animate={{ width: ['0%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <UploadSimple size={28} className="mx-auto text-[#c4bdb2]" />
              <p className="text-[14px] text-[#787168] font-medium">
                拖拽照片到此处，或<span className="text-[#d97706] underline underline-offset-2">点击选择</span>
              </p>
              <p className="text-[11px] text-[#a8a098]">支持 JPG / PNG / GIF / WebP，单张最大 20MB</p>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <PhotoGridSkeleton />
      ) : photos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#f0ece4] flex items-center justify-center mx-auto">
            <FileImage size={32} className="text-[#c4bdb2]" />
          </div>
          <p className="mt-4 text-[15px] text-[#787168] font-medium">暂无照片</p>
          <p className="text-[13px] text-[#a8a098] mt-1">上传第一张照片来填充这个相册</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-5 h-10 px-6 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c]"
          >
            <span className="flex items-center gap-1.5">
              <Plus size={14} weight="bold" />
              上传照片
            </span>
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        >
          {photos.map((photo, i) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className="group relative aspect-square rounded-lg bg-white border border-[#e7e2d8] overflow-hidden transition-all duration-200 hover:border-[#d4cdc0] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
            >
              <button
                onClick={() => setPreviewPhoto(photo)}
                className="w-full h-full"
              >
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-200 opacity-0 group-hover:opacity-100">
                  <p className="text-white text-[11px] truncate drop-shadow-sm">{photo.title}</p>
                </div>
              </button>
              <button
                onClick={() => setDeleteTarget(photo)}
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-[#a8a098] hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200"
                aria-label="删除照片"
              >
                <Trash size={13} />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
        {previewPhoto && (
          <Lightbox
            photo={previewPhoto}
            onClose={() => setPreviewPhoto(null)}
            onPrev={currentIndex > 0 ? () => setPreviewPhoto(photos[currentIndex - 1]) : null}
            onNext={currentIndex < photos.length - 1 ? () => setPreviewPhoto(photos[currentIndex + 1]) : null}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
