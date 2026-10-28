import { useEffect, useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { useLocale } from '../context/LocaleContext'

const GROUPS = [
  {
    ns: 'app',
    labelKey: 'admin.sectionApp',
    fields: [
      { key: 'title', labelKey: 'admin.siteTitle' },
      { key: 'author', labelKey: 'admin.author' },
      { key: 'slogan', labelKey: 'admin.slogan' },
      { key: 'avatarUrl', labelKey: 'admin.avatarUrl' },
      { key: 'footerLinkText', labelKey: 'admin.footerText' },
      { key: 'footerLinkUrl', labelKey: 'admin.footerUrl' },
    ],
  },
  {
    ns: 'analytics',
    labelKey: 'admin.sectionAnalytics',
    fields: [
      { key: 'headScripts', labelKey: 'admin.headScripts', textarea: true },
      { key: 'bodyScripts', labelKey: 'admin.bodyScripts', textarea: true },
    ],
  },
  {
    ns: 'privacy',
    labelKey: 'admin.sectionPrivacy',
    fields: [
      {
        key: 'upload.autoEraseLocation',
        labelKey: 'admin.autoEraseLocation',
        toggle: true,
      },
    ],
  },
  {
    ns: 'system',
    labelKey: 'admin.sectionSystem',
    fields: [
      { key: 'upload.maxFileSize', labelKey: 'admin.maxFileSize', number: true },
      { key: 'upload.duplicateCheck.enabled', labelKey: 'admin.dupCheckEnabled', toggle: true },
      {
        key: 'upload.duplicateCheck.mode',
        labelKey: 'admin.dupCheckMode',
        options: [
          { value: 'skip', labelKey: 'admin.dupSkip' },
          { value: 'overwrite', labelKey: 'admin.dupOverwrite' },
        ],
      },
    ],
  },
]

export default function AdminSettings() {
  const { push } = useToast()
  const { updateSettings } = useSettings()
  const { t } = useLocale()
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
      push(t('admin.settingsSaved'))
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!values) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  return (
    <div className="max-w-2xl space-y-6">
      {GROUPS.map((group) => (
        <section key={group.ns} className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t(group.labelKey)}
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
                      {t(field.labelKey)}
                    </span>
                  </label>
                )
              }
              return (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                    {t(field.labelKey)}
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
                      value={typeof raw === 'string' ? raw : field.options[0].value}
                      onChange={(e) => setValue(group.ns, field.key, e.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
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
          {t('admin.saveSettings')}
        </button>
      </div>
    </div>
  )
}
