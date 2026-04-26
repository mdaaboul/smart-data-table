import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { createPortal } from 'react-dom'
import {
  X, Pencil, Trash2, Plus,
  Building2, Home, Key, MapPin, Euro, Users, FileText, Calendar,
  Phone, Briefcase, TrendingUp, BarChart3, Percent, Shield, Clock,
  Star, Eye, Tag, Landmark, DoorOpen, Ruler, Hammer, Banknote,
  type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import SmartDataTable from './SmartDataTable'
import type { SmartDataTableProps, SmartColumn, TableStateSnapshot } from './types'
import { useSavedViews, type SavedView, type ViewKpi } from '../../../hooks/useSavedViews'
import { useTheme } from '../../../contexts/ThemeContext'

// ─── KPI compute helper ─────────────────────────────────────

/** Format number with regular spaces as thousand separators (French style) */
function fmtNum(n: number): string {
  const s = Math.round(n).toString()
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Compact format for large currency values: 1 200 → 1 200, 62 000 → 62K, 1 500 000 → 1.5M */
function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const m = n / 1_000_000
    return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')) + 'M'
  }
  if (abs >= 10_000) {
    const k = n / 1_000
    return (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')) + 'K'
  }
  return fmtNum(n)
}

function computeKpiValue<T>(kpi: ViewKpi | undefined, data: T[], columns: SmartColumn<T>[], rowCount?: number): string | null {
  const fn = kpi?.fn ?? 'count'  // default to count
  if (fn === 'count') return fmtNum(rowCount ?? data.length)
  if (fn === 'sum' && kpi?.column) {
    const col = columns.find(c => c.id === kpi.column)
    if (!col) return null
    const accessor = col.accessorKey
      ? (row: T) => (row as Record<string, unknown>)[col.accessorKey!]
      : col.accessorFn
    if (!accessor) return null
    const total = data.reduce((sum, row) => {
      const v = accessor(row)
      return sum + (typeof v === 'number' ? v : 0)
    }, 0)
    return fmtNum(total)
  }
  return null
}

/** Detect if a column is likely a currency field */
function isCurrencyColumn<T>(col: SmartColumn<T>): boolean {
  const h = col.header.toLowerCase()
  return col.type === 'number' && (
    h.includes('prix') || h.includes('montant') || h.includes('honoraire') ||
    h.includes('loyer') || h.includes('charge') || h.includes('taxe') ||
    h.includes('net') || h.includes('ht') || h.includes('ttc') ||
    h.includes('budget') || h.includes('apport') || h.includes('credit') ||
    h.includes('€') || (col.footerFormat?.toString().includes('€') ?? false)
  )
}

interface SmartDataTableViewsProps<T> extends SmartDataTableProps<T> {
  entity?: string
  externalFilters?: Record<string, unknown>
  onExternalFiltersChange?: (filters: Record<string, unknown>) => void
}

// ─── Icon registry ──────────────────────────────────────────

const PILL_ICONS: { key: string; Icon: LucideIcon; label: string }[] = [
  { key: 'building2', Icon: Building2, label: 'Immeuble' },
  { key: 'home', Icon: Home, label: 'Maison' },
  { key: 'key', Icon: Key, label: 'Clé' },
  { key: 'mapPin', Icon: MapPin, label: 'Lieu' },
  { key: 'euro', Icon: Euro, label: 'Euro' },
  { key: 'users', Icon: Users, label: 'Contacts' },
  { key: 'fileText', Icon: FileText, label: 'Document' },
  { key: 'calendar', Icon: Calendar, label: 'Agenda' },
  { key: 'phone', Icon: Phone, label: 'Téléphone' },
  { key: 'briefcase', Icon: Briefcase, label: 'Entreprise' },
  { key: 'trendingUp', Icon: TrendingUp, label: 'Tendance' },
  { key: 'barChart3', Icon: BarChart3, label: 'Stats' },
  { key: 'percent', Icon: Percent, label: 'Pourcentage' },
  { key: 'shield', Icon: Shield, label: 'Garantie' },
  { key: 'clock', Icon: Clock, label: 'Délai' },
  { key: 'star', Icon: Star, label: 'Favori' },
  { key: 'eye', Icon: Eye, label: 'Visite' },
  { key: 'tag', Icon: Tag, label: 'Tag' },
  { key: 'landmark', Icon: Landmark, label: 'Notaire' },
  { key: 'doorOpen', Icon: DoorOpen, label: 'Entrée' },
  { key: 'ruler', Icon: Ruler, label: 'Surface' },
  { key: 'hammer', Icon: Hammer, label: 'Travaux' },
  { key: 'banknote', Icon: Banknote, label: 'Paiement' },
]

function getIcon(key?: string): LucideIcon | null {
  if (!key) return null
  return PILL_ICONS.find(i => i.key === key)?.Icon ?? null
}

/** Parse hex color to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Lighten a color by blending with white — used for readable foreground on dark bg */
function lightenForDark(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const lr = Math.round(r + (255 - r) * 0.55)
  const lg = Math.round(g + (255 - g) * 0.55)
  const lb = Math.round(b + (255 - b) * 0.55)
  return `rgb(${lr},${lg},${lb})`
}

// ─── Colors ─────────────────────────────────────────────────

const NO_COLOR = '#94a3b8' // neutral slate used when "no color" is picked

const PILL_COLORS = [
  { value: '', label: 'Aucune' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#10b981', label: 'Vert' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#64748b', label: 'Ardoise' },
]

/** Resolve a view's color — empty string maps to neutral slate */
function resolveColor(c: string): string { return c || NO_COLOR }

const EMPTY_FILTERS: Record<string, unknown> = {}

// ─── Snapshot diff ──────────────────────────────────────────

function isSnapshotDirty(current: TableStateSnapshot | null, saved: TableStateSnapshot): boolean {
  if (!current) return false
  if (current.viewMode !== (saved.viewMode ?? 'table')) return true
  if (current.gridCols !== (saved.gridCols ?? 4)) return true
  if (current.pageSize !== saved.pageSize) return true
  const curHidden = current.hiddenColumns ?? []
  const savHidden = saved.hiddenColumns ?? []
  if (curHidden.length !== savHidden.length) return true
  const curHiddenSet = new Set(curHidden)
  if (savHidden.some(h => !curHiddenSet.has(h))) return true
  const curKeys = Object.keys(current.allSettings)
  const savKeys = Object.keys(saved.allSettings)
  if (curKeys.length !== savKeys.length) return true
  for (const k of curKeys) {
    if (!saved.allSettings[k]) return true
    if (JSON.stringify(current.allSettings[k]) !== JSON.stringify(saved.allSettings[k])) return true
  }
  const curOrder = current.columnOrder ?? []
  const savOrder = saved.columnOrder ?? []
  if (curOrder.length !== savOrder.length || curOrder.some((c, i) => c !== savOrder[i])) return true
  const curSizing = current.columnSizing ?? {}
  const savSizing = saved.columnSizing ?? {}
  const curSizeKeys = Object.keys(curSizing)
  const savSizeKeys = Object.keys(savSizing)
  if (curSizeKeys.length !== savSizeKeys.length) return true
  for (const k of curSizeKeys) { if (curSizing[k] !== savSizing[k]) return true }
  if (current.cardLayout || saved.cardLayout) {
    if (!current.cardLayout || !saved.cardLayout) return true
    if (JSON.stringify(current.cardLayout) !== JSON.stringify(saved.cardLayout)) return true
  }
  return false
}

function areExternalFiltersDirty(
  current: Record<string, unknown>,
  saved: Record<string, unknown>,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved)
}

// ─── Pill Creation / Edit Popup ─────────────────────────────

interface PillPopupProps {
  initial?: { name: string; color: string; kpi?: ViewKpi }
  columns: { id: string; header: string; type?: string; isCurrency: boolean }[]
  onSave: (data: { name: string; color: string; kpi?: ViewKpi }) => void
  onDelete?: () => void
  onClose: () => void
}

function PillPopup({ initial, columns, onSave, onDelete, onClose }: PillPopupProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? '')
  const [icon, setIcon] = useState(initial?.kpi?.icon ?? '')
  const [kpiFn, setKpiFn] = useState<'count' | 'sum'>(initial?.kpi?.fn ?? 'count')
  const [kpiColumn, setKpiColumn] = useState(initial?.kpi?.column ?? '')
  const [kpiUnit, setKpiUnit] = useState(initial?.kpi?.unit ?? '')
  const [showIcons, setShowIcons] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Defer heavy content (icons, KPI fields) to next frame so the shell renders instantly
  const [ready, setReady] = useState(false)
  useEffect(() => { requestAnimationFrame(() => setReady(true)) }, [])

  // Auto-set unit to € when selecting a currency column for sum
  const handleColumnChange = (colId: string) => {
    setKpiColumn(colId)
    const col = columns.find(c => c.id === colId)
    if (col?.isCurrency && !kpiUnit) setKpiUnit('€')
  }

  const handleFnChange = (fn: 'count' | 'sum') => {
    setKpiFn(fn)
    if (fn !== 'sum') setKpiColumn('')
  }

  // Numeric columns for sum
  const numericColumns = columns.filter(c => c.type === 'number')

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const kpi: ViewKpi = {
      fn: kpiFn,
      column: kpiColumn || undefined,
      unit: kpiUnit || undefined,
      icon: icon || undefined,
    }
    onSave({ name: name.trim(), color, kpi })
  }

  const SelectedIcon = getIcon(icon)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div ref={ref} className="w-[380px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {initial ? 'Modifier la vue' : 'Nouvelle vue'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Nom</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nom de la vue..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400"
              required
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Couleur</label>
            <div className="flex flex-wrap gap-1.5">
              {PILL_COLORS.map(c => (
                <button
                  key={c.value || '_none'}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={clsx(
                    'w-7 h-7 rounded-full transition-all',
                    !c.value && 'border-2 border-dashed border-slate-300 dark:border-slate-500',
                    color === c.value ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-110' : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: c.value || 'transparent', ...(color === c.value && c.value ? { ringColor: c.value } : {}) }}
                />
              ))}
            </div>
          </div>

          {/* Icon — deferred render */}
          {ready ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Icône</label>
              <button
                type="button"
                onClick={() => setShowIcons(!showIcons)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors w-full"
              >
                {SelectedIcon ? <SelectedIcon className="h-4 w-4" style={{ color: resolveColor(color) }} /> : <span className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />}
                <span className="flex-1 text-left">{icon ? PILL_ICONS.find(i => i.key === icon)?.label ?? icon : 'Choisir une icône...'}</span>
              </button>
              <div className={clsx('mt-1.5 grid grid-cols-8 gap-1 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 max-h-28 overflow-y-auto', !showIcons && 'hidden')}>
                <button
                  type="button"
                  onClick={() => { setIcon(''); setShowIcons(false) }}
                  className={clsx('p-1.5 rounded-md transition-colors', !icon ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-slate-200 dark:hover:bg-slate-700')}
                  title="Aucune"
                >
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {PILL_ICONS.map(i => (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => { setIcon(i.key); setShowIcons(false) }}
                    title={i.label}
                    className={clsx('p-1.5 rounded-md transition-colors', icon === i.key ? 'bg-primary-100 dark:bg-primary-900/30' : 'hover:bg-slate-200 dark:hover:bg-slate-700')}
                  >
                    <i.Icon className="h-3.5 w-3.5" style={{ color: resolveColor(color) }} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          )}

          {/* KPI fields — deferred render */}
          {ready ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Valeur</label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={kpiFn}
                    onChange={e => handleFnChange(e.target.value as 'count' | 'sum')}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                  >
                    <option value="count">Nombre de lignes</option>
                    <option value="sum">Somme de...</option>
                  </select>
                {kpiFn === 'sum' && (
                  <select
                    value={kpiColumn}
                    onChange={e => handleColumnChange(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
                  >
                    <option value="">Colonne...</option>
                    {numericColumns.map(c => (
                      <option key={c.id} value={c.id}>{c.header}</option>
                    ))}
                  </select>
                )}
              </div>
              <input
                value={kpiUnit}
                onChange={e => setKpiUnit(e.target.value)}
                placeholder="Unité (ex: €, m², %)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
              />
            </div>
          </div>
          ) : (
            <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-1">
            {initial && onDelete && (
              <button
                type="button"
                onClick={() => { onDelete(); onClose() }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/40 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </button>
            )}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40 transition-colors">
              {initial ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

// ─── Apply a view's saved filters to data for KPI count ─────

function applyViewFilters<T>(data: T[], view: SavedView, columns: SmartColumn<T>[]): T[] {
  const settings = view.tableState.allSettings
  if (!settings) return data
  const activeFilters = Object.entries(settings).filter(([, s]) =>
    (s.filterValues && s.filterValues.length > 0) || s.filterText || s.filterNumberFrom != null || s.filterNumberTo != null || s.filterDateFrom || s.filterDateTo
  )
  if (activeFilters.length === 0) return data
  return data.filter(row => {
    for (const [colId, s] of activeFilters) {
      const col = columns.find(c => c.id === colId)
      if (!col) continue
      const accessor = col.accessorKey
        ? (r: T) => (r as Record<string, unknown>)[col.accessorKey!]
        : col.accessorFn
      if (!accessor) continue
      const raw = accessor(row)
      if (s.filterValues && s.filterValues.length > 0) {
        const v = raw == null ? '' : String(raw)
        if (!s.filterValues.includes(v)) return false
      }
      if (s.filterText) {
        const v = raw == null ? '' : String(raw).toLowerCase()
        if (!v.includes(s.filterText.toLowerCase())) return false
      }
      if (s.filterNumberFrom != null || s.filterNumberTo != null) {
        const n = typeof raw === 'number' ? raw : Number(raw)
        if (isNaN(n)) return false
        if (s.filterNumberFrom != null && n < s.filterNumberFrom) return false
        if (s.filterNumberTo != null && n > s.filterNumberTo) return false
      }
      if (s.filterDateFrom || s.filterDateTo) {
        const v = raw == null ? '' : String(raw)
        if (s.filterDateFrom && v < s.filterDateFrom) return false
        if (s.filterDateTo && v > s.filterDateTo) return false
      }
    }
    return true
  })
}

// ─── Main Component ─────────────────────────────────────────

export default function SmartDataTableViews<T>({
  entity,
  externalFilters = EMPTY_FILTERS,
  onExternalFiltersChange,
  ...tableProps
}: SmartDataTableViewsProps<T>) {
  const resolvedEntity = entity ?? tableProps.tableId
  const { resolved: themeMode } = useTheme()
  const isDark = themeMode === 'dark'
  const tableStateRef = useRef<TableStateSnapshot | null>(null)
  const [initialTableState, setInitialTableState] = useState<TableStateSnapshot | null>(null)
  const {
    views,
    activeViewId,
    setActiveViewId,
    createView,
    updateView,
    deleteView,
    resetToDefaults,
  } = useSavedViews(resolvedEntity)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInput, setResetInput] = useState('')

  // ── Dirty tracking + auto-save ────────────────────────────
  const [liveSnapshot, setLiveSnapshot] = useState<TableStateSnapshot | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  // Suppress auto-save until timestamp expires (covers multi-emit restoration)
  const suppressAutoSaveUntilRef = useRef(Date.now() + 2000)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTableStateChange = useCallback((snapshot: TableStateSnapshot) => {
    setLiveSnapshot(snapshot)
  }, [])

  const activeView = useMemo(() => views.find(v => v.id === activeViewId), [views, activeViewId])
  const activeViewIdRef = useRef(activeViewId)
  activeViewIdRef.current = activeViewId
  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView
  const externalFiltersRef = useRef(externalFilters)
  externalFiltersRef.current = externalFilters
  const updateViewRef = useRef(updateView)
  updateViewRef.current = updateView

  // Flush the current pending state to the active view immediately (no debounce).
  // Used before switching tabs, so viewMode/gridCols/column changes aren't lost.
  const flushPendingSave = useCallback(async () => {
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    const viewId = activeViewIdRef.current
    if (!viewId || !tableStateRef.current) return
    const view = activeViewRef.current
    if (!view) return
    const snapshotDirty = isSnapshotDirty(tableStateRef.current, view.tableState)
    const filtersDirty = areExternalFiltersDirty(externalFiltersRef.current, view.externalFilters)
    if (!snapshotDirty && !filtersDirty) return
    const savedExternalFilters = { ...externalFiltersRef.current }
    const settings = tableStateRef.current.allSettings ?? {}
    for (const [colId, s] of Object.entries(settings)) {
      if (s.filterValues && s.filterValues.length > 0) {
        savedExternalFilters[`_${colId}`] = s.filterValues.length === 1 ? s.filterValues[0] : s.filterValues
      }
    }
    await updateViewRef.current(viewId, { tableState: tableStateRef.current, externalFilters: savedExternalFilters }, { skipInvalidate: true })
  }, [])

  useEffect(() => {
    if (Date.now() < suppressAutoSaveUntilRef.current) return
    const view = activeViewRef.current
    const viewId = activeViewIdRef.current
    if (!viewId || !view || !liveSnapshot) return
    const snapshotDirty = isSnapshotDirty(liveSnapshot, view.tableState)
    const filtersDirty = areExternalFiltersDirty(externalFiltersRef.current, view.externalFilters)
    if (!snapshotDirty && !filtersDirty) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    // Structural changes (view mode, grid cols, hidden cols, column order) are
    // intentional one-off clicks — save fast so users don't lose them when
    // navigating away. Settings/filter typing still get the longer debounce.
    const savedViewMode = view.tableState.viewMode ?? 'table'
    const savedGridCols = view.tableState.gridCols ?? 4
    const structural =
      liveSnapshot.viewMode !== savedViewMode ||
      liveSnapshot.gridCols !== savedGridCols ||
      (liveSnapshot.hiddenColumns ?? []).length !== (view.tableState.hiddenColumns ?? []).length ||
      (liveSnapshot.columnOrder ?? []).join('|') !== (view.tableState.columnOrder ?? []).join('|')
    const delay = structural ? 250 : 1500
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!tableStateRef.current || !activeViewIdRef.current) return
      // Reconstruct external filters from column filterValues so server counts endpoint works
      const savedExternalFilters = { ...externalFiltersRef.current }
      const settings = tableStateRef.current.allSettings ?? {}
      for (const [colId, s] of Object.entries(settings)) {
        if (s.filterValues && s.filterValues.length > 0) {
          savedExternalFilters[`_${colId}`] = s.filterValues.length === 1 ? s.filterValues[0] : s.filterValues
        }
      }
      await updateViewRef.current(activeViewIdRef.current, { tableState: tableStateRef.current, externalFilters: savedExternalFilters }, { skipInvalidate: true })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
    }, delay)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [liveSnapshot, externalFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-view KPI values ──

  // Fetch counts for ALL views from server (lightweight endpoint)
  const { data: viewCounts } = useQuery<Record<string, number>>({
    queryKey: ['view-counts', resolvedEntity],
    queryFn: () => api.get(`/saved-filters/counts?entity=${resolvedEntity}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: views.length > 0,
  })

  // Derive formatted KPI values from server counts + live active view count
  const viewKpiCache = useMemo(() => {
    const cache: Record<string, string> = {}
    if (viewCounts) {
      for (const [viewId, count] of Object.entries(viewCounts)) {
        const view = views.find(v => v.id === viewId)
        const isCurrencySum = view?.kpi?.fn === 'sum' && (view.kpi.unit === '€' || view.kpi.unit === '$')
        cache[viewId] = isCurrencySum ? fmtCompact(count) : fmtNum(count)
      }
    }
    // Active pill: prefer server count (authoritative), only use snapshot if no server count
    // The snapshot filteredRowCount is stale during view transitions
    if (activeViewId && !viewCounts?.[activeViewId] && viewCounts?.[activeViewId] !== 0) {
      const activeView = views.find(v => v.id === activeViewId)
      if (activeView?.kpi?.fn !== 'sum') {
        const count = tableProps.data?.length ?? 0
        cache[activeViewId] = fmtNum(count)
      }
    }
    return cache
  }, [viewCounts, views, activeViewId, tableProps.total, tableProps.data, liveSnapshot])

  // ── Popup state ───────────────────────────────────────────
  const [showPopup, setShowPopup] = useState<'create' | SavedView | null>(null)

  // Memoize columns descriptor for popup (avoid re-creating on every parent render)
  const popupColumns = useMemo(() =>
    (tableProps.columns ?? []).map(c => ({
      id: c.id,
      header: c.header,
      type: c.type,
      isCurrency: isCurrencyColumn(c),
    })),
    [tableProps.columns],
  )

  const handleCreate = async (data: { name: string; color: string; kpi?: ViewKpi }) => {
    if (!tableStateRef.current) return
    await createView(data.name, data.color, tableStateRef.current, externalFilters, data.kpi)
    setShowPopup(null)
  }

  const handleEdit = async (data: { name: string; color: string; kpi?: ViewKpi }) => {
    if (!showPopup || showPopup === 'create') return
    await updateView(showPopup.id, { name: data.name, color: data.color, kpi: data.kpi })
    setShowPopup(null)
  }

  // ── Switching pills ───────────────────────────────────────
  // Map external filter keys (_statut, _avancement, etc.) to column IDs
  const externalFilterToColumnId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const col of tableProps.columns ?? []) {
      // Convention: _statut → column 'statut', _avancement → column 'avancement'
      if (col.filterOptions && col.filterOptions.length > 0) {
        map[`_${col.id}`] = col.id
      }
    }
    return map
  }, [tableProps.columns])

  const switchToView = useCallback(async (view: SavedView) => {
    // Flush any pending changes on the current view before switching — otherwise
    // the pending timer gets cancelled and the user loses their last tweak.
    await flushPendingSave()
    suppressAutoSaveUntilRef.current = Date.now() + 2000
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    setActiveViewId(view.id)
    // Preserve saved column filters (they ARE the view state)
    const cleanState = { ...view.tableState }
    const settings = { ...(cleanState.allSettings ?? {}) }
    // Inject external filters as column filterValues (only if not already saved in allSettings)
    for (const [key, val] of Object.entries(view.externalFilters ?? {})) {
      if (key.startsWith('__') || key === '_search' || key === '_sortBy' || key === '_sortDir') continue
      const colId = externalFilterToColumnId[key]
      if (!colId || val === undefined || val === null || val === '') continue
      // Only inject if the column doesn't already have saved filter values
      if (!settings[colId]?.filterValues) {
        const filterValues = Array.isArray(val) ? val as string[] : [String(val)]
        settings[colId] = { ...(settings[colId] ?? {}), filterValues }
      }
    }
    cleanState.allSettings = settings
    setInitialTableState(cleanState)
    // Still pass external filters for components that use them
    const cleanFilters = { ...view.externalFilters }
    delete cleanFilters._search
    delete cleanFilters._sortBy
    delete cleanFilters._sortDir
    onExternalFiltersChange?.(cleanFilters)
    setJustSaved(false)
  }, [setActiveViewId, onExternalFiltersChange, externalFilterToColumnId])

  const appliedInitial = useRef(false)
  useEffect(() => {
    if (appliedInitial.current || views.length === 0) return
    appliedInitial.current = true
    // On initial page load, strip column-level filters from the first view
    // so the user always sees all data. Column filters are transient — they
    // should not carry over between sessions via the saved view state.
    const first = views[0]
    const cleanState = { ...first.tableState }
    const settings = { ...(cleanState.allSettings ?? {}) }
    // Inject external filters on initial load (only if not already saved)
    for (const [key, val] of Object.entries(first.externalFilters ?? {})) {
      if (key.startsWith('__') || key === '_search' || key === '_sortBy' || key === '_sortDir') continue
      const colId = externalFilterToColumnId[key]
      if (!colId || val === undefined || val === null || val === '') continue
      if (!settings[colId]?.filterValues) {
        const filterValues = Array.isArray(val) ? val as string[] : [String(val)]
        settings[colId] = { ...(settings[colId] ?? {}), filterValues }
      }
    }
    cleanState.allSettings = settings
    suppressAutoSaveUntilRef.current = Date.now() + 3000
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    setActiveViewId(first.id)
    setInitialTableState(cleanState)
    // Strip transient keys from initial load too
    const cleanInitialFilters = { ...first.externalFilters }
    delete cleanInitialFilters._search
    delete cleanInitialFilters._sortBy
    delete cleanInitialFilters._sortDir
    onExternalFiltersChange?.(cleanInitialFilters)
    setJustSaved(false)
  }, [views]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag-to-reorder ───────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, viewId: string) => {
    setDragId(viewId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', viewId)
  }

  const handleDragOver = (e: React.DragEvent, viewId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (viewId !== dragOverId) setDragOverId(viewId)
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const fromIdx = views.findIndex(v => v.id === dragId)
    const toIdx = views.findIndex(v => v.id === targetId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return }
    // Reorder: update positions for all affected views
    const reordered = [...views]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    // Batch update positions
    await Promise.all(reordered.map((v, i) => {
      if (v.position !== i) return updateView(v.id, { position: i })
      return Promise.resolve()
    }))
    setDragId(null)
    setDragOverId(null)
  }

  const handleDragEnd = () => { setDragId(null); setDragOverId(null) }

  // ── Pill strip ref for scroll ─────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null)

  return (
    <div>
      {/* ── Pill strip ──────────────────────────────────────── */}
      {views.length === 0 && (
        <div className="flex items-center gap-3 pb-3">
          <button
            onClick={async () => { await resetToDefaults() }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            Initialiser les vues
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">Créer les vues par défaut pour cette section</span>
        </div>
      )}
      {/* ── Tab bar (Airtable/Ninox style) ──────────────────── */}
      <div
        ref={stripRef}
        className="flex items-center gap-0 overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-4 -mx-1 px-1 scrollbar-thin scrollbar-thumb-slate-300/50 dark:scrollbar-thumb-slate-600/50 scrollbar-track-transparent"
      >
        {views.map((view) => {
          const isActive = activeViewId === view.id
          const PillIcon = getIcon(view.kpi?.icon)
          const isDragOver = dragOverId === view.id && dragId !== view.id
          // Active view: live count for count KPIs, server-computed cache for sum KPIs
          // Inactive views: cached value from server counts endpoint
          const displayValue = viewKpiCache[view.id]
            ?? (isActive ? fmtNum(tableProps.total ?? (tableProps.data?.length ?? 0)) : '')
          const displayUnit = view.kpi?.unit ?? ''
          const tabColor = resolveColor(view.color)
          const tabColorDisplay = isDark ? lightenForDark(tabColor) : tabColor
          const [r, g, b] = hexToRgb(tabColor)

          return (
            <div
              key={view.id}
              draggable
              onDragStart={e => handleDragStart(e, view.id)}
              onDragOver={e => handleDragOver(e, view.id)}
              onDrop={e => handleDrop(e, view.id)}
              onDragEnd={handleDragEnd}
              onClick={() => switchToView(view)}
              className={clsx(
                'group/tab relative shrink-0 flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors -mb-px border-b-2 border-transparent',
                dragId === view.id && 'opacity-30',
                isDragOver && 'bg-slate-100 dark:bg-slate-800',
                isActive
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium',
                justSaved && isActive && 'animate-pill-glow',
              )}
              style={isActive ? { borderBottomColor: tabColorDisplay } : undefined}
            >
              {/* Optional icon */}
              {PillIcon && (
                <PillIcon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: isActive ? tabColorDisplay : undefined }}
                />
              )}

              {/* Name */}
              <span className="text-sm whitespace-nowrap leading-none">
                {view.name}
              </span>

              {/* Value badge */}
              {displayValue !== '' && displayValue != null && (
                <span
                  className={clsx(
                    'text-[11px] font-semibold whitespace-nowrap leading-none rounded-full px-1.5 py-0.5 tabular-nums',
                  )}
                  style={isActive ? {
                    color: isDark ? lightenForDark(tabColor) : tabColor,
                    backgroundColor: isDark ? `rgba(${r},${g},${b},0.28)` : `rgba(${r},${g},${b},0.12)`,
                  } : {
                    color: isDark ? '#94a3b8' : '#64748b',
                    backgroundColor: isDark ? 'rgba(51,65,85,0.4)' : 'rgba(241,245,249,1)',
                  }}
                >
                  {displayValue}{displayUnit ? <span className="ml-0.5 opacity-70">{displayUnit}</span> : null}
                </span>
              )}

              {/* Edit button on hover (active only) */}
              {isActive && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setShowPopup(view) }}
                  className="shrink-0 p-0.5 -mr-1 rounded opacity-0 group-hover/tab:opacity-60 hover:!opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity"
                  title="Modifier la vue"
                >
                  <Pencil className="h-3 w-3" style={{ color: tabColorDisplay }} />
                </button>
              )}
            </div>
          )
        })}

        {/* ── [+] Create tab ── */}
        <button
          onClick={() => setShowPopup('create')}
          title="Nouvelle vue"
          className="shrink-0 flex items-center justify-center h-8 w-8 ml-1 text-slate-400 dark:text-slate-500 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {/* ── Ré-initialiser (discrete) ── */}
        <button
          onClick={() => { setShowResetConfirm(true); setResetInput('') }}
          className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2 py-1"
          title="Réinitialiser les vues par défaut"
        >
          Ré-initialiser
        </button>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl dark:shadow-slate-900/50 p-5 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Réinitialiser les vues</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Cela supprimera toutes vos vues personnalisées et les remplacera par les vues par défaut.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Tapez "<strong className="text-slate-700 dark:text-slate-200">réinitialiser</strong>" pour confirmer :</p>
            <input
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-red-500/20 mb-3"
              placeholder="réinitialiser"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowResetConfirm(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors">Annuler</button>
              <button
                onClick={async () => { setShowResetConfirm(false); await resetToDefaults() }}
                disabled={resetInput.toLowerCase().trim() !== 'réinitialiser'}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-30 transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SmartDataTable ──────────────────────────────────── */}
      <SmartDataTable<T>
        {...tableProps}
        tableStateRef={tableStateRef}
        initialTableState={initialTableState}
        onTableStateChange={handleTableStateChange}
      />

      {/* ── Pill popup ─────────────────────────────────────── */}
      {showPopup && (
        <PillPopup
          initial={showPopup !== 'create' ? { name: showPopup.name, color: showPopup.color, kpi: showPopup.kpi } : undefined}
          columns={popupColumns}
          onSave={showPopup === 'create' ? handleCreate : handleEdit}
          onDelete={showPopup !== 'create' ? () => { deleteView(showPopup.id); setShowPopup(null) } : undefined}
          onClose={() => setShowPopup(null)}
        />
      )}
    </div>
  )
}
