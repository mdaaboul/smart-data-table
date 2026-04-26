import { useState, useRef, useEffect } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ExportDropdownProps {
  onCSV: () => void
  onExcel: () => void
}

export function ExportDropdown({ onCSV, onExcel }: ExportDropdownProps) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Download className="h-4 w-4" /> {t('export.button')}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            onClick={() => { onCSV(); setOpen(false) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              CSV
            </span>
            {t('export.csv')}
          </button>
          <button
            onClick={() => { onExcel(); setOpen(false) }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-100 text-[9px] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              XLS
            </span>
            {t('export.excel')}
          </button>
        </div>
      )}
    </div>
  )
}
