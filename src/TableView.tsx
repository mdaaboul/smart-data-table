import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  flexRender,
  type Table as TanstackTable,
  type Header,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, Filter, ChevronRight, ChevronUp, ChevronDown, Settings, Check, Eye, EyeOff, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'
import type { AllSettings, SmartColumn, AggFn } from './types'
import type { PrefsAPI } from './useTableState'
import { getTypoStyle, getAggLabel } from './helpers'
// EmptyState lives at the bottom of this file as a small inline component —
// the package intentionally does not depend on the consumer's design system.
import { CellContextMenu, type CellContextTarget } from './CellContextMenu'

interface TableViewProps<T> {
  table: TanstackTable<T>
  tableId: string
  prefs: PrefsAPI
  allSettings: AllSettings
  cellStyleMap: Record<string, import('react').CSSProperties>
  smartColumns: SmartColumn<T>[]
  hiddenColumns: Set<string>
  toggleColumn: (colId: string) => void
  loading: boolean
  onRowClick?: (row: T) => void
  hasIndicator: (colId: string) => boolean
  handleHeaderClick: (colId: string, e: React.MouseEvent<HTMLDivElement>) => void
  /** Ouvre le popup filtre/style pour une colonne (depuis le chevron ou right-click). */
  openHeaderPopup: (colId: string, anchor: DOMRect) => void
  /** Id de la colonne dont le popup est actuellement ouvert (pour toggle). */
  activePopupId?: string | null
  closeHeaderPopup?: () => void
  emptyTitle: string
  emptyAction?: { label: string; onClick: () => void }
  // Selection
  enableSelection?: boolean
  getRowId?: (row: T) => string
  isSelected?: (id: string) => boolean
  isPageFullySelected?: boolean
  isPagePartiallySelected?: boolean
  onToggleRow?: (id: string) => void
  onTogglePage?: () => void
  aggregations?: Record<string, { fn: AggFn; value: number | null }>
  /** Number of rows used for the aggregation (e.g. filtered data length). */
  aggregatedRowCount?: number
  /** Total rows across all pages (if paginated). When greater than aggregatedRowCount, the
   * footer shows "Somme · N / TOTAL" so the user understands the sum only covers the loaded rows. */
  aggregatedTotalRows?: number
}

