import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Close, Calendar } from '../icons'

export default function Lightbox({
  photo,
  currentIndex,
  totalCount,
  onClose,
  onPrev,
  onNext,
  isLoading,
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 backdrop-blur-md bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-w-5xl w-full sm:mx-4 mx-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative inline-block max-w-full max-h-[95vh] rounded-2xl overflow-hidden bg-[#1a1a1a] shadow-2xl"
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
              </div>
            )}

            <img
              src={photo.url}
              alt={photo.title}
              className="max-w-full max-h-[95vh] w-auto h-auto block object-contain"
            />

            {currentIndex > 0 && (
              <button
                className="flex justify-center items-center absolute left-4 top-1/2 z-10 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-200 border border-white/20 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onPrev() }}
              >
                <ChevronLeft className="sm:w-7 sm:h-7 w-5 h-5 text-white" />
              </button>
            )}

            {currentIndex < totalCount - 1 && (
              <button
                className="flex justify-center items-center absolute right-4 top-1/2 z-10 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-200 border border-white/20 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onNext() }}
              >
                <ChevronRight className="sm:w-7 sm:h-7 w-5 h-5 text-white" />
              </button>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-6 pt-20">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <h3 className="text-white text-lg font-medium mb-2 w-10/12 line-clamp-1 break-all font-sans-body">
                  {photo.title}
                </h3>
                {photo.description && (
                  <p className="text-white/70 leading-relaxed mb-3 text-sm font-sans-body">{photo.description}</p>
                )}
                <div className="flex items-center gap-4 text-gray-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <p className="text-xs font-sans-body">{photo.create_time}</p>
                  </div>
                  <div className="text-xs text-gray-400 font-sans-body">
                    {photo.width} × {photo.height}
                  </div>
                  <div className="text-xs text-gray-400 font-sans-body">
                    {currentIndex + 1} / {totalCount}
                  </div>
                </div>
              </motion.div>
            </div>

            <button
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md transition-all duration-200 border border-white/20 cursor-pointer"
              onClick={onClose}
            >
              <Close className="sm:w-5 sm:h-5 w-4 h-4 text-white" />
            </button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}
