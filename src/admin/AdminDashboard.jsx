import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { getAdminAlbums, getRecentPhotos, uploadPhotos } from '../api/real'
import {
  FolderOpen,
  ImageSquare,
  ClockCounterClockwise,
  CalendarBlank,
  Camera,
  UploadSimple,
  X,
  Images,
} from '@phosphor-icons/react'

/* ========== 统计卡片 ========== */
function StatCard({ icon: Icon, label, value, sub, bgClass, iconClass }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white border border-[#e7e2d8] p-6 transition-all duration-200 hover:border-[#d4cdc0] hover:shadow-[0_4px_24px_rgba(0,0,0,0.05)]"
    >
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
          <Icon size={20} weight="bold" className={iconClass} />
        </div>
        <div className="min-w-0">
          <div className="font-num text-[26px] font-normal tracking-tight text-[#292524] leading-none">{value}</div>
          <div className="text-[12px] text-[#a8a098] mt-2">{label}</div>
        </div>
      </div>
      {sub && (
        <div className="text-[11px] text-[#c4bdb2] mt-4 pt-3 border-t border-[#f0ece4]">
          {sub}
        </div>
      )}
    </motion.div>
  )
}

/* ========== 照片缩略图 ========== */
function PhotoThumb({ photo, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square rounded-xl overflow-hidden bg-[#f0ece4] border border-[#e7e2d8] transition-all duration-200 hover:border-[#d4cdc0] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <img
        src={photo.url}
        alt={photo.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </button>
  )
}

/* ========== 相册分布条 ========== */
function AlbumDistBar({ album, maxCount, onClick }) {
  const ratio = maxCount > 0 ? (album.photo_count / maxCount) * 100 : 0
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full group py-2.5"
    >
      <span className="text-[13px] text-[#292524] w-20 truncate text-right shrink-0 group-hover:text-[#d97706] transition-colors">
        {album.name}
      </span>
      <div className="flex-1 h-5 rounded-full bg-[#f0ece4] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(ratio, 4)}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-[#fef3c7] to-[#fde68a]"
        />
      </div>
      <span className="font-num text-[12px] text-[#a8a098] w-6 text-left shrink-0">{album.photo_count}</span>
    </button>
  )
}

/* ========== 时间线条目 ========== */
function TimelineItem({ icon: Icon, bgClass, iconClass, title, time, desc }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${bgClass}`}>
          <Icon size={14} weight="bold" className={iconClass} />
        </div>
        <div className="w-px flex-1 bg-[#e7e2d8] mt-2" />
      </div>
      <div className="pb-7 min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[#292524] leading-snug break-words">{title}</div>
        <div className="text-[12px] text-[#a8a098] mt-1">{time}</div>
        {desc && <div className="text-[12px] text-[#c4bdb2] mt-0.5">{desc}</div>}
      </div>
    </div>
  )
}

/* ========== 上传弹窗 ========== */
function UploadModal({ albums, onClose }) {
  const [uploadAlbumId, setUploadAlbumId] = useState('')
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const handleQuickUpload = async () => {
    if (!uploadAlbumId || uploadFiles.length === 0) return
    setUploading(true)
    try {
      await uploadPhotos(Number(uploadAlbumId), uploadFiles)
      onClose(true)
    } finally {
      setUploading(false)
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
        className="w-full max-w-lg bg-white rounded-2xl border border-[#e7e2d8] shadow-[0_8px_32px_rgba(0,0,0,0.1)]"
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#292524]">快速上传</h2>
            <p className="text-[12px] text-[#a8a098] mt-0.5">选择相册和照片后一键上传</p>
          </div>
          <button
            onClick={() => onClose()}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#a8a098] hover:text-[#292524] hover:bg-[#f7f5f1] transition-all duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 space-y-5 pb-6">
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[#787168]">选择相册</label>
            <select
              value={uploadAlbumId}
              onChange={(e) => setUploadAlbumId(e.target.value)}
              className="w-full h-10 bg-[#faf8f5] border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#292524] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50"
            >
              <option value="">选择相册...</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[#787168]">选择照片</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                setUploadFiles(Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/')))
              }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all duration-150 ${
                dragOver
                  ? 'border-[#d97706] bg-[#fef3c7]/30'
                  : 'border-[#e7e2d8] hover:border-[#c4bdb2] hover:bg-[#faf8f5]'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                className="hidden"
              />
              {uploadFiles.length > 0 ? (
                <div className="space-y-2">
                  <Images size={28} className="mx-auto text-[#d97706]" />
                  <p className="text-[13px] text-[#292524] font-medium">已选 {uploadFiles.length} 张照片</p>
                  <p className="text-[11px] text-[#a8a098]">点击或拖拽以更改</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <UploadSimple size={28} className="mx-auto text-[#c4bdb2]" />
                  <p className="text-[13px] text-[#787168] font-medium">拖拽照片到这里，或点击选择</p>
                  <p className="text-[11px] text-[#a8a098]">支持 JPG / PNG / GIF / WebP</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleQuickUpload}
            disabled={!uploadAlbumId || uploadFiles.length === 0 || uploading}
            className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                上传中
              </>
            ) : (
              <>
                <UploadSimple size={15} weight="bold" />
                上传
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ========== 区块卡片容器 ========== */
function SectionCard({ title, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white border border-[#e7e2d8] p-7 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[16px] font-normal text-[#292524]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

/* ========== 主页面 ========== */
export default function AdminDashboard() {
  const [albums, setAlbums] = useState([])
  const [recentPhotos, setRecentPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      getAdminAlbums(),
      getRecentPhotos(6),
    ]).then(([albumRes, photoRes]) => {
      if (albumRes.code === 200) setAlbums(albumRes.data)
      if (photoRes.code === 200) setRecentPhotos(photoRes.data)
    }).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const totalPhotos = albums.reduce((sum, a) => sum + (a.photo_count || 0), 0)
  const recentAlbums = [...albums]
    .sort((a, b) => new Date(b.create_time) - new Date(a.create_time))
  const oldestAlbum = albums.length > 0
    ? albums.reduce((oldest, a) =>
        new Date(a.create_time) < new Date(oldest.create_time) ? a : oldest
      )
    : null
  const maxPhotoCount = Math.max(...albums.map(a => a.photo_count || 0), 1)
  const sortedAlbums = [...albums].sort((a, b) => (b.photo_count || 0) - (a.photo_count || 0))

  const timeline = [
    ...albums.map(a => ({
      type: 'album',
      title: `创建相册「${a.name}」`,
      time: new Date(a.create_time).toLocaleString('zh-CN'),
      icon: FolderOpen,
      bgClass: 'bg-[#fef3c7]',
      iconClass: 'text-[#d97706]',
    })),
    ...recentPhotos.map(p => ({
      type: 'photo',
      title: `上传照片「${p.title}」`,
      time: new Date(p.create_time).toLocaleString('zh-CN'),
      desc: p.album_id ? `至相册 #${p.album_id}` : '',
      icon: Camera,
      bgClass: 'bg-[#e0f2fe]',
      iconClass: 'text-[#0284c7]',
    })),
  ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 8)

  return (
    <div className="p-10 max-w-7xl mx-auto">
      {/* 顶部标题栏 */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center justify-between mb-12"
      >
        <div>
          <h1 className="text-[24px] font-normal tracking-tight text-[#292524]">概览</h1>
          <p className="text-[13px] text-[#a8a098] mt-2">欢迎回来，这里是你的照片回忆录总览</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-[#292524] text-white text-[13px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98]"
        >
          <UploadSimple size={15} weight="bold" />
          快速上传
        </button>
      </motion.div>

      {/* 第一行：统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-10">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#e7e2d8] p-6 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#f0ece4]" />
                <div className="space-y-2 flex-1">
                  <div className="w-14 h-7 rounded bg-[#f0ece4]" />
                  <div className="w-16 h-2.5 rounded bg-[#f0ece4]" />
                </div>
              </div>
            </div>
          ))
        ) : (
          <>
            <StatCard
              icon={FolderOpen}
              label="相册总数"
              value={albums.length}
              sub={albums.length > 0 ? `共收录 ${totalPhotos} 张照片` : '暂无内容'}
              bgClass="bg-[#fef3c7]"
              iconClass="text-[#d97706]"
            />
            <StatCard
              icon={ImageSquare}
              label="照片总数"
              value={totalPhotos}
              sub={albums.length > 0 ? `平均每册 ${(totalPhotos / albums.length).toFixed(1)} 张` : '暂无内容'}
              bgClass="bg-[#e0f2fe]"
              iconClass="text-[#0284c7]"
            />
            <StatCard
              icon={ClockCounterClockwise}
              label="最近更新"
              value={
                albums.length > 0
                  ? new Date(recentAlbums[0].create_time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                  : '无数据'
              }
              sub={recentAlbums.length > 0 ? recentAlbums[0].name : ''}
              bgClass="bg-[#f0fdf4]"
              iconClass="text-[#16a34a]"
            />
            <StatCard
              icon={CalendarBlank}
              label="最早相册"
              value={
                oldestAlbum
                  ? new Date(oldestAlbum.create_time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                  : '无数据'
              }
              sub={oldestAlbum ? oldestAlbum.name : ''}
              bgClass="bg-[#faf5ff]"
              iconClass="text-[#9333ea]"
            />
          </>
        )}
      </div>

      {/* 第二行：最近照片 + 相册分布（左右分栏） */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-10">
        <SectionCard
          title="最近照片"
          className="lg:col-span-3"
          action={
            <button
              onClick={() => navigate('/admin/albums')}
              className="text-[12px] text-[#a8a098] hover:text-[#292524] transition-colors"
            >
              查看全部
            </button>
          }
        >
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-[#f0ece4] animate-pulse" />
              ))}
            </div>
          ) : recentPhotos.length === 0 ? (
            <div className="py-12 text-center">
              <Camera size={24} className="mx-auto text-[#c4bdb2]" />
              <p className="mt-3 text-[13px] text-[#a8a098]">还没有照片</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {recentPhotos.map((photo) => (
                <PhotoThumb
                  key={photo.id}
                  photo={photo}
                  onClick={() => {
                    const album = albums.find(a => a.id === photo.album_id)
                    if (album) navigate(`/admin/albums/${album.id}`)
                  }}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="相册分布"
          className="lg:col-span-2"
          action={
            <button
              onClick={() => navigate('/admin/albums')}
              className="text-[12px] text-[#a8a098] hover:text-[#292524] transition-colors"
            >
              管理
            </button>
          }
        >
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-20 h-2.5 rounded bg-[#f0ece4]" />
                  <div className="flex-1 h-5 rounded-full bg-[#f0ece4]" />
                </div>
              ))}
            </div>
          ) : albums.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#a8a098]">暂无数据</div>
          ) : (
            <div>
              {sortedAlbums.slice(0, 6).map((album) => (
                <AlbumDistBar
                  key={album.id}
                  album={album}
                  maxCount={maxPhotoCount}
                  onClick={() => navigate(`/admin/albums/${album.id}`)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 第三行：最近动态（独立卡片） */}
      <SectionCard
        title="最近动态"
        action={
          <span className="text-[12px] text-[#c4bdb2]">最多显示 8 条</span>
        }
      >
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-full bg-[#f0ece4]" />
                <div className="flex-1 space-y-2">
                  <div className="w-36 h-3 rounded bg-[#f0ece4]" />
                  <div className="w-24 h-2.5 rounded bg-[#f0ece4]" />
                </div>
              </div>
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <div className="py-12 text-center">
            <ClockCounterClockwise size={24} className="mx-auto text-[#c4bdb2]" />
            <p className="mt-3 text-[13px] text-[#a8a098]">暂无动态</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12">
            {timeline.map((item, i) => (
              <TimelineItem key={i} {...item} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 上传弹窗 */}
      <AnimatePresence>
        {showUpload && (
          <UploadModal
            albums={albums}
            onClose={(refetch) => {
              setShowUpload(false)
              if (refetch) fetchData()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
