import { useEffect, useState } from 'react'
import IconAdjustments from '@tabler/icons-react/dist/esm/icons/IconAdjustments.mjs'
import IconAppWindow from '@tabler/icons-react/dist/esm/icons/IconAppWindow.mjs'
import IconChartBar from '@tabler/icons-react/dist/esm/icons/IconChartBar.mjs'
import IconLoader2 from '@tabler/icons-react/dist/esm/icons/IconLoader2.mjs'
import IconMap2 from '@tabler/icons-react/dist/esm/icons/IconMap2.mjs'
import IconShieldLock from '@tabler/icons-react/dist/esm/icons/IconShieldLock.mjs'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { useLocale } from '../context/LocaleContext'

// 每个分组：ns 命名空间 + 图标 + 标题/说明文案 + 字段。
// 字段上的 wide 表示在栅格里横跨两列，textarea 走多行输入。
const GROUPS = [
  {
    ns: 'app',
    icon: IconAppWindow,
    labelKey: 'admin.sectionApp',
    hintKey: 'admin.sectionAppHint',
    fields: [
      { key: 'title', labelKey: 'admin.siteTitle' },
      { key: 'author', labelKey: 'admin.author' },
      { key: 'slogan', labelKey: 'admin.slogan', wide: true },
      { key: 'avatarUrl', labelKey: 'admin.avatarUrl', wide: true, mono: true },
      { key: 'footerLinkText', labelKey: 'admin.footerText' },
      { key: 'footerLinkUrl', labelKey: 'admin.footerUrl' },
    ],
  },
  {
    ns: 'analytics',
    icon: IconChartBar,
    labelKey: 'admin.sectionAnalytics',
    hintKey: 'admin.sectionAnalyticsHint',
    fields: [
      { key: 'headScripts', labelKey: 'admin.headScripts', textarea: true },
      { key: 'bodyScripts', labelKey: 'admin.bodyScripts', textarea: true },
    ],
  },
  {
    ns: 'map',
    icon: IconMap2,
    labelKey: 'admin.sectionMap',
    hintKey: 'admin.sectionMapHint',
    fields: [
      { key: 'amap.key', labelKey: 'admin.amapKey', mono: true, wide: true },
      { key: 'amap.securityCode', labelKey: 'admin.amapSecurityCode', password: true, wide: true },
      {
        key: 'amap.webServiceKey',
        labelKey: 'admin.amapWebServiceKey',
        mono: true,
        wide: true,
        hintKey: 'admin.amapWebServiceKeyHint',
      },
    ],
  },
  {
    ns: 'privacy',
    icon: IconShieldLock,
    labelKey: 'admin.sectionPrivacy',
    hintKey: 'admin.sectionPrivacyHint',
    fields: [
      {
        key: 'upload.autoEraseLocation',
        labelKey: 'admin.autoEraseLocation',
        toggle: true,
        hintKey: 'admin.autoEraseLocationHint',
      },
    ],
  },
  {
    ns: 'system',
    icon: IconAdjustments,
    labelKey: 'admin.sectionSystem',
    hintKey: 'admin.sectionSystemHint',
    fields: [
      { key: 'upload.maxFileSize', labelKey: 'admin.maxFileSize', number: true, hintKey: 'admin.maxFileSizeHint' },
      {
        key: 'upload.duplicateCheck.mode',
        labelKey: 'admin.dupCheckMode',
        options: [
          { value: 'skip', labelKey: 'admin.dupSkip' },
          { value: 'overwrite', labelKey: 'admin.dupOverwrite' },
        ],
      },
      {
        key: 'upload.duplicateCheck.enabled',
        labelKey: 'admin.dupCheckEnabled',
        toggle: true,
        hintKey: 'admin.dupCheckEnabledHint',
      },
    ],
  },
]

function groupOf(ns) {
  return GROUPS.find((group) => group.ns === ns)
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function FieldLabel({ label, path }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-xs font-medium leading-4 text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      <span className="min-w-0 break-all font-mono text-[10.5px] leading-4 text-neutral-400 dark:text-neutral-500">
        {path}
      </span>
    </span>
  )
}

