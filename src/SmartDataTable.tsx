import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnOrderState,
  type ColumnSizingState,
  type FilterFn,
} from '@tanstack/react-table'
import { Search, Plus, Home, User, ImageIcon, X, CheckSquare, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SmartDataTableProps, SmartColumn, EntityColumnConfig, TableStateSnapshot } from './types'
import { smartFilterFn, exportCSV, exportExcel, resolveTemplate, extractImageUrl, templateHasImageVar, computeAggregations, getCellStyle } from './helpers'
import { useTableState } from './useTableState'
import { TableView } from './TableView'
import { SmartPagination, getScrollMode } from './SmartPagination'
import { ColumnPopup } from './ColumnPopup'
import { FilterPills } from './FilterPills'
import { ExportDropdown } from './ExportDropdown'
import { useSelection } from './useSelection'

// ENTITY_VARIABLES / DEFAULT_TEMPLATES intentionally stubbed —
// entity-metadata system is out of scope for this package.
// Consumers that want template-driven cells can wire entityType
// + entityAccessor on SmartColumn and provide their own renderers.
const ENTITY_VARIABLES: Record<string, { key: string; label: string; group: string; format?: string }[]> = {}
const DEFAULT_TEMPLATES: Record<string, { mainLine: string; subLine?: string; sortField?: string }> = {}

