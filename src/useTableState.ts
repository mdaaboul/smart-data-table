import { useState, useCallback, useMemo, useEffect } from 'react'
import type { AllSettings, ColumnSettings, ViewMode, SmartColumn, TableStateSnapshot, PrefsAPI } from './types'

// Re-export so existing imports from './useTableState' keep working.
export type { PrefsAPI } from './types'

// ─── Default localStorage adapter ──────────────────────────
//
// Consumers that don't want to wire their own persistence can
// `createLocalStoragePrefs()` and pass the result as the `prefs`
// prop on SmartDataTable.
export function createLocalStoragePrefs(): PrefsAPI {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(key)
        return raw == null ? fallback : (JSON.parse(raw) as T)
      } catch {
        return fallback
      }
    },
    set(key: string, value: unknown): void {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch { /* swallow quota / privacy-mode errors */ }
    },
  }
}

// ─── Hook ───────────────────────────────────────────────────

export function useTableState<T>(
  tableId: string,
  smartColumns: SmartColumn<T>[],
  defaultView: ViewMode,
  viewModes: ViewMode[] | undefined,
  initialPageSize: number,
  prefs: PrefsAPI,
  initialHiddenColumns?: Set<string>,
) {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = prefs.get<string | null>(`${tableId}-view`, null)
    if (saved && viewModes?.includes(saved as ViewMode)) return saved as ViewMode
    return defaultView
  })
  const changeView = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    prefs.set(`${tableId}-view`, mode)
  }, [tableId, prefs])

  // Column settings (sort, filter, style)
  // On init: strip stale column FILTERS from localStorage — keep sort + style only
  // This prevents "invisible filters" that silently hide data between sessions
  const [allSettings, setAllSettings] = useState<AllSettings>(() => {
    const stored = prefs.get<AllSettings>(`smarttable-${tableId}`, {})
    const cleaned: AllSettings = {}
    for (const [colId, s] of Object.entries(stored)) {
      const { filterValues, filterText, filterNumberFrom, filterNumberTo, filterDateFrom, filterDateTo, filterTimeFrom, filterTimeTo, ...rest } = s
      if (Object.keys(rest).length > 0) cleaned[colId] = rest
    }
    // Persist the cleaned version
    if (JSON.stringify(cleaned) !== JSON.stringify(stored)) prefs.set(`smarttable-${tableId}`, cleaned)
    return cleaned
  })
  const updateSettings = useCallback((next: AllSettings) => {
    setAllSettings(next)
    prefs.set(`smarttable-${tableId}`, next)
  }, [tableId, prefs])

  // Page size
  const [internalPageSize, setInternalPageSize] = useState(() => {
    const saved = prefs.get<number | null>(`${tableId}-pageSize`, null)
    return saved && saved > 0 ? saved : initialPageSize
  })
  const changePageSize = useCallback((size: number) => {
    setInternalPageSize(size)
    prefs.set(`${tableId}-pageSize`, size)
  }, [tableId, prefs])

  // Hidden columns
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const saved = prefs.get<string[] | null>(`${tableId}-hidden-cols`, null)
    if (saved) return new Set(saved)
    return initialHiddenColumns ? new Set(initialHiddenColumns) : new Set()
  })
  const toggleColumn = useCallback((colId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId); else next.add(colId)
      prefs.set(`${tableId}-hidden-cols`, [...next])
      return next
    })
  }, [tableId, prefs])

  const visibleColumns = useMemo(
    () => smartColumns.filter(c => !hiddenColumns.has(c.id)),
    [smartColumns, hiddenColumns],
  )

  // Popup state
  const [activePopup, setActivePopup] = useState<string | null>(null)
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null)
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Global search — debounce léger (50 ms) : assez pour batch plusieurs touches
  // rapides sans que l'utilisateur perçoive un délai, mais instantané au feel.
  // Le 300 ms précédent donnait une sensation de lag sur les recherches courtes
  // (ticket UX SmartDataTable — filter/search "feels unreliable").
  const [globalSearch, setGlobalSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(globalSearch), 50)
    return () => clearTimeout(timer)
  }, [globalSearch])

  // Active filter count — exclut les tris, compte les filtres réels et les
  // opérateurs "est vide / n'est pas vide" même sans valeur.
  const activeFilterCount = useMemo(() => {
    let count = 0
    Object.values(allSettings).forEach((s: ColumnSettings) => {
      if (s.filterText) count++
      else if (s.filterTextOp === 'empty' || s.filterTextOp === 'notEmpty') count++
      if (s.filterValues && s.filterValues.length > 0 && !s.filterValues.every(v => v === '__NONE__')) count++
      if (s.filterDateFrom || s.filterDateTo) count++
      if (s.filterTimeFrom || s.filterTimeTo) count++
      if (s.filterNumberFrom != null || s.filterNumberTo != null) count++
      else if (s.filterNumberOp === 'empty' || s.filterNumberOp === 'notEmpty') count++
    })
    return count
  }, [allSettings])

  // Global search filtering (uses debounced value to avoid re-filtering on every keystroke)
  // Splits query into terms so "Philippe T" matches rows where any column contains "philippe" AND any column contains "t"
  const filterByGlobalSearch = useCallback((data: T[]) => {
    const terms = debouncedSearch.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return data
    return data.filter(row => {
      const values = smartColumns.map(col => {
        const accessor = col.accessorKey
          ? (r: T) => (r as Record<string, unknown>)[col.accessorKey!]
          : col.accessorFn
        if (!accessor) return ''
        const val = accessor(row)
        return val != null ? String(val).toLowerCase() : ''
      })
      return terms.every(term => values.some(v => v.includes(term)))
    })
  }, [debouncedSearch, smartColumns])

  // Check if column has active sort/filter indicator
  const hasIndicator = useCallback((colId: string) => {
    const s = allSettings[colId]
    if (!s) return false
    return !!(s.sort || s.filterText || (s.filterValues && s.filterValues.length > 0) || s.filterDateFrom || s.filterDateTo || s.filterTimeFrom || s.filterTimeTo || s.filterNumberFrom != null || s.filterNumberTo != null || s.filterTextOp === 'empty' || s.filterTextOp === 'notEmpty' || s.filterNumberOp === 'empty' || s.filterNumberOp === 'notEmpty')
  }, [allSettings])

  // Restore state from an external snapshot (used by saved views)
  const restoreState = useCallback((snapshot: TableStateSnapshot) => {
    const nextHidden = new Set(snapshot.hiddenColumns ?? [])
    setHiddenColumns(nextHidden)
    prefs.set(`${tableId}-hidden-cols`, [...nextHidden])

    const nextSettings = snapshot.allSettings ?? {}
    setAllSettings(nextSettings)
    prefs.set(`smarttable-${tableId}`, nextSettings)

    if (snapshot.pageSize && snapshot.pageSize > 0) {
      setInternalPageSize(snapshot.pageSize)
      prefs.set(`${tableId}-pageSize`, snapshot.pageSize)
    }
  }, [tableId, prefs])

  // ── Header interactions (Airtable/Ninox pattern) ─────────
  //
  // Click gauche sur header = cycle tri (asc → desc → clear), instant.
  // Shift+click gauche = cycle sans effacer les autres sorts (multi-colonne).
  // Click sur chevron (ou right-click) = ouvre popup filtre/agg/style.
  const cycleSort = useCallback((colId: string, opts?: { additive?: boolean }) => {
    const current = allSettings[colId]?.sort
    const nextSort: 'asc' | 'desc' | null =
      current === 'asc' ? 'desc' : current === 'desc' ? null : 'asc'
    const next: AllSettings = { ...allSettings }
    // En mode non-additif (click simple), on nettoie les autres sorts.
    // Le mode additif (Shift+click) préserve les sorts existants pour
    // permettre un ordre multi-colonnes (e.g. trier par Statut puis par Date).
    if (!opts?.additive) {
      for (const k of Object.keys(next)) {
        if (k !== colId && next[k]?.sort) next[k] = { ...next[k], sort: null }
      }
    }
    if (nextSort) {
      next[colId] = { ...(next[colId] ?? {}), sort: nextSort }
    } else if (next[colId]) {
      const { sort: _s, ...rest } = next[colId]
      void _s
      if (Object.keys(rest).length > 0) next[colId] = rest
      else delete next[colId]
    }
    updateSettings(next)
  }, [allSettings, updateSettings])

  const openHeaderPopup = useCallback((colId: string, anchor: DOMRect) => {
    setPopupAnchor(anchor)
    setActivePopup(colId)
  }, [])

  const handleHeaderClick = useCallback((colId: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    // Click gauche sur le corps du header (pas sur le chevron) = cycle tri direct.
    // Les handlers onChevronClick / onContextMenu (voir TableView) gèrent le popup.
    const col = smartColumns.find((c) => c.id === colId)
    if (!(col?.sortable ?? true)) {
      // Pour les colonnes non triables : ouvrir directement le popup (filtre/style/etc.)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      openHeaderPopup(colId, rect)
      return
    }
    // Shift+click = multi-sort (additif). Sans shift = single-sort.
    cycleSort(colId, { additive: e.shiftKey })
  }, [cycleSort, smartColumns, openHeaderPopup])

  return {
    viewMode, changeView,
    allSettings, updateSettings,
    internalPageSize, changePageSize,
    hiddenColumns, toggleColumn, visibleColumns,
    activePopup, setActivePopup, popupAnchor, setPopupAnchor,
    showColumnPicker, setShowColumnPicker,
    globalSearch, setGlobalSearch, debouncedSearch,
    activeFilterCount,
    filterByGlobalSearch,
    hasIndicator,
    handleHeaderClick,
    cycleSort,
    openHeaderPopup,
    restoreState,
  }
}
