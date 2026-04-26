import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AllSettings, SmartColumn } from './types'

interface FilterPillsProps<T> {
  allSettings: AllSettings
  smartColumns: SmartColumn<T>[]
  updateSettings: (next: AllSettings) => void
}

export function FilterPills<T>({
  allSettings,
  smartColumns,
  updateSettings,
}: FilterPillsProps<T>) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  const clearAllFilters = () => updateSettings({})

  // O(1) column lookup instead of O(n) find per pill
  const colMap = useMemo(() => {
    const m = new Map<string, SmartColumn<T>>()
    smartColumns.forEach(c => m.set(c.id, c))
    return m
  }, [smartColumns])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {t('activeFilters')}
      </span>
      {Object.entries(allSettings).map(([colId, s]) => {
        const col = colMap.get(colId)
        if (!col) return null
        const parts: string[] = []
        if (s.sort) parts.push(`${t('sort.label')} ${s.sort === 'asc' ? '↑' : '↓'}`)
        if (s.filterText) parts.push(`"${s.filterText}"`)
        if (s.filterValues && s.filterValues.length > 0)
          parts.push(t('filterCount', { count: s.filterValues.length }))
        if (s.filterDateFrom && s.filterDateTo) parts.push(t('filterRange', { from: s.filterDateFrom, to: s.filterDateTo }))
        else if (s.filterDateFrom) parts.push(t('filterFrom', { date: s.filterDateFrom }))
        else if (s.filterDateTo) parts.push(t('filterUntil', { date: s.filterDateTo }))
        if (s.filterTimeFrom && s.filterTimeTo) parts.push(t('filterRange', { from: s.filterTimeFrom, to: s.filterTimeTo }))
        else if (s.filterTimeFrom) parts.push(t('filterFrom', { date: s.filterTimeFrom }))
        else if (s.filterTimeTo) parts.push(t('filterUntil', { date: s.filterTimeTo }))
        if (parts.length === 0) return null
        return (
          <span
            key={colId}
            className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          >
            {col.header}: {parts.join(', ')}
            <button
              onClick={() => {
                const next = { ...allSettings }
                delete next[colId]
                updateSettings(next)
              }}
              className="hover:text-primary-900 dark:hover:text-primary-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}
      <button
        onClick={clearAllFilters}
        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
      >
        {t('clearAll')}
      </button>
    </div>
  )
}
