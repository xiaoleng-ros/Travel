import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'

const GROUPS = [
  {
    ns: 'app',
    label: 'Application',
    fields: [
      { key: 'title', label: 'Site title' },
      { key: 'author', label: 'Author' },
      { key: 'slogan', label: 'Slogan' },
      { key: 'avatarUrl', label: 'Avatar URL' },
      { key: 'footerLinkText', label: 'Footer link text' },
      { key: 'footerLinkUrl', label: 'Footer link URL' },
    ],
  },
  {
    ns: 'analytics',
    label: 'Analytics',
    fields: [
      { key: 'headScripts', label: 'Head scripts', textarea: true },
      { key: 'bodyScripts', label: 'Body scripts', textarea: true },
    ],
  },
  {
    ns: 'privacy',
    label: 'Privacy',
    fields: [{ key: 'upload.autoEraseLocation', label: 'Auto erase location on upload', toggle: true }],
  },
  {
    ns: 'system',
    label: 'System',
    fields: [
      { key: 'upload.maxFileSize', label: 'Max upload file size (MB)', number: true },
      { key: 'upload.duplicateCheck.enabled', label: 'Duplicate check enabled', toggle: true },
      {
        key: 'upload.duplicateCheck.mode',
        label: 'Duplicate check mode',
        options: ['skip', 'overwrite'],
      },
    ],
  },
]

export default function AdminSettings() {
  const { push } = useToast()
  const { updateSettings } = useSettings()
  const [values, setValues] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get('/api/system/settings/all')
      .then((res) => setValues(res.data || {}))
      .catch((err) => push(err.message, 'error'))
  }, [])

  const setValue = (ns, key, value) =>
    setValues((prev) => ({ ...prev, [ns]: { ...prev[ns], [key]: value } }))

  const save = async () => {
    setSaving(true)
    try {
      await updateSettings(values)
      push('Settings saved')
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!values) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="max-w-2xl space-y-6">
      {GROUPS.map((group) => (
        <section key={group.ns} className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {group.label}
          </h2>
          <div className="space-y-3">
            {group.fields.map((field) => {
              const raw = values[group.ns]?.[field.key]
              const path = `${group.ns}:${field.key}`
              if (field.toggle) {
                return (
                  <label key={field.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={raw === true || raw === 'true'}
                      onChange={(e) => setValue(group.ns, field.key, e.target.checked)}
                      className="size-4 accent-neutral-800"
                    />
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                      {field.label}
                    </span>
                  </label>
                )
              }
              return (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    {field.label}
                    <span className="ml-1 text-neutral-400">{path}</span>
                  </span>
                  {field.textarea ? (
                    <textarea
                      className="field min-h-24 font-mono text-xs"
                      value={typeof raw === 'string' ? raw : ''}
                      onChange={(e) => setValue(group.ns, field.key, e.target.value)}
                    />
                  ) : field.options ? (
                    <select
                      className="field"
                      value={typeof raw === 'string' ? raw : field.options[0]}
                      onChange={(e) => setValue(group.ns, field.key, e.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="field"
                      type={field.number ? 'number' : 'text'}
                      value={raw ?? ''}
                      onChange={(e) =>
                        setValue(
                          group.ns,
                          field.key,
                          field.number ? Number(e.target.value) : e.target.value,
                        )
                      }
                    />
                  )}
                </label>
              )
            })}
          </div>
        </section>
      ))}

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
          {saving && <IconLoader2 size={16} className="animate-spin" />}
          Save settings
        </button>
      </div>
    </div>
  )
}