export function TableView<T>({
  table,
  tableId,
  prefs,
  allSettings,
  cellStyleMap,
  smartColumns,
  hiddenColumns,
  toggleColumn,
  loading,
  onRowClick,
  hasIndicator,
  handleHeaderClick,
  openHeaderPopup,
  activePopupId,
  closeHeaderPopup,
  emptyTitle,
  emptyAction,
  enableSelection,
  getRowId,
  isSelected,
  isPageFullySelected: pageFullSel,
  isPagePartiallySelected: pagePartialSel,
  onToggleRow,
  onTogglePage,
  aggregations,
  aggregatedRowCount,
  aggregatedTotalRows,
}: TableViewProps<T>) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  const rows = table.getRowModel().rows
  const skeletonRows = useMemo(() => Array.from({ length: 5 }, (_, i) => i), [])
  const isResizing = table.getState().columnSizingInfo.isResizingColumn

  // ── Fit columns toggle (default ON so the table always fills its container —
  // columns are dispatched proportionally across the available width, the
  // settings cog stays anchored at the right edge, and the user can flip into
  // horizontal-scroll mode via the cog dropdown if a column needs more room).
  // Per-column resizes still take precedence: explicit col.getSize() values
  // come from columnSizing prefs and are honored by the colgroup widths even
  // when fitColumns is true.
  const [fitColumns, setFitColumns] = useState(
    () => prefs.get<boolean>(`${tableId}-fit-cols`, true),
  )
  const toggleFitColumns = useCallback(() => {
    setFitColumns(prev => {
      const next = !prev
      prefs.set(`${tableId}-fit-cols`, next)
      return next
    })
  }, [tableId, prefs])

  // ── Settings cog dropdown ─────────────────────────────────
  const [cogOpen, setCogOpen] = useState(false)
  const [cogRect, setCogRect] = useState<DOMRect | null>(null)
  const cogRef = useRef<HTMLDivElement>(null)
  const cogBtnRef = useRef<HTMLButtonElement>(null)

  // ── First-time tooltip for cog ────────────────────────────
  const [showCogHint, setShowCogHint] = useState(
    () => !prefs.get<boolean>('smartdt-cog-used', false),
  )
  const dismissCogHint = useCallback(() => {
    setShowCogHint(false)
    prefs.set('smartdt-cog-used', true)
  }, [prefs])


  useEffect(() => {
    if (!cogOpen) return
    const handler = (e: MouseEvent) => {
      if (cogRef.current && !cogRef.current.contains(e.target as Node)) setCogOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [cogOpen])

  // ── Column reorder via drag-and-drop ──────────────────────
  const [dragColId, setDragColId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)

  const handleDragStart = useCallback((colId: string, e: React.DragEvent) => {
    dragRef.current = colId
    setDragColId(colId)
    e.dataTransfer.effectAllowed = 'move'
    const ghost = document.createElement('div')
    ghost.className = 'px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold shadow-lg'
    ghost.textContent = table.getColumn(colId)?.columnDef.header as string ?? colId
    ghost.style.position = 'absolute'
    ghost.style.top = '-1000px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }, [table])

  const handleDragOver = useCallback((colId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragRef.current && dragRef.current !== colId) {
      setDropTarget(colId)
    }
  }, [])

  const handleDrop = useCallback((targetColId: string, e: React.DragEvent) => {
    e.preventDefault()
    const sourceColId = dragRef.current
    if (!sourceColId || sourceColId === targetColId) {
      setDragColId(null)
      setDropTarget(null)
      return
    }
    const currentOrder = table.getState().columnOrder.length
      ? [...table.getState().columnOrder]
      : table.getAllLeafColumns().map(c => c.id)
    const fromIdx = currentOrder.indexOf(sourceColId)
    const toIdx = currentOrder.indexOf(targetColId)
    if (fromIdx === -1 || toIdx === -1) return
    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(toIdx, 0, sourceColId)
    table.setColumnOrder(currentOrder)
    setDragColId(null)
    setDropTarget(null)
  }, [table])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
    setDragColId(null)
    setDropTarget(null)
  }, [])

  // ── Resize handler wrapper ────────────────────────────────
  const onResizeStart = useCallback((header: Header<T, unknown>, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    header.getResizeHandler()(e as any)
  }, [])

  // ── Compute total table width when not fitting ────────────
  const totalWidth = useMemo(() => {
    return table.getVisibleLeafColumns().reduce((sum, col) => sum + col.getSize(), 0)
  }, [table.getVisibleLeafColumns(), table.getState().columnSizing])

  const ACTIONS_COL_W = 44
  const CHECK_COL_W = enableSelection ? 40 : 0

  // ── Scroll-up indicator ──────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [scrolledDown, setScrolledDown] = useState(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => setScrolledDown(el.scrollTop > 8)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // ── Keyboard navigation (Airtable/Ninox pattern) ─────────
  //
  // Quand le tableau a le focus (click ou tabIndex) :
  //  - ArrowUp/Down : déplace le curseur de ligne
  //  - Enter : ouvre la ligne focus (si onRowClick)
  //  - Escape : efface le focus
  //  - Space : toggle la sélection de la ligne focus (si enableSelection)
  //  - Home/End : aller à la première/dernière ligne
  //  - PageUp/Down : saut de 10 lignes
  //
  // Focus visible via un anneau coloré sur la ligne. Les flèches ne prennent
  // effet que si le container (ou ses enfants non-input) a le focus — pour
  // que la frappe dans un input ne soit pas détournée.
  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null)
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      // Ne pas intercepter si la cible est un champ de saisie
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // On ne veut pas détourner toutes les flèches de la page — on exige que
      // l'utilisateur ait soit cliqué dans le tableau (focusedRowIdx set), soit
      // que le focus soit dans le container. Sinon on ne fait rien.
      const active = document.activeElement
      const focusInTable = el === active || el.contains(active as Node | null)
      if (focusedRowIdx == null && !focusInTable) return
      const total = rows.length
      if (total === 0) return
      const cur = focusedRowIdx ?? -1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedRowIdx(Math.min(total - 1, cur + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedRowIdx(Math.max(0, cur - 1))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setFocusedRowIdx(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setFocusedRowIdx(total - 1)
      } else if (e.key === 'PageDown') {
        e.preventDefault()
        setFocusedRowIdx(Math.min(total - 1, cur + 10))
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        setFocusedRowIdx(Math.max(0, cur - 10))
      } else if (e.key === 'Escape') {
        setFocusedRowIdx(null)
      } else if (e.key === 'Enter' && cur >= 0 && onRowClick) {
        e.preventDefault()
        onRowClick(rows[cur].original)
      } else if (e.key === ' ' && cur >= 0 && enableSelection && onToggleRow && getRowId) {
        e.preventDefault()
        onToggleRow(getRowId(rows[cur].original))
      }
    }
    // On écoute sur `document` plutôt que sur le container : le container n'est
    // pas toujours `activeElement` (click sur une ligne ne le focus pas), donc
    // l'écouteur local ne déclencherait jamais. La garde focusedRowIdx + contains
    // ci-dessus évite d'intercepter les flèches en dehors du tableau.
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [rows, focusedRowIdx, onRowClick, enableSelection, onToggleRow, getRowId])

  // Reset focus quand la data change (nouvelle page / filtre)
  useEffect(() => { setFocusedRowIdx(null) }, [rows.length])

  // ── Right-click cell context menu ─────────────────────────
  const [cellContext, setCellContext] = useState<CellContextTarget<T> | null>(null)

  const hasAggregations = aggregations && Object.keys(aggregations).length > 0 && rows.length > 0

  return (
    <div className="relative">
    <div
      ref={scrollContainerRef}
      role="region"
      aria-label={t('table.ariaLabel')}
      className={clsx(
        'relative rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        'overflow-y-auto max-h-[calc(100vh-280px)]',
        fitColumns ? 'overflow-x-hidden' : 'overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent',
        isResizing && 'select-none cursor-col-resize',
      )}
      tabIndex={0}
    >
      <table
        className="text-sm w-full"
        style={{
          tableLayout: 'fixed',
          borderCollapse: 'separate',
          borderSpacing: 0,
          ...(!fitColumns ? { width: totalWidth + ACTIONS_COL_W + CHECK_COL_W, minWidth: totalWidth + ACTIONS_COL_W + CHECK_COL_W } : undefined),
        }}
      >
        <colgroup>
          {enableSelection && <col style={{ width: CHECK_COL_W }} />}
          {table.getVisibleLeafColumns().map((col) => (
            <col key={col.id} style={{ width: col.getSize() }} />
          ))}
          <col style={{ width: ACTIONS_COL_W }} />
        </colgroup>
        <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgb(226,232,240)] dark:shadow-[0_1px_0_0_rgb(51,65,85)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="bg-slate-50 dark:bg-slate-800"
            >
              {/* Checkbox header */}
              {enableSelection && (
                <th className="w-[40px] px-2 py-3 text-center bg-slate-50 dark:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={!!pageFullSel}
                    ref={(el) => { if (el) el.indeterminate = !!pagePartialSel }}
                    onChange={() => onTogglePage?.()}
                    aria-label={t('table.selectAllAria')}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-600 dark:checked:bg-primary-500 dark:focus:ring-primary-400 cursor-pointer"
                  />
                </th>
              )}

              {headerGroup.headers.map((header) => {
                const colId = header.column.id
                const smartCol = smartColumns.find(c => c.id === colId)
                const isFixed = smartCol?.fixed ?? false
                const isActive = hasIndicator(colId)
                const sortDir = allSettings[colId]?.sort
                const isDragging = dragColId === colId
                const isDropping = dropTarget === colId

                return (
                  <th
                    key={header.id}
                    draggable={!isFixed}
                    onDragStart={isFixed ? undefined : (e) => handleDragStart(colId, e)}
                    onDragOver={(e) => handleDragOver(colId, e)}
                    onDrop={(e) => handleDrop(colId, e)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={() => { if (dropTarget === colId) setDropTarget(null) }}
                    aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : undefined}
                    className={clsx(
                      'group relative px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400',
                      !allSettings[colId]?.style?.textAlign && 'text-left',
                      'transition-colors duration-150 cursor-grab active:cursor-grabbing',
                      'hover:bg-slate-100/50 dark:hover:bg-slate-700/30',
                      isDragging && 'opacity-40',
                      isDropping && 'bg-primary-50 dark:bg-primary-900/20',
                    )}
                    style={{
                      width: header.getSize(),
                      ...(cellStyleMap[colId] ?? {}),
                    }}
                  >
                    {isDropping && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary-500 z-10" />
                    )}

                    {header.isPlaceholder ? null : (
                      <div
                        className={clsx(
                          'group/header flex items-center cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300 min-w-0 relative',
                          isActive && 'text-primary-600 dark:text-primary-400',
                          allSettings[colId]?.style?.textAlign === 'center' && 'justify-center',
                          allSettings[colId]?.style?.textAlign === 'right' && 'justify-end',
                        )}
                        /* Click gauche = cycle tri direct (handleHeaderClick cycle). */
                        onClick={(e) => {
                          // Ignorer si on clique sur le chevron ou l'icône filtre
                          if ((e.target as HTMLElement).closest('[data-header-menu-trigger]')) return
                          handleHeaderClick(colId, e)
                        }}
                        /* Right-click = ouvre popup filtre/style (Airtable pattern). */
                        onContextMenu={(e) => {
                          e.preventDefault()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          openHeaderPopup(colId, rect)
                        }}
                        title={t('table.headerSortHint')}
                      >
                        <span className="truncate">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {/* Indicateurs tri + filtre actif — multi-sort affiche
                            un petit badge de position (1, 2, 3...) quand plusieurs
                            colonnes sont triées (pattern Ninox/AGGrid). */}
                        {(sortDir || isActive) && (
                          <span className="ml-1 flex shrink-0 items-center gap-0.5">
                            {sortDir === 'asc' && <ArrowUp className="h-3 w-3 text-primary-600 dark:text-primary-400" />}
                            {sortDir === 'desc' && <ArrowDown className="h-3 w-3 text-primary-600 dark:text-primary-400" />}
                            {sortDir && (() => {
                              const sortedCols = Object.entries(allSettings)
                                .filter(([, s]) => s.sort)
                                .map(([k]) => k)
                              if (sortedCols.length <= 1) return null
                              const pos = sortedCols.indexOf(colId) + 1
                              return (
                                <span className="inline-flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary-500 px-0.5 text-[9px] font-bold text-white">
                                  {pos}
                                </span>
                              )
                            })()}
                            {isActive && !sortDir && <Filter className="h-3 w-3 text-primary-500 dark:text-primary-300" />}
                          </span>
                        )}
                        {/* Chevron "menu colonne" — toujours visible si filtre actif, sinon au hover */}
                        <button
                          type="button"
                          data-header-menu-trigger
                          onClick={(e) => {
                            e.stopPropagation()
                            if (activePopupId === colId && closeHeaderPopup) {
                              closeHeaderPopup()
                              return
                            }
                            const rect = (e.currentTarget.closest('th') as HTMLElement).getBoundingClientRect()
                            openHeaderPopup(colId, rect)
                          }}
                          aria-label={t('table.columnOptions')}
                          className={clsx(
                            'ml-auto shrink-0 rounded p-0.5 transition-opacity',
                            'opacity-0 group-hover/header:opacity-100 focus:opacity-100',
                            (isActive || activePopupId === colId) && 'opacity-100',
                            activePopupId === colId
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                              : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                          )}
                          title={t('table.filterAggregateStyle')}
                        >
                          <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', activePopupId === colId && 'rotate-180')} />
                        </button>
                      </div>
                    )}

                    {/* Resize handle — hidden for fixed columns */}
                    {!isFixed && <div
                      onMouseDown={(e) => onResizeStart(header, e)}
                      onTouchStart={(e) => onResizeStart(header, e)}
                      onDoubleClick={() => header.column.resetSize()}
                      className={clsx(
                        'absolute right-0 top-0 h-full w-4 -mr-2 z-20',
                        'cursor-col-resize select-none touch-none',
                        'flex items-center justify-center',
                        'group/resize',
                      )}
                    >
                      <div
                        className={clsx(
                          'h-2/3 w-px rounded-full transition-all duration-150',
                          header.column.getIsResizing()
                            ? 'w-0.5 bg-primary-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]'
                            : 'bg-transparent group-hover/resize:bg-slate-300 dark:group-hover/resize:bg-slate-600 group-hover/resize:w-0.5',
                        )}
                      />
                    </div>}
                  </th>
                )
              })}

              {/* ── Sticky actions header (cog) ── */}
              <th
                className="sticky right-0 z-30 w-[44px] bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 px-0 py-3"
              >
                <div ref={cogRef} className="flex items-center justify-center">
                  {/* First-time hint tooltip */}
                  {showCogHint && !cogOpen && (
                    <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 z-40 flex items-center animate-bounce-gentle">
                      <span className="whitespace-nowrap rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-amber-400 dark:text-slate-900">
                        {t('table.customizeColumns')}
                      </span>
                      <span className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-amber-500 dark:border-l-amber-400 shrink-0" />
                    </div>
                  )}
                  <button
                    ref={cogBtnRef}
                    onClick={() => {
                      dismissCogHint()
                      if (!cogOpen && cogBtnRef.current) setCogRect(cogBtnRef.current.getBoundingClientRect())
                      setCogOpen(!cogOpen)
                    }}
                    className={clsx(
                      'p-1 rounded-md transition-colors',
                      showCogHint && !cogOpen
                        ? 'text-amber-500 dark:text-amber-400 ring-2 ring-amber-300 dark:ring-amber-500/50 bg-amber-50 dark:bg-amber-900/40'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
                    )}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                  {cogOpen && cogRect && (
                    <div
                      className="fixed w-60 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
                      style={{ top: cogRect.bottom + 4, right: window.innerWidth - cogRect.right, zIndex: 9999 }}
                    >
                      {/* Fit toggle */}
                      <button
                        onClick={toggleFitColumns}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <div className={clsx(
                          'flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0',
                          fitColumns
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-slate-300 dark:border-slate-600',
                        )}>
                          {fitColumns && <Check className="h-3 w-3" />}
                        </div>
                        {t('table.fitToWidth')}
                      </button>

                      {/* Column visibility */}
                      <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('table.columns')}</p>
                        <div className="space-y-0.5">
                          {smartColumns.map((col) => {
                            const visible = !hiddenColumns.has(col.id)
                            return (
                              <button
                                key={col.id}
                                onClick={() => toggleColumn(col.id)}
                                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
                              >
                                {visible ? (
                                  <Eye className="h-3.5 w-3.5 text-primary-500 shrink-0" />
                                ) : (
                                  <EyeOff className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                                )}
                                <span className={clsx(
                                  'text-left truncate',
                                  visible ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-400',
                                )}>
                                  {col.header}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </th>
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading
            ? skeletonRows.map((i) => (
                <tr key={i}>
                  {enableSelection && (
                    <td className="w-[40px] px-2 py-3 text-center">
                      <div className="h-4 w-4 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    </td>
                  )}
                  {table.getVisibleFlatColumns().map((col) => (
                    <td key={col.id} className="px-4 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 w-[44px] bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800" />
                </tr>
              ))
            : rows.map((row, rowIdx) => {
                const stripeBg = rowIdx % 2 === 0
                  ? 'bg-white dark:bg-slate-900'
                  : 'bg-slate-50/70 dark:bg-slate-800/30'
                const rowId = enableSelection && getRowId ? getRowId(row.original) : ''
                const rowChecked = enableSelection && isSelected ? isSelected(rowId) : false
                const isFocused = focusedRowIdx === rowIdx
                const rowBg = rowChecked
                  ? 'bg-primary-50 dark:bg-primary-950/40'
                  : isFocused
                    ? 'bg-primary-50/60 dark:bg-primary-950/20'
                    : stripeBg
                return (
                  <tr
                    key={row.id}
                    onClick={() => { setFocusedRowIdx(rowIdx); onRowClick?.(row.original) }}
                    className={clsx(
                      'transition-colors duration-100 group/row',
                      rowBg,
                      isFocused && 'ring-1 ring-primary-400 ring-inset',
                      onRowClick && 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-700/50',
                    )}
                  >
                    {/* Row checkbox */}
                    {enableSelection && (
                      <td
                        className={clsx(
                          'w-[40px] px-2 py-3 text-center',
                          rowBg,
                          rowChecked && 'border-l-2 border-l-primary-500',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={rowChecked}
                          onChange={() => onToggleRow?.(rowId)}
                          aria-label={t('selection.selectRowAriaLabel')}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-600 dark:checked:bg-primary-500 dark:focus:ring-primary-400 cursor-pointer"
                        />
                      </td>
                    )}

                    {row.getVisibleCells().map((cell) => {
                      const typo = getTypoStyle(allSettings[cell.column.id]?.style)
                      const content = flexRender(cell.column.columnDef.cell, cell.getContext())
                      const smartCol = smartColumns.find(c => c.id === cell.column.id)
                      return (
                        <td
                          key={cell.id}
                          onContextMenu={(e) => {
                            if (!smartCol) return
                            e.preventDefault()
                            e.stopPropagation()
                            setCellContext({
                              x: e.clientX,
                              y: e.clientY,
                              row: row.original,
                              column: smartCol,
                              cellValue: cell.getValue(),
                            })
                          }}
                          className={clsx(
                            'overflow-hidden px-4 py-3 text-slate-700 dark:text-slate-300',
                            dragColId === cell.column.id && 'opacity-40',
                          )}
                          style={{
                            maxWidth: cell.column.getSize(),
                            ...(cellStyleMap[cell.column.id] ?? {}),
                          }}
                        >
                          <div
                            className={clsx(
                              'truncate',
                              typo?.fontWeight && 'col-typo-weight',
                              typo?.fontStyle && 'col-typo-style',
                            )}
                            style={typo ?? undefined}
                          >
                            {content}
                          </div>
                        </td>
                      )
                    })}

                    {/* ── Sticky chevron cell ── */}
                    <td
                      className={clsx(
                        'sticky right-0 z-10 w-[44px] border-l border-slate-100 dark:border-slate-800 px-0 py-3',
                        rowBg,
                        onRowClick && 'group-hover/row:bg-blue-50/50 dark:group-hover/row:bg-slate-700/50',
                      )}
                    >
                      {onRowClick && (
                        <div className="flex items-center justify-center">
                          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover/row:text-slate-500 dark:group-hover/row:text-slate-400 transition-colors" />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
        </tbody>
        {/* ── Footer aggregation row (inside table for perfect alignment) ── */}
        {hasAggregations && (
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-slate-50 dark:bg-slate-800">
              {enableSelection && <td className="w-[40px] px-2 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-600" />}
              {table.getVisibleLeafColumns().map((col) => {
                const agg = aggregations[col.id]
                const sc = smartColumns.find(c => c.id === col.id)
                return (
                  <td
                    key={col.id}
                    className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-600"
                    style={cellStyleMap[col.id] ?? {}}
                  >
                    {agg ? (
                      <div className="flex flex-col">
                        <span
                          className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-400 font-medium leading-tight"
                          title={
                            aggregatedTotalRows != null && aggregatedRowCount != null && aggregatedTotalRows > aggregatedRowCount
                              ? t('footer.computedHint', { loaded: aggregatedRowCount, total: aggregatedTotalRows })
                              : undefined
                          }
                        >
                          {getAggLabel(agg.fn, t)}
                          {aggregatedRowCount != null && aggregatedTotalRows != null && aggregatedTotalRows > aggregatedRowCount && (
                            <span className="ml-1 text-slate-500 dark:text-slate-300 normal-case tracking-normal">
                              · {aggregatedRowCount}/{aggregatedTotalRows}
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {agg.value == null
                            ? '\u2014'
                            : agg.fn === 'count'
                              ? agg.value.toLocaleString('fr-FR')
                              : sc?.footerFormat
                                ? sc.footerFormat(agg.value)
                                : sc?.type === 'date'
                                  ? new Date(agg.value).toLocaleDateString('fr-FR')
                                  : agg.fn === 'avg'
                                    ? agg.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
                                    : agg.value.toLocaleString('fr-FR')
                          }
                        </span>
                      </div>
                    ) : null}
                  </td>
                )
              })}
              <td className="sticky right-0 z-10 w-[44px] bg-slate-50 dark:bg-slate-800 border-l border-slate-100 dark:border-slate-800 border-t border-t-slate-300 dark:border-t-slate-600" />
            </tr>
          </tfoot>
        )}
      </table>

      {!loading && rows.length === 0 && (
        <EmptyState
          title={emptyTitle}
          action={
            emptyAction ? (
              <button
                onClick={emptyAction.onClick}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                {emptyAction.label}
              </button>
            ) : undefined
          }
        />
      )}

    </div>

    {/* Right-click context menu sur cellule — Airtable/Ninox pattern */}
    <CellContextMenu
      target={cellContext}
      onClose={() => setCellContext(null)}
      onOpenRow={onRowClick}
      onHideColumn={toggleColumn}
      onCopyRow={(row) => {
        // Copie TSV (tab-separated) : compatible Excel/Sheets en colle.
        const line = smartColumns
          .filter(c => !hiddenColumns.has(c.id))
          .map((c) => {
            const accessor = c.accessorKey
              ? (r: T) => (r as Record<string, unknown>)[c.accessorKey!]
              : c.accessorFn
            const v = accessor ? accessor(row) : ''
            return v == null ? '' : String(v).replace(/\t/g, ' ').replace(/\n/g, ' ')
          })
          .join('\t')
        navigator.clipboard.writeText(line).catch(() => {})
      }}
    />

    {/* Scroll-up indicator — full-width gradient band below header */}
    {scrolledDown && rows.length > 0 && (
      <div
        onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        className="absolute left-[1px] right-[10px] top-[48px] z-30 h-8 flex items-start justify-center cursor-pointer bg-gradient-to-b from-white/80 via-white/40 to-transparent dark:from-slate-900/80 dark:via-slate-900/40 dark:to-transparent"
      >
        <span className="flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          <ChevronUp className="h-3 w-3" />
          {t('scrollUp')}
        </span>
      </div>
    )}
    </div>
  )
}

// ─── Inline EmptyState ─────────────────────────────────────
//
// Minimal "no rows" placeholder. Kept inline so the package does not
// depend on the consumer's design system. `action` is passed as a
// pre-rendered ReactNode (typically a styled button) by the caller —
// see the call site near the empty-rows tbody guard above.

function EmptyState({ icon: Icon, title, action }: { icon?: any; title: string; action?: import('react').ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-slate-300 dark:text-slate-600" />}
      <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
      {action}
    </div>
  )
}
