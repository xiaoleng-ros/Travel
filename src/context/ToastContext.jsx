import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { IconCircleCheck, IconAlertTriangle, IconInfoCircle, IconX } from '@tabler/icons-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (message, type = 'success') => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list, { id, message, type }])
      setTimeout(() => dismiss(id), 3800)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol className="fixed right-4 bottom-4 z-[200] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon =
            toast.type === 'error' ? IconAlertTriangle : toast.type === 'info' ? IconInfoCircle : IconCircleCheck
          return (
            <li
              key={toast.id}
              className="flex items-start gap-2 rounded-xl border border-neutral-200/80 bg-white/95 px-3.5 py-3 text-sm text-neutral-800 shadow-xl backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95 dark:text-neutral-100"
            >
              <Icon
                size={18}
                className={
                  toast.type === 'error'
                    ? 'mt-0.5 shrink-0 text-red-500'
                    : 'mt-0.5 shrink-0 text-emerald-500'
                }
              />
              <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="mt-0.5 shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Dismiss"
              >
                <IconX size={15} />
              </button>
            </li>
          )
        })}
      </ol>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
