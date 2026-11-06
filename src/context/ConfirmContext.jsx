import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import IconAlertTriangle from '@tabler/icons-react/dist/esm/icons/IconAlertTriangle.mjs'
import IconHelpCircle from '@tabler/icons-react/dist/esm/icons/IconHelpCircle.mjs'
import { useLocale } from './LocaleContext'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const { t } = useLocale()
  const [dialog, setDialog] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback(
    (options = {}) => {
      // 上一次还没回答就被再次调用时，先把旧的按「取消」结掉，避免 Promise 悬挂
      resolverRef.current?.(false)
      return new Promise((resolve) => {
        resolverRef.current = resolve
        setDialog({
          title: options.title || t('admin.confirmTitle'),
          message: options.message || '',
          confirmText: options.confirmText || t('admin.confirm'),
          cancelText: options.cancelText || t('admin.cancel'),
          tone: options.tone === 'default' ? 'default' : 'danger',
        })
      })
    },
    [t],
  )

  const close = useCallback((result) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    resolve?.(result)
  }, [])

  useEffect(() => {
    if (!dialog) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, close])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="card w-full max-w-sm overflow-hidden rounded-2xl p-0 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              <span
                className={
                  dialog.tone === 'danger'
                    ? 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/10'
                    : 'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }
              >
                {dialog.tone === 'danger' ? <IconAlertTriangle size={18} /> : <IconHelpCircle size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {dialog.title}
                </h2>
                {dialog.message && (
                  <p className="mt-1.5 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
                    {dialog.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 px-5 pb-5">
              <button type="button" onClick={() => close(false)} className="btn btn-soft">
                {dialog.cancelText}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={
                  dialog.tone === 'danger'
                    ? 'btn bg-red-500 text-white hover:bg-red-600'
                    : 'btn btn-primary'
                }
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm
}
