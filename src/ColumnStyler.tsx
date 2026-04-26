import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Paintbrush, ChevronDown, X, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'
import type { ColumnStyle } from './types'

// ─── Accordion ─────────────────────────────────────────────

function Accordion({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={clsx('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

// ─── Preset colors ─────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#06b6d4', '#3b82f6', '#6366f1',
  '#a855f7', '#ec4899', '#64748b', '#1e293b',
]

// ─── ColorDot — click to open popover picker ───────────────

function ColorDot({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = value || ''

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 w-24 shrink-0">{label}</span>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'h-6 w-6 rounded-md border transition-transform hover:scale-110 shrink-0',
          active
            ? 'border-slate-300 dark:border-slate-600'
            : 'border-dashed border-slate-300 dark:border-slate-600 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:8px_8px]',
        )}
        style={active ? { backgroundColor: active } : undefined}
      />
      {active && (
        <button
          onClick={() => onChange('')}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
          title={t('remove')}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Popover */}
      {open && (
        <div className="absolute left-24 top-full mt-1 z-50 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900 w-[200px]">
          <div className="grid grid-cols-6 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                className={clsx(
                  'h-6 w-6 rounded-md border transition-transform hover:scale-110',
                  active === c
                    ? 'border-primary-500 ring-1 ring-primary-300 dark:ring-primary-700'
                    : 'border-slate-200 dark:border-slate-600',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-2">
            <input
              type="color"
              value={active || '#3b82f6'}
              onChange={(e) => { onChange(e.target.value); setOpen(false) }}
              className="h-6 w-6 cursor-pointer rounded border-0 p-0"
            />
            <span className="text-[10px] text-slate-400">{t('custom')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ButtonGroup ───────────────────────────────────────────

function ButtonGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'px-2.5 py-1 text-xs font-medium transition-colors',
            opt.value === value
              ? 'bg-primary-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── ColumnStyler (unified Apparence) ──────────────────────

interface ColumnStylerProps {
  style: ColumnStyle
  setStyle: (style: ColumnStyle) => void
}

export function ColumnStyler({ style, setStyle }: ColumnStylerProps) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  return (
    <Accordion title={t('appearance.title')} icon={<Paintbrush className="h-4 w-4" />} defaultOpen={false}>
      <div className="space-y-2.5">
        {/* Colors — compact dot + popover */}
        <ColorDot
          label={t('appearance.borderLeft')}
          value={style.borderLeft ?? ''}
          onChange={(v) => setStyle({ ...style, borderLeft: v || undefined })}
        />
        <ColorDot
          label={t('appearance.borderRight')}
          value={style.borderRight ?? ''}
          onChange={(v) => setStyle({ ...style, borderRight: v || undefined })}
        />
        <ColorDot
          label={t('appearance.background')}
          value={style.background ?? ''}
          onChange={(v) => setStyle({ ...style, background: v || undefined })}
        />

        {/* Border width — only when a border is active */}
        {(style.borderLeft || style.borderRight) && (
          <div>
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t('appearance.borderWidth')}</p>
            <ButtonGroup
              options={[
                { value: '1px', label: t('appearance.thin') },
                { value: '2px', label: t('appearance.medium') },
                { value: '3px', label: t('appearance.thick') },
              ]}
              value={style.borderLeftWidth ?? '1px'}
              onChange={(v) => setStyle({ ...style, borderLeftWidth: v })}
            />
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Typography */}
        <div>
          <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t('appearance.weight')}</p>
          <ButtonGroup
            options={[
              { value: '300', label: t('appearance.light') },
              { value: '400', label: t('appearance.normal') },
              { value: '700', label: t('appearance.bold') },
              { value: '900', label: t('appearance.heavy') },
            ]}
            value={style.fontWeight ?? '400'}
            onChange={(v) => setStyle({ ...style, fontWeight: v })}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t('appearance.style')}</p>
          <ButtonGroup
            options={[
              { value: 'normal', label: t('appearance.normal') },
              { value: 'italic', label: t('appearance.italic') },
            ]}
            value={style.fontStyle ?? 'normal'}
            onChange={(v) => setStyle({ ...style, fontStyle: v })}
          />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t('appearance.size')}</p>
            <ButtonGroup
              options={[
                { value: 'S', label: 'S' },
                { value: 'M', label: 'M' },
                { value: 'L', label: 'L' },
              ]}
              value={style.fontSize ?? 'M'}
              onChange={(v) => setStyle({ ...style, fontSize: v })}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t('appearance.alignment')}</p>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {([
                { value: 'left', icon: <AlignLeft className="h-3.5 w-3.5" /> },
                { value: 'center', icon: <AlignCenter className="h-3.5 w-3.5" /> },
                { value: 'right', icon: <AlignRight className="h-3.5 w-3.5" /> },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStyle({ ...style, textAlign: opt.value })}
                  className={clsx(
                    'px-2.5 py-1 transition-colors',
                    (style.textAlign ?? 'left') === opt.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
                  )}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div
          className="mt-1 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
          style={{
            borderLeftColor: style.borderLeft || undefined,
            borderLeftWidth: style.borderLeft ? (style.borderLeftWidth ?? '1px') : undefined,
            borderRightColor: style.borderRight || undefined,
            borderRightWidth: style.borderRight ? (style.borderLeftWidth ?? '1px') : undefined,
            backgroundColor: style.background ? style.background + '20' : undefined,
            fontWeight: style.fontWeight ?? undefined,
            fontStyle: style.fontStyle ?? undefined,
            fontSize: style.fontSize === 'S' ? '12px' : style.fontSize === 'L' ? '16px' : '14px',
            textAlign: (style.textAlign as React.CSSProperties['textAlign']) ?? undefined,
          }}
        >
          <span className="text-slate-600 dark:text-slate-400">{t('appearance.sampleText')}</span>
        </div>
      </div>
    </Accordion>
  )
}