export default function SmartDataTable<T>({
  columns: userColumns,
  data,
  tableId,
  prefs,
  loading = false,
  onRowClick,
  enablePagination = true,
  manualPagination = false,
  page = 1,
  pageSize: initialPageSize = 25,
  total,
  onPageChange,
  onPageSizeChange: onPageSizeChangeProp,
  searchPlaceholder,
  emptyTitle,
  emptyAction,
  // Card / kanban view modes are out of scope for this package — viewModes
  // is kept for API compatibility but only 'table' is actually rendered.
  viewModes,
  defaultView = 'table',
  actions,
  onAdd,
  addLabel,
  initialHiddenColumns,
  enableSelection = false,
  getRowId,
  selectionActions,
  tableStateRef,
  onTableStateChange,
  initialTableState,
  onScrollModeChange: onScrollModeChangeProp,
  onSortChange,
  onGlobalSearch,
}: SmartDataTableProps<T>) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })

  // ── Built-in ID column (first after checkbox) ─────────────
  const resolvedGetRowId = useMemo(
    () => getRowId ?? ((row: T) => String((row as Record<string, unknown>).id ?? '')),
    [getRowId],
  )
  const allSmartColumns = useMemo<SmartColumn<T>[]>(() => {
    const idCol: SmartColumn<T> = {
      id: '_id',
      header: 'ID', // Technical column header — keep untranslated; consumers can override via column override
      accessorFn: (row) => resolvedGetRowId(row),
      cell: ({ value }) => (
        <span className="inline-block rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 select-all">
          {String(value).slice(0, 8)}
        </span>
      ),
      sortable: false,
      filterable: false,
      size: 95,
      fixed: true,
    }
    return [idCol, ...userColumns]
  }, [userColumns, resolvedGetRowId])

  const {
    viewMode, changeView,
    allSettings, updateSettings,
    internalPageSize, changePageSize,
    hiddenColumns, toggleColumn, visibleColumns,
    activePopup, setActivePopup, popupAnchor,
    globalSearch, setGlobalSearch, debouncedSearch,
    activeFilterCount,
    filterByGlobalSearch,
    hasIndicator,
    handleHeaderClick,
    openHeaderPopup,
    restoreState,
  } = useTableState(tableId, allSmartColumns, defaultView, viewModes, initialPageSize, prefs, initialHiddenColumns)

  // Pre-compute cell styles map to avoid per-cell getCellStyle() calls in TableView
  const cellStyleMap = useMemo(() => {
    const map: Record<string, import('react').CSSProperties> = {}
    for (const [colId, s] of Object.entries(allSettings)) {
      if (s?.style) map[colId] = getCellStyle(s.style)
    }
    return map
  }, [allSettings])

  // Derive TanStack sorting from settings (multi-sort supporté — Shift+click
  // ajoute un tri secondaire, Ninox/AGGrid pattern). Le server-side (#manualSorting)
  // continue à utiliser le premier tri seulement via onSortChange, car notre API
  // ne prend qu'un sortBy/sortDir pour l'instant.
  const sorting: SortingState = useMemo(() => {
    const sorts: { id: string; desc: boolean }[] = []
    for (const [colId, s] of Object.entries(allSettings)) {
      if (s.sort) sorts.push({ id: colId, desc: s.sort === 'desc' })
    }
    return sorts
  }, [allSettings])

  // Notify parent when sort changes (for server-side sorting)
  // suppressSortRef suppresses the callback on mount and after a view restore
  const suppressSortRef = useRef(true)
  useEffect(() => { suppressSortRef.current = true }, [initialTableState])
  useEffect(() => {
    if (!onSortChange) return
    if (suppressSortRef.current) { suppressSortRef.current = false; return }
    const active = sorting.length > 0 ? sorting[0] : null
    onSortChange(active?.id ?? null, active ? (active.desc ? 'desc' : 'asc') : null)
  }, [sorting]) // eslint-disable-line react-hooks/exhaustive-deps

  // BUG FIX #1: Reset page to 1 when column filters/sort change in manualPagination mode
  const prevSettingsRef = useRef(allSettings)
  useEffect(() => {
    if (!manualPagination || !onPageChange) return
    if (prevSettingsRef.current !== allSettings) {
      prevSettingsRef.current = allSettings
      onPageChange(1)
    }
  }, [allSettings, manualPagination, onPageChange])

  // Recherche côté serveur : auto-fire avec debounce supplémentaire de 150 ms
  // au-dessus du 50 ms client pour éviter de spammer l'API. Total ~200 ms —
  // toujours "instant feel" à l'utilisateur mais une seule requête par burst
  // de frappe. Plus besoin d'appuyer sur Entrée (pattern Airtable/Ninox).
  //
  // Protection contre les parents qui passent `onGlobalSearch` inline (sans
  // useCallback) : on garde la dernière valeur envoyée dans lastServerSearchRef
  // et on n'appelle la callback que si serverSearch a VRAIMENT changé. Sans
  // ça, changer `onGlobalSearch` à chaque render → boucle infinie.
  const [searchPending, setSearchPending] = useState(false)
  const [serverSearch, setServerSearch] = useState(globalSearch)
  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(globalSearch), 200)
    return () => clearTimeout(timer)
  }, [globalSearch])

  const suppressSearchRef = useRef(true)
  const lastServerSearchRef = useRef<string | null>(null)
  useEffect(() => { suppressSearchRef.current = true; lastServerSearchRef.current = null }, [initialTableState])
  useEffect(() => {
    if (!onGlobalSearch) return
    if (suppressSearchRef.current) { suppressSearchRef.current = false; lastServerSearchRef.current = serverSearch; return }
    if (lastServerSearchRef.current === serverSearch) return
    lastServerSearchRef.current = serverSearch
    setSearchPending(true)
    onGlobalSearch(serverSearch)
  }, [serverSearch, onGlobalSearch])

  // Clear pending state when data finishes loading. Fallback timer 1.5 s au
  // cas où le parent ne propage pas le `loading=true` (ex: React Query qui
  // cache une requête) — évite que le spinner reste coincé indéfiniment.
  useEffect(() => {
    if (!loading && searchPending) setSearchPending(false)
  }, [loading, searchPending])
  useEffect(() => {
    if (!searchPending) return
    const t = setTimeout(() => setSearchPending(false), 1500)
    return () => clearTimeout(t)
  }, [searchPending])

  // Load entity column configs from prefs (once on mount, updated by designer save)
  const [entityConfigs, setEntityConfigs] = useState(() => {
    const configs: Record<string, EntityColumnConfig> = {}
    allSmartColumns.forEach((sc) => {
      if (!sc.entityType) return
      const saved = prefs.get<EntityColumnConfig | null>(`entity-template-${sc.entityType}`, null)
      configs[sc.entityType] = saved ?? {
        mainLine: DEFAULT_TEMPLATES[sc.entityType]?.mainLine ?? '',
        subLine: DEFAULT_TEMPLATES[sc.entityType]?.subLine,
        sortField: DEFAULT_TEMPLATES[sc.entityType]?.sortField,
      }
    })
    return configs
  })

  // Build format maps for template resolution
  const entityFormatMaps = useMemo(() => {
    const maps: Record<string, Record<string, string>> = {}
    allSmartColumns.forEach((sc) => {
      if (!sc.entityType || maps[sc.entityType]) return
      const vars = ENTITY_VARIABLES[sc.entityType] ?? []
      const map: Record<string, string> = {}
      vars.forEach(v => { if (v.format) map[v.key] = v.format })
      maps[sc.entityType] = map
    })
    return maps
  }, [allSmartColumns])

  // Convert SmartColumn to TanStack ColumnDef
  const tanstackColumns: ColumnDef<T, unknown>[] = useMemo(
    () =>
      allSmartColumns.map((sc) => {
        const def: ColumnDef<T, unknown> = {
          id: sc.id,
          header: sc.header,
          enableSorting: sc.sortable ?? true,
          enableColumnFilter: sc.filterable ?? true,
          filterFn: smartFilterFn as FilterFn<T>,
          sortingFn: 'nullsLast' as any,
          size: sc.size,
        }

        // Entity columns: apply template-based rendering + sort field
        const ecfg = sc.entityType ? entityConfigs[sc.entityType] : null
        if (sc.entityType && sc.entityAccessor && ecfg) {
          const accessor = sc.entityAccessor
          const fmtMap = entityFormatMaps[sc.entityType] ?? {}
          const sortFieldPath = ecfg.sortField

          // Accessor for sorting — use configured sort field
          ;(def as unknown as Record<string, unknown>).accessorFn = (row: T) => {
            const entity = accessor(row)
            if (!entity) return ''
            if (sortFieldPath) {
              const parts = sortFieldPath.split('.')
              let val: unknown = entity
              for (const p of parts) {
                if (val == null || typeof val !== 'object') return ''
                val = (val as Record<string, unknown>)[p]
              }
              return val ?? ''
            }
            return resolveTemplate(ecfg.mainLine, entity, fmtMap)
          }

          // Cell renderer — use template
          def.cell = (info) => {
            const entity = accessor(info.row.original)
            if (!entity) return <span className="text-slate-400">—</span>
            const mainText = resolveTemplate(ecfg.mainLine, entity, fmtMap)
            const subText = ecfg.subLine ? resolveTemplate(ecfg.subLine, entity, fmtMap) : ''
            const showPhoto = templateHasImageVar(ecfg.mainLine, fmtMap)
              || templateHasImageVar(ecfg.subLine ?? '', fmtMap)
            const imageUrl = showPhoto
              ? (extractImageUrl(ecfg.mainLine, entity, fmtMap)
                ?? extractImageUrl(ecfg.subLine ?? '', entity, fmtMap))
              : null
            const PlaceholderIcon = sc.entityType === 'bien' ? Home
              : sc.entityType === 'contact' || sc.entityType === 'acquereur' ? User
              : ImageIcon
            return (
              <div className="flex items-center gap-2.5">
                {showPhoto && (
                  imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover shrink-0 bg-slate-100 dark:bg-slate-800"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <PlaceholderIcon className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                    </div>
                  )
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{mainText || '—'}</div>
                  {subText && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{subText}</div>}
                </div>
              </div>
            )
          }
        } else {
          // Non-entity columns: standard accessor + cell
          if (sc.accessorKey) {
            (def as unknown as Record<string, unknown>).accessorKey = sc.accessorKey
          } else if (sc.accessorFn) {
            (def as unknown as Record<string, unknown>).accessorFn = sc.accessorFn
          }
          if (sc.cell) {
            const cellRenderer = sc.cell
            def.cell = (info) => cellRenderer({ row: info.row.original, value: info.getValue() })
          }
        }

        return def
      }),
    [allSmartColumns, entityConfigs, entityFormatMaps],
  )

  // ── Scroll mode (global: pagination vs infinite) ──────────
  const [scrollMode, setScrollMode] = useState<'pagination' | 'infinite'>(getScrollMode)

  // Global search filtering — skip client-side when server-side search is active
  const globalFiltered = useMemo(() => onGlobalSearch ? data : filterByGlobalSearch(data), [data, filterByGlobalSearch, onGlobalSearch])

  // Manual column-level filtering (for manualPagination mode where TanStack filters are disabled)
  // BUG FIX: When server-side sort is active (onSortChange provided), skip client-side sort
  // BUG FIX: Column filters only apply client-side filtering on the current page data
  const filteredData = useMemo(() => {
    if (!manualPagination) return globalFiltered
    const activeFilters = Object.entries(allSettings).filter(([, s]) =>
      s.filterValues?.length ||
      s.filterText ||
      s.filterTextOp === 'empty' || s.filterTextOp === 'notEmpty' ||
      s.filterNumberFrom != null || s.filterNumberTo != null ||
      s.filterNumberOp === 'empty' || s.filterNumberOp === 'notEmpty' ||
      s.filterDateFrom || s.filterDateTo,
    )
    if (activeFilters.length === 0) return globalFiltered
    let result = globalFiltered.filter(row => {
      for (const [colId, settings] of activeFilters) {
        const col = allSmartColumns.find(c => c.id === colId)
        if (!col) continue
        const accessor = col.accessorKey
          ? (r: T) => (r as Record<string, unknown>)[col.accessorKey!]
          : col.accessorFn
        if (!accessor) continue
        const raw = accessor(row)
        const rawStr = raw == null ? '' : String(raw)
        // filterValues (checkbox filter) — skip sentinel '__NONE__'
        if (settings.filterValues && settings.filterValues.length > 0) {
          const realValues = settings.filterValues.filter(v => v !== '__NONE__')
          if (realValues.length > 0) {
            if (!realValues.includes(rawStr)) return false
          }
        }
        // filterText avec operateur (contains / equals / starts / ends / empty / notEmpty)
        const textOp = settings.filterTextOp ?? 'contains'
        if (textOp === 'empty' && rawStr !== '') return false
        else if (textOp === 'notEmpty' && rawStr === '') return false
        else if (settings.filterText) {
          const q = settings.filterText.toLowerCase()
          const v = rawStr.toLowerCase()
          if (textOp === 'contains' && !v.includes(q)) return false
          else if (textOp === 'equals' && v !== q) return false
          else if (textOp === 'starts' && !v.startsWith(q)) return false
          else if (textOp === 'ends' && !v.endsWith(q)) return false
        }
        // filterNumber avec operateur (=, ≠, >, ≥, <, ≤, between, empty, notEmpty)
        const numOp = settings.filterNumberOp ?? 'between'
        if (numOp === 'empty' && rawStr !== '') return false
        else if (numOp === 'notEmpty' && rawStr === '') return false
        else if (settings.filterNumberFrom != null || settings.filterNumberTo != null) {
          const n = typeof raw === 'number' ? raw : Number(rawStr)
          if (isNaN(n)) return false
          const from = settings.filterNumberFrom
          const to = settings.filterNumberTo
          if (numOp === 'eq' && from != null && n !== from) return false
          else if (numOp === 'neq' && from != null && n === from) return false
          else if (numOp === 'gt' && from != null && n <= from) return false
          else if (numOp === 'gte' && from != null && n < from) return false
          else if (numOp === 'lt' && from != null && n >= from) return false
          else if (numOp === 'lte' && from != null && n > from) return false
          else if (numOp === 'between') {
            if (from != null && n < from) return false
            if (to != null && n > to) return false
          }
        }
        // filterDateFrom / filterDateTo (date range)
        if (settings.filterDateFrom || settings.filterDateTo) {
          if (settings.filterDateFrom && rawStr < settings.filterDateFrom) return false
          if (settings.filterDateTo && rawStr > settings.filterDateTo) return false
        }
      }
      return true
    })
    // Apply client-side sort ONLY when server-side sort is NOT active
    if (!onSortChange) {
      const sortEntry = Object.entries(allSettings).find(([, s]) => s.sort)
      if (sortEntry) {
        const [sortColId, sortSettings] = sortEntry
        const sortCol = allSmartColumns.find(c => c.id === sortColId)
        if (sortCol) {
          const sortAccessor = sortCol.accessorKey
            ? (r: T) => (r as Record<string, unknown>)[sortCol.accessorKey!]
            : sortCol.accessorFn
          if (sortAccessor) {
            const dir = sortSettings.sort === 'desc' ? -1 : 1
            result = [...result].sort((a, b) => {
              const va = sortAccessor(a)
              const vb = sortAccessor(b)
              const aEmpty = va == null || va === '' || va === '\u2014'
              const bEmpty = vb == null || vb === '' || vb === '\u2014'
              if (aEmpty && bEmpty) return 0
              if (aEmpty) return 1
              if (bEmpty) return -1
              if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
              return String(va).localeCompare(String(vb), 'fr') * dir
            })
          }
        }
      }
    }
    return result
  }, [globalFiltered, allSettings, allSmartColumns, manualPagination])

  // Column ordering state (persisted in localStorage)
  const visibleTanstackCols = useMemo(
    () => tanstackColumns.filter((c) => !hiddenColumns.has(c.id!)),
    [tanstackColumns, hiddenColumns],
  )
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    () => prefs.get<string[]>(`${tableId}-col-order`, visibleTanstackCols.map((c) => c.id!)),
  )

  // Keep column order in sync when columns change
  useEffect(() => {
    const ids = visibleTanstackCols.map((c) => c.id!)
    setColumnOrder((prev) => {
      const existing = prev.filter((id) => ids.includes(id) && id !== '_id')
      const added = ids.filter((id) => !prev.includes(id) && id !== '_id')
      // _id always first
      const rest = [...existing, ...added]
      return ids.includes('_id') ? ['_id', ...rest] : rest
    })
  }, [visibleTanstackCols])

  // Column sizing state (persisted) — strip fixed columns so they always use their defined size
  const fixedColIds = useMemo(() => new Set(allSmartColumns.filter(c => c.fixed).map(c => c.id)), [allSmartColumns])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    const saved = prefs.get<ColumnSizingState>(`${tableId}-col-sizing`, {})
    const cleaned: ColumnSizingState = {}
    for (const [k, v] of Object.entries(saved)) {
      if (!fixedColIds.has(k)) cleaned[k] = v
    }
    return cleaned
  })

  // ── Scroll mode helpers ──────────────────────────────────
  const changeScrollMode = (mode: 'pagination' | 'infinite') => {
    setScrollMode(mode)
    onScrollModeChangeProp?.(mode)
  }

  // ── Expose table state snapshot for external consumers ─────
  useEffect(() => {
    const snapshot: TableStateSnapshot = {
      hiddenColumns: Array.from(hiddenColumns),
      columnOrder,
      allSettings,
      columnSizing,
      pageSize: internalPageSize,
      viewMode,
      filteredRowCount: filteredData.length,
    }
    if (tableStateRef) tableStateRef.current = snapshot
    onTableStateChange?.(snapshot)
  }, [hiddenColumns, columnOrder, allSettings, columnSizing, internalPageSize, viewMode, filteredData.length])

  // ── Restore table state from external snapshot (view switching) ─
  const restoreCountRef = useRef(0)
  const prevInitialRef = useRef<TableStateSnapshot | null>(null)
  useEffect(() => {
    if (!initialTableState || initialTableState === prevInitialRef.current) return
    prevInitialRef.current = initialTableState
    restoreCountRef.current++

    // Restore useTableState-managed state (hiddenColumns, allSettings, pageSize)
    restoreState(initialTableState)

    // Restore SmartDataTable-local state (columnOrder, columnSizing)
    if (initialTableState.columnOrder?.length) {
      setColumnOrder(initialTableState.columnOrder)
      prefs.set(`${tableId}-col-order`, initialTableState.columnOrder)
    }
    if (initialTableState.columnSizing && Object.keys(initialTableState.columnSizing).length) {
      setColumnSizing(initialTableState.columnSizing)
      prefs.set(`${tableId}-col-sizing`, initialTableState.columnSizing)
    }
    // Force table view — card/kanban are out of scope for this package.
    changeView('table')
  }, [initialTableState])

  // TanStack table instance
  const table = useReactTable({
    data: filteredData,
    columns: visibleTanstackCols,
    state: {
      sorting,
      columnOrder,
      columnSizing,
      ...(manualPagination
        ? { pagination: { pageIndex: page - 1, pageSize: internalPageSize } }
        : {}),
    },
    // For client-side pagination, let TanStack manage page state internally
    ...(!manualPagination ? { initialState: { pagination: { pageIndex: 0, pageSize: internalPageSize } } } : {}),
    onColumnSizingChange: (updater) => {
      const raw = typeof updater === 'function' ? updater(columnSizing) : updater
      // Strip fixed columns from sizing
      const next: ColumnSizingState = {}
      for (const [k, v] of Object.entries(raw)) {
        if (!fixedColIds.has(k)) next[k] = v
      }
      setColumnSizing(next)
      prefs.set(`${tableId}-col-sizing`, next)
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnOrder) : updater
      setColumnOrder(next)
      prefs.set(`${tableId}-col-order`, next)
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      // Single-column sort: clear ALL existing sorts, then set the new one
      const newSettings: typeof allSettings = {}
      for (const [k, v] of Object.entries(allSettings)) {
        newSettings[k] = v?.sort ? { ...v, sort: null } : v
      }
      // Take only the last sort entry (in case multi-sort slipped through)
      const active = next.length > 0 ? next[next.length - 1] : null
      if (active) {
        newSettings[active.id] = { ...newSettings[active.id], sort: active.desc ? 'desc' : 'asc' }
      }
      updateSettings(newSettings)
      // Notify parent for server-side sorting
      if (onSortChange) {
        onSortChange(active?.id ?? null, active ? (active.desc ? 'desc' : 'asc') : null)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: enablePagination && !manualPagination ? getPaginationRowModel() : undefined,
    manualPagination,
    manualSorting: !!manualPagination,
    manualFiltering: !!manualPagination,
    enableMultiSort: true,
    isMultiSortEvent: () => true, // tous les onSortingChange acceptent le multi — c'est nous qui contrôlons via Shift+click dans handleHeaderClick.
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    sortingFns: {
      /** Nulls/empty always last regardless of sort direction */
      nullsLast: (rowA, rowB, columnId) => {
        const a = rowA.getValue(columnId)
        const b = rowB.getValue(columnId)
        const aEmpty = a == null || a === '' || a === '—'
        const bEmpty = b == null || b === '' || b === '—'
        if (aEmpty && bEmpty) return 0
        if (!aEmpty && !bEmpty) {
          if (typeof a === 'number' && typeof b === 'number') return a - b
          return String(a).localeCompare(String(b), 'fr')
        }
        // One is empty — TanStack inverts for desc, so we counter-invert
        const isDesc = rowA.getAllCells().find(c => c.column.id === columnId)?.column.getIsSorted() === 'desc'
        if (aEmpty) return isDesc ? -1 : 1
        return isDesc ? 1 : -1
      },
    },
  })

  // When infinite scroll mode is active (client-side), show all rows
  useEffect(() => {
    if (scrollMode === 'infinite' && !manualPagination) {
      table.setPageSize(filteredData.length || 1000)
    }
  }, [scrollMode, filteredData.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply column filters from settings
  useEffect(() => {
    if (manualPagination) {
      table.getAllColumns().forEach((col) => {
        if (col.getFilterValue() !== undefined) col.setFilterValue(undefined)
      })
      return
    }
    Object.entries(allSettings).forEach(([colId, settings]) => {
      const col = table.getColumn(colId)
      if (!col) return
      const hasOpOnly =
        (settings.filterTextOp === 'empty' || settings.filterTextOp === 'notEmpty') ||
        (settings.filterNumberOp === 'empty' || settings.filterNumberOp === 'notEmpty')
      if (settings.filterText || settings.filterValues || settings.filterDateFrom || settings.filterDateTo || settings.filterTimeFrom || settings.filterTimeTo || settings.filterNumberFrom != null || settings.filterNumberTo != null || hasOpOnly) {
        col.setFilterValue({
          filterTextOp: settings.filterTextOp,
          filterText: settings.filterText,
          filterValues: settings.filterValues,
          filterDateFrom: settings.filterDateFrom,
          filterDateTo: settings.filterDateTo,
          filterNumberOp: settings.filterNumberOp,
          filterNumberFrom: settings.filterNumberFrom,
          filterNumberTo: settings.filterNumberTo,
          filterTimeFrom: settings.filterTimeFrom,
          filterTimeTo: settings.filterTimeTo,
        })
      } else {
        col.setFilterValue(undefined)
      }
    })
    table.getAllColumns().forEach((col) => {
      if (!allSettings[col.id] && col.getFilterValue() !== undefined) {
        col.setFilterValue(undefined)
      }
    })
  }, [allSettings, table, manualPagination])

  // BUG FIX #11: totalRows uses server-provided total, not data.length (which is just current page)
  const hasLocalFilters = manualPagination && filteredData.length !== globalFiltered.length
  const totalRows = manualPagination
    ? (hasLocalFilters ? filteredData.length : (total ?? 0))
    : table.getFilteredRowModel().rows.length

  // ── Report filtered row count after TanStack filtering (for pill counts) ──
  useEffect(() => {
    if (!tableStateRef?.current) return
    if (tableStateRef.current.filteredRowCount !== totalRows) {
      tableStateRef.current = { ...tableStateRef.current, filteredRowCount: totalRows }
      onTableStateChange?.(tableStateRef.current)
    }
  }, [totalRows]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection ──────────────────────────────────────────────
  const selection = useSelection(resolvedGetRowId, totalRows)

  // Current page rows for page-level select/deselect
  const pageRows = useMemo(() => table.getRowModel().rows.map((r) => r.original), [table.getRowModel().rows])

  const resolvedEmptyTitle = emptyTitle ?? t('noResults')
  const resolvedAddLabel = addLabel ?? t('addLabel')

  const popupSmartColumn = activePopup ? allSmartColumns.find((c) => c.id === activePopup) : null

  const [filterPopupRect, setFilterPopupRect] = useState<DOMRect | null>(null)
  const selectionActive = enableSelection && selection.state.count > 0
  const allSelectedAcrossPages = selection.state.mode === 'all' && selection.state.excludedIds.size === 0

  // ── Aggregations ──────────────────────────────────────────
  const aggregations = useMemo(
    () => computeAggregations(filteredData, allSmartColumns, allSettings),
    [filteredData, allSmartColumns, allSettings],
  )

  // Subset of data matching current selection (for export)
  const selectedData = useMemo(() => {
    if (!enableSelection || selection.state.count === 0) return []
    return filteredData.filter((row) => selection.isSelected(resolvedGetRowId(row)))
  }, [enableSelection, selection.state, filteredData, resolvedGetRowId, selection.isSelected])

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {enableSelection && selectionActive ? (
          <>
            {/* Selection info — replaces search bar inline */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CheckSquare className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap">
                {t('selection.selected', { count: selection.state.count })}
              </span>
              {!allSelectedAcrossPages && selection.state.count === pageRows.length && totalRows > pageRows.length && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    onClick={selection.selectAll}
                    className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 underline whitespace-nowrap"
                  >
                    {t('selection.selectAllCount', { count: totalRows })}
                  </button>
                </>
              )}
              {allSelectedAcrossPages && totalRows > pageRows.length && (
                <span className="text-xs text-primary-500 dark:text-primary-400 whitespace-nowrap">{t('selection.allPages')}</span>
              )}
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <button
                onClick={selection.clear}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 whitespace-nowrap"
              >
                <X className="h-3.5 w-3.5" />
                {t('selection.deselect')}
              </button>
            </div>
            {/* Built-in export for selection */}
            <ExportDropdown
              onCSV={() => exportCSV(selectedData, allSmartColumns, hiddenColumns, `${tableId}-selection`, { columnOrder, columnSizing })}
              onExcel={() => exportExcel(selectedData, allSmartColumns, hiddenColumns, `${tableId}-selection`, { columnOrder, columnSizing })}
            />
            {/* Consumer-provided selection actions */}
            {selectionActions?.(selection.state)}
          </>
        ) : (
          <>
            <div className="relative flex-1 group/search">
              {searchPending ? (
                <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-500 animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              )}
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder={searchPlaceholder ?? t('search')}
                className="w-full rounded-lg border bg-white py-2 pl-9 pr-8 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => { setGlobalSearch(''); if (onGlobalSearch) { setSearchPending(true); onGlobalSearch('') } }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
                  title={t('clearSearch')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Filter count badge on search input */}
              {activeFilterCount > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    ref={(el) => { if (el) (el as any).__rect = el.getBoundingClientRect() }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setFilterPopupRect(rect)
                      setActivePopup(activePopup === ('__filters' as any) ? null : '__filters' as any)
                    }}
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-[10px] font-bold text-white hover:bg-primary-700 transition-colors"
                    title={t('activeFiltersTitle')}
                  >
                    {activeFilterCount}
                  </button>
                </div>
              )}
            </div>

            {actions}

            <ExportDropdown
              onCSV={() => exportCSV(filteredData, allSmartColumns, hiddenColumns, tableId, { columnOrder, columnSizing })}
              onExcel={() => exportExcel(filteredData, allSmartColumns, hiddenColumns, tableId, { columnOrder, columnSizing })}
            />

            {onAdd && (
              <button
                onClick={onAdd}
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Plus className="h-4 w-4" /> {resolvedAddLabel}
              </button>
            )}
          </>
        )}
      </div>

      {/* Inline filter pills — show when any column or external filters are active */}
      {Object.values(allSettings).some(s => s.sort || s.filterText || s.filterValues?.length || s.filterDateFrom || s.filterDateTo || s.filterNumberFrom != null || s.filterNumberTo != null) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('activeFilters')}</span>
          {/* Column filter pills */}
          {Object.entries(allSettings).map(([colId, s]) => {
            const col = allSmartColumns.find((c) => c.id === colId)
            if (!col) return null
            const parts: string[] = []
            if (s.sort) parts.push(`${t('sort.label')} ${s.sort === 'asc' ? '\u2191' : '\u2193'}`)
            if (s.filterText) parts.push(`"${s.filterText}"`)
            if (s.filterValues && s.filterValues.length > 0) parts.push(t('filterCount', { count: s.filterValues.length }))
            if (s.filterDateFrom && s.filterDateTo) parts.push(t('filterRange', { from: s.filterDateFrom, to: s.filterDateTo }))
            else if (s.filterDateFrom) parts.push(t('filterFrom', { date: s.filterDateFrom }))
            else if (s.filterDateTo) parts.push(t('filterUntil', { date: s.filterDateTo }))
            if (s.filterNumberFrom != null && s.filterNumberTo != null) parts.push(t('filterRange', { from: s.filterNumberFrom, to: s.filterNumberTo }))
            else if (s.filterNumberFrom != null) parts.push(t('filterGreaterEqual', { value: s.filterNumberFrom }))
            else if (s.filterNumberTo != null) parts.push(t('filterLessEqual', { value: s.filterNumberTo }))
            if (parts.length === 0) return null
            return (
              <span key={colId} className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                {col.header}: {parts.join(', ')}
                <button onClick={() => { const next = { ...allSettings }; delete next[colId]; updateSettings(next) }} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          <button
            onClick={() => { updateSettings({}) }}
            className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
          >
            {t('clearAll')}
          </button>
        </div>
      )}


      {/* Table view */}
      {viewMode === 'table' && (
        <>
          <TableView
            table={table}
            tableId={tableId}
            prefs={prefs}
            allSettings={allSettings}
            cellStyleMap={cellStyleMap}
            smartColumns={allSmartColumns}
            hiddenColumns={hiddenColumns}
            toggleColumn={toggleColumn}
            loading={loading}
            onRowClick={onRowClick}
            hasIndicator={hasIndicator}
            handleHeaderClick={handleHeaderClick}
            openHeaderPopup={openHeaderPopup}
            activePopupId={activePopup}
            closeHeaderPopup={() => setActivePopup(null)}
            emptyTitle={resolvedEmptyTitle}
            emptyAction={emptyAction}
            enableSelection={enableSelection}
            getRowId={resolvedGetRowId}
            isSelected={selection.isSelected}
            isPageFullySelected={selection.isPageFullySelected(pageRows)}
            isPagePartiallySelected={selection.isPagePartiallySelected(pageRows)}
            onToggleRow={selection.toggle}
            onTogglePage={() => {
              if (selection.isPageFullySelected(pageRows)) {
                selection.deselectPage(pageRows)
              } else {
                selection.selectPage(pageRows)
              }
            }}
            aggregations={aggregations}
            aggregatedRowCount={filteredData.length}
            aggregatedTotalRows={totalRows}
          />
          {enablePagination && totalRows > 0 && scrollMode === 'pagination' && (
            <SmartPagination
              page={manualPagination ? page : table.getState().pagination.pageIndex + 1}
              pageSize={internalPageSize}
              total={totalRows}
              onPageChange={(p) => {
                if (manualPagination) {
                  onPageChange?.(p)
                } else {
                  table.setPageIndex(p - 1)
                }
              }}
              onPageSizeChange={(s) => {
                changePageSize(s)
                table.setPageSize(s)
                if (manualPagination) {
                  onPageSizeChangeProp?.(s)
                  onPageChange?.(1)
                }
              }}
              showScrollToggle
              onScrollModeChange={(mode) => {
                changeScrollMode(mode)
                // Show all rows when switching to infinite (client-side only)
                if (mode === 'infinite' && !manualPagination) {
                  table.setPageSize(filteredData.length || 1000)
                }
              }}
            />
          )}
          {scrollMode === 'infinite' && totalRows > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-400 pt-2">
              <span>{totalRows} {t('items')}</span>
              <button
                onClick={() => {
                  changeScrollMode('pagination')
                  localStorage.setItem('smartdt-scroll-mode', 'pagination')
                  table.setPageSize(internalPageSize)
                }}
                className="flex items-center gap-1 px-2 py-1 text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t('switchBackToPagination')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Card / Kanban / CardStudio views are intentionally NOT rendered
          by this package — viewMode is forced to 'table'. The deprecated
          props (cardData, kanban, renderCard, etc.) remain on
          SmartDataTableProps for call-site compat but are ignored. */}

      {/* Column popup */}
      {activePopup && popupSmartColumn && (
        <ColumnPopup
          column={popupSmartColumn}
          data={data}
          currentSettings={allSettings[activePopup] ?? {}}
          anchorRect={popupAnchor}
          entityConfig={popupSmartColumn.entityType ? entityConfigs[popupSmartColumn.entityType] : undefined}
          sampleEntity={popupSmartColumn.entityType && popupSmartColumn.entityAccessor && filteredData[0] ? popupSmartColumn.entityAccessor(filteredData[0]) : undefined}
          onEntityConfigSave={(entityType, cfg) => {
            prefs.set(`entity-template-${entityType}`, cfg)
            setEntityConfigs(prev => ({ ...prev, [entityType]: cfg }))
          }}
          onApply={(settings) => {
            // Apply-on-change (Airtable/Ninox pattern) : on ne ferme PAS le
            // popup — l'utilisateur voit l'impact en direct et reste dans
            // le flow. Fermeture explicite via X, Esc, ou click-outside.
            const next = { ...allSettings }
            if (settings.sort) {
              for (const k of Object.keys(next)) {
                if (k !== activePopup && next[k]?.sort) next[k] = { ...next[k], sort: null }
              }
            }
            next[activePopup] = settings
            if (!settings.sort && !settings.filterText && !settings.filterValues && !settings.filterDateFrom && !settings.filterDateTo && !settings.filterTimeFrom && !settings.filterTimeTo && settings.filterNumberFrom == null && settings.filterNumberTo == null && !settings.style && !settings.aggFn) {
              delete next[activePopup]
            }
            updateSettings(next)
          }}
          onClear={() => {
            const next = { ...allSettings }
            delete next[activePopup]
            updateSettings(next)
            // "Effacer tout" est explicite : on garde le popup ouvert pour
            // que l'utilisateur puisse continuer à configurer s'il veut.
          }}
          onHide={() => { toggleColumn(activePopup) }}
          hiddenColumnsList={allSmartColumns.filter(c => hiddenColumns.has(c.id)).map(c => ({ id: c.id, header: c.header }))}
          onAddHiddenColumn={(addId) => {
            // Unhide
            toggleColumn(addId)
            // Position right after the current column in columnOrder
            setColumnOrder(prev => {
              const next = prev.filter(id => id !== addId)
              const anchorIdx = next.indexOf(activePopup)
              if (anchorIdx === -1) { next.push(addId); return next }
              next.splice(anchorIdx + 1, 0, addId)
              return next
            })
          }}
          onClose={() => setActivePopup(null)}
        />
      )}
      {/* Filter pills popover */}
      {activePopup === ('__filters' as any) && filterPopupRect && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setActivePopup(null)} />
          <div
            className="fixed z-[9999] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 min-w-[280px] max-w-[400px]"
            style={{ top: filterPopupRect.bottom + 8, right: Math.max(8, window.innerWidth - filterPopupRect.right) }}
          >
            <FilterPills
              allSettings={allSettings}
              smartColumns={allSmartColumns}
              updateSettings={(next) => { updateSettings(next); if (Object.keys(next).length === 0) setActivePopup(null) }}
            />
          </div>
        </>
      )}
    </div>
  )
}
