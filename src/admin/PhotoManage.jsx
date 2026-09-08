import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { getAdminAlbum, getAdminPhotos, uploadPhotos, deletePhoto, deletePhotos, updatePhoto, reorderPhotos } from '../api/real'
import { validateUploadFiles } from '../utils/upload'
import Lightbox from '../components/Lightbox'
import {
  ArrowLeft,
  UploadSimple,
  Trash,
  FileImage,
  Plus,
  Warning,
  PencilSimple,
  X,
  CheckCircle,
  CheckSquare,
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
          <h3 className="text-[15px] font-semibold text-[#292524]">移入回收站</h3>
          <p className="text-[13px] text-[#787168] mt-1.5">
            照片会先移入回收站，可在那里恢复；彻底删除后才会清除文件。
          </p>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={onConfirm}
            className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg bg-red-500 text-white text-[13px] font-medium transition-all duration-150 hover:bg-red-600 active:scale-[0.98]"
          >
            <Trash size={14} />
            移入回收站
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

function EditPhotoModal({ photo, onClose, onSaved }) {
  const [title, setTitle] = useState(photo.title || '')
  const [description, setDescription] = useState(photo.description || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleSave = async () => {
    if (!title.trim()) {
      setErr('标题不能为空')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const res = await updatePhoto(photo.id, { title: title.trim(), description: description.trim() })
      if (res.code === 200) onSaved(res.data)
    } catch (e) {
      setErr(e?.message || '保存失败')
    } finally {
      setSaving(false)
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white rounded-2xl border border-[#e7e2d8] p-6"
      >
        <h3 className="text-[15px] font-semibold text-[#292524]">编辑照片信息</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[#787168]">标题</label>
            <input
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-10 bg-[#faf8f5] border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#292524] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[#787168]">描述</label>
            <textarea
              value={description}
              maxLength={500}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="写点什么，会在大图预览中显示"
              className="w-full bg-[#faf8f5] border border-[#e7e2d8] rounded-lg px-3.5 py-2.5 text-[14px] text-[#292524] resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50"
            />
          </div>
          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c] disabled:opacity-40"
          >
            {saving ? '保存中' : '保存'}
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

export default function PhotoManage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [album, setAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [error, setError] = useState('')
  // 批量选择删除：选中照片 id 集合；为空表示未进入批量模式
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [batchDeleteTarget, setBatchDeleteTarget] = useState(null)
  // 手动排序拖拽（与文件上传的 dragOver 区分开）
  const [sortDragIndex, setSortDragIndex] = useState(null)
  const [sortOverIndex, setSortOverIndex] = useState(null)
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
    const err = validateUploadFiles(files)
    if (err) {
      setError(err)
      return
    }
    setError('')
    setUploading(true)
    try {
      const res = await uploadPhotos(Number(id), files)
      if (res.code === 200) fetchData()
    } catch (e) {
      setError(e?.message || '上传失败，请稍后重试')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await deletePhoto(deleteTarget.id)
      if (res.code === 200) {
        setPhotos((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      } else {
        setError(res?.message || '删除失败')
      }
    } catch (e) {
      setError(e?.message || '删除失败，请稍后重试')
    } finally {
      setDeleteTarget(null)
    }
  }

  // 切换勾选状态
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === photos.length) setSelectedIds([])
    else setSelectedIds(photos.map((p) => p.id))
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds([])
    setBatchDeleteTarget(null)
  }

  const handleBatchDelete = async () => {
    const ids = batchDeleteTarget?.ids || selectedIds
    if (ids.length === 0) return
    try {
      const res = await deletePhotos(ids)
      if (res.code === 200) {
        setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)))
        setError('')
        exitSelectMode()
      } else {
        setError(res?.message || '删除失败')
        setBatchDeleteTarget(null)
      }
    } catch (e) {
      setError(e?.message || '删除失败，请稍后重试')
      setBatchDeleteTarget(null)
    }
  }

  const handleSaved = (updated) => {
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setPreviewPhoto(null)
    setEditTarget(null)
  }

  // 拖拽排序：先本地乐观更新，再落库；失败则回滚到拖拽前的顺序
  const handleSortDrop = async (targetIndex) => {
    const from = sortDragIndex
    setSortDragIndex(null)
    setSortOverIndex(null)
    if (from === null || from === targetIndex) return

    const previous = photos
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(targetIndex, 0, moved)
    setPhotos(next)

    try {
      const res = await reorderPhotos(Number(id), next.map((p) => p.id))
      if (res.code === 200 && res.data) setPhotos(res.data)
    } catch (e) {
      setPhotos(previous)
      setError(e?.message || '排序保存失败，请稍后重试')
    }
  }

  const currentIndex = previewPhoto ? photos.findIndex((p) => p.id === previewPhoto.id) : -1

  return (
    <div className="p-6 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between gap-3 mb-6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/admin/albums')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#a8a098] hover:text-[#292524] hover:bg-white/80 transition-all duration-150 shrink-0"
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
        </div>
        {photos.length > 0 && (
          !selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[#e7e2d8] text-[#787168] text-[13px] transition-all duration-150 hover:bg-[#f7f5f1] shrink-0"
            >
              <Trash size={14} />
              批量删除
            </button>
          ) : (
            <button
              onClick={exitSelectMode}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[#e7e2d8] text-[#787168] text-[13px] transition-all duration-150 hover:bg-[#f7f5f1] shrink-0"
            >
              <X size={14} />
              取消
            </button>
          )
        )}
      </motion.div>

      {/* 批量选择工具条：进入选择模式时出现 */}
      {selectMode && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-3 rounded-xl bg-[#fef3c7] border border-[#fde68a] px-4 py-2.5"
        >
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-[13px] text-[#292524] hover:text-[#d97706] transition-colors"
          >
            {selectedIds.length === photos.length ? (
              <><CheckCircle size={15} />取消全选</>
            ) : (
              <><CheckSquare size={15} />全选</>
            )}
          </button>
          <span className="text-[13px] text-[#787168] flex-1 truncate">
            已选 {selectedIds.length} / {photos.length} 张
          </span>
          <button
            onClick={() => selectedIds.length > 0 && setBatchDeleteTarget({ ids: [...selectedIds] })}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-red-500 text-white text-[13px] font-medium transition-all duration-150 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash size={13} />
            删除所选
          </button>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
          role="alert"
        >
          <Warning size={16} className="shrink-0 text-red-500" />
          <span className="text-[13px] text-red-600">{error}</span>
        </motion.div>
      )}

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
              <p className="text-[11px] text-[#a8a098]">支持 JPG / PNG / GIF / WebP / BMP / AVIF，单张最大 20MB</p>
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
              draggable={!selectMode}
              onDragStart={(e) => {
                if (selectMode) return
                setSortDragIndex(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (selectMode) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (sortOverIndex !== i) setSortOverIndex(i)
              }}
              onDragLeave={() => { if (sortOverIndex === i) setSortOverIndex(null) }}
              onDrop={(e) => {
                if (selectMode) return
                e.preventDefault(); handleSortDrop(i)
              }}
              onDragEnd={() => { setSortDragIndex(null); setSortOverIndex(null) }}
              title={selectMode ? '点击选择照片' : '拖拽可调整顺序'}
              className={`group relative aspect-square rounded-lg bg-white border overflow-hidden transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] ${
                selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
              } ${
                sortDragIndex === i ? 'opacity-40' : ''
              } ${
                selectedIds.includes(photo.id)
                  ? 'border-[#d97706] ring-2 ring-[#d97706]/50'
                  : sortOverIndex === i && sortDragIndex !== i
                    ? 'border-[#d97706] ring-2 ring-[#d97706]/30'
                    : 'border-[#e7e2d8] hover:border-[#d4cdc0]'
              }`}
            >
              <button
                onClick={() => selectMode ? toggleSelect(photo.id) : setPreviewPhoto(photo)}
                className="w-full h-full"
              >
                <img
                  src={photo.thumb || photo.url}
                  alt={photo.title}
                  draggable={false}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-200 opacity-0 group-hover:opacity-100">
                  <p className="text-white text-[11px] truncate drop-shadow-sm">{photo.title}</p>
                </div>
              </button>
              {/* 左上角勾选角标：选择模式时显示 */}
              {selectMode && (
                <button
                  onClick={() => toggleSelect(photo.id)}
                  className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-md bg-white/90 shadow-sm transition-all duration-150 hover:bg-white"
                  aria-label={selectedIds.includes(photo.id) ? '取消选择' : '选择照片'}
                >
                  {selectedIds.includes(photo.id) ? (
                    <CheckCircle size={17} weight="fill" className="text-[#d97706]" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-sm border-[1.5px] border-[#c4bdb2]" />
                  )}
                </button>
              )}
              {/* 编辑/删除按钮：选择模式下隐藏 */}
              {!selectMode && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => setEditTarget(photo)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-[#a8a098] hover:bg-[#292524] hover:text-white transition-all duration-200"
                    aria-label="编辑照片信息"
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(photo)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 text-[#a8a098] hover:bg-red-500 hover:text-white transition-all duration-200"
                    aria-label="删除照片"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {batchDeleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setBatchDeleteTarget(null) }}
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
                <h3 className="text-[15px] font-semibold text-[#292524]">批量移入回收站</h3>
                <p className="text-[13px] text-[#787168] mt-1.5">
                  将 {batchDeleteTarget.ids.length} 张照片移入回收站？可在回收站中恢复。
                </p>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleBatchDelete}
                  className="flex-1 h-10 flex items-center justify-center gap-2 rounded-lg bg-red-500 text-white text-[13px] font-medium transition-all duration-150 hover:bg-red-600 active:scale-[0.98]"
                >
                  <Trash size={14} />
                  确认删除
                </button>
                <button
                  onClick={() => setBatchDeleteTarget(null)}
                  className="flex-1 h-10 rounded-lg border border-[#e7e2d8] text-[#787168] text-[13px] font-medium transition-all duration-150 hover:bg-[#f7f5f1]"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {deleteTarget && (
          <DeleteConfirmModal
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
        {editTarget && (
          <EditPhotoModal
            photo={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={handleSaved}
          />
        )}
        {previewPhoto && (
          <Lightbox
            photo={{
              ...previewPhoto,
              url: previewPhoto.original_url || previewPhoto.url,
              create_time: new Date(previewPhoto.create_time).toLocaleDateString('zh-CN', {
                year: 'numeric', month: 'long', day: 'numeric',
              }),
            }}
            currentIndex={currentIndex}
            totalCount={photos.length}
            onClose={() => setPreviewPhoto(null)}
            onPrev={() => currentIndex > 0 && setPreviewPhoto(photos[currentIndex - 1])}
            onNext={() => currentIndex < photos.length - 1 && setPreviewPhoto(photos[currentIndex + 1])}
            isLoading={false}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
