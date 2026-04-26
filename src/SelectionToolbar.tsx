import type { ReactNode } from 'react'
import { X, CheckSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SelectionState } from './types'

interface SelectionToolbarProps {
  selection: SelectionState
  total: number
  pageCount: number
  onSelectAll: () => void
  onClear: () => void
  actions?: ReactNode
}

export function SelectionToolbar({
  selection,
  total,
  pageCount,
  onSelectAll,
  onClear,
  actions,
}: SelectionToolbarProps) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  if (selection.count === 0) return null

  const allSelected = selection.mode === 'all' && selection.excludedIds.size === 0
  const showSelectAllBanner =
    !allSelected && selection.count === pageCount && total > pageCount

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm dark:border-primary-800 dark:bg-primary-950">
      <CheckSquare className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />

      <span className="font-medium text-primary-700 dark:text-primary-300">
        {t('selection.selected', { count: selection.count })}
      </span>

      {showSelectAllBanner && (
        <>
          <span className="text-primary-500 dark:text-primary-400">—</span>
          <button
            onClick={onSelectAll}
            className="font-medium text-primary-600 underline hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
          >
            {t('selection.selectAllItems', { count: total })}
          </button>
        </>
      )}

      {allSelected && total > pageCount && (
        <span className="text-primary-500 dark:text-primary-400">
          {t('selection.allPages')}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {actions}
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 hover:bg-primary-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-primary-900 dark:hover:text-slate-300 transition-colors"
          title={t('selection.deselectAll')}
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('selection.deselect')}</span>
        </button>
      </div>
    </div>
  )
}