function Switch({ checked, onChange, label, hint, className = '' }) {
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/40 ${className}`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium leading-4 text-neutral-700 dark:text-neutral-200">
          {label}
        </span>
        {hint && (
          <span className="text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform dark:bg-neutral-900 ${
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  )
}

function Section({
  group,
  values,
  dirty,
  saving,
  onSave,
  onReset,
  className = '',
  gridClass = 'grid gap-4 sm:grid-cols-2',
  renderField,
}) {
  const { t } = useLocale()
  const Icon = group.icon
  return (
    <section className={`card flex flex-col p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t(group.labelKey)}
          </h2>
          {group.hintKey && (
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {t(group.hintKey)}
            </p>
          )}
        </div>
        {dirty && (
          <span className="mt-1 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
            {t('admin.unsaved')}
          </span>
        )}
      </div>

      <div className={gridClass}>
        {group.fields.map((field) => renderField(group, field, values))}
      </div>

      <div className="mt-auto flex items-center justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || saving}
          className="btn btn-soft disabled:opacity-40"
        >
          {t('admin.revert')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="btn btn-primary disabled:opacity-40"
        >
          {saving && <IconLoader2 size={16} className="animate-spin" />}
          {t('admin.save')}
        </button>
      </div>
    </section>
  )
}

export default function AdminSettings() {
  const { push } = useToast()
  const { updateSettings } = useSettings()
  const { t } = useLocale()
  // values：服务器上的最新值；drafts：各分组本地编辑中的值
  const [values, setValues] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [savingNs, setSavingNs] = useState('')

  useEffect(() => {
    api
      .get('/api/system/settings/all')
      .then((res) => setValues(res.data || {}))
      .catch((err) => push(err.message, 'error'))
  }, [])

  const currentOf = (ns) => drafts[ns] ?? values?.[ns] ?? {}

  const dirtyOf = (ns) => !!values && !same(currentOf(ns), values[ns] ?? {})

  const setValue = (ns, key, value) =>
    setDrafts((prev) => ({
      ...prev,
      [ns]: { ...(prev[ns] ?? values?.[ns] ?? {}), [key]: value },
    }))

  const revert = (ns) =>
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[ns]
      return next
    })

  const saveGroup = async (ns) => {
    setSavingNs(ns)
    try {
      // 只提交该分组，服务端按命名空间合并
      const data = await updateSettings({ [ns]: currentOf(ns) })
      setValues((prev) => ({ ...(prev || {}), ...(data || {}) }))
      revert(ns)
      push(t('admin.settingsSaved'))
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSavingNs('')
    }
  }

  if (!values) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  const renderField = (group, field, groupValues) => {
    const raw = groupValues?.[field.key]
    const path = `${group.ns}:${field.key}`
    const label = t(field.labelKey)

    if (field.toggle) {
      const checked = raw === true || raw === 'true'
      return (
        <Switch
          key={field.key}
          label={label}
          hint={field.hintKey ? t(field.hintKey) : ''}
          checked={checked}
          className={field.wide ? 'sm:col-span-2' : ''}
          onChange={(next) => setValue(group.ns, field.key, next)}
        />
      )
    }

    return (
      <label
        key={field.key}
        className={`flex min-w-0 flex-col gap-1.5 ${field.wide ? 'sm:col-span-2' : ''}`}
      >
        <FieldLabel label={label} path={path} />
        {field.textarea ? (
          <textarea
            className="field min-h-24 resize-y font-mono text-xs leading-5"
            value={typeof raw === 'string' ? raw : ''}
            onChange={(e) => setValue(group.ns, field.key, e.target.value)}
            spellCheck={false}
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
            className={[
              'field',
              field.number ? 'max-w-32' : '',
              field.mono ? 'font-mono text-xs' : '',
            ].join(' ')}
            type={field.password ? 'password' : field.number ? 'number' : 'text'}
            value={raw ?? ''}
            onChange={(e) =>
              setValue(
                group.ns,
                field.key,
                field.number ? Number(e.target.value) : e.target.value,
              )
            }
            spellCheck={false}
          />
        )}
        {field.hintKey && (
          <span className="text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
            {t(field.hintKey)}
          </span>
        )}
      </label>
    )
  }

  const renderGroup = (ns, { className = '', gridClass } = {}) => {
    const group = groupOf(ns)
    return (
      <Section
        key={ns}
        group={group}
        values={currentOf(ns)}
        dirty={dirtyOf(ns)}
        saving={savingNs === ns}
        onSave={() => saveGroup(ns)}
        onReset={() => revert(ns)}
        className={className}
        gridClass={gridClass}
        renderField={renderField}
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-2">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {renderGroup('app')}
          {renderGroup('analytics', { gridClass: 'grid gap-4' })}
        </div>
        <div className="space-y-5">
          {renderGroup('map', { gridClass: 'grid gap-4' })}
          {renderGroup('privacy', { gridClass: 'grid gap-4' })}
          {renderGroup('system', { gridClass: 'grid gap-3' })}
        </div>
      </div>

      <p className="px-1 text-xs text-neutral-400 dark:text-neutral-500">
        {t('admin.settingsHint')}
      </p>
    </div>
  )
}
