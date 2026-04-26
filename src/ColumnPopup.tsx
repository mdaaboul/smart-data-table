import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import {
  ArrowUp, ArrowDown, ArrowDownAZ, ArrowUpAZ, ChevronDown, ChevronRight, Filter,
  Search, Wrench,
  Home, X, RotateCcw, EyeOff, Plus,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { SmartColumn, ColumnSettings, ColumnStyle, AggFn, TextFilterOp, NumberFilterOp } from './types'
import { ColumnStyler } from './ColumnStyler'
import { DatePicker } from '../DatePicker'
import { ENTITY_VARIABLES, DEFAULT_TEMPLATES, type EntityVar } from './entityVariables'
import { resolveTemplate, extractImageUrl, templateHasImageVar, allowedAggFns, AGG_LABELS } from './helpers'

// ─── Airtable-like apply-on-change popup ────────────────────
//
// Spec (octobre 2026) — feedback utilisateur : le popup actuel demandait un
// clic "Appliquer" après chaque changement, tenait dans une seule modale
// tout-en-un, et détectait mal les colonnes de date (multiselect des valeurs
// distinctes au lieu d'un range picker). On refait à la Airtable/Ninox :
//
// - Chaque changement s'applique INSTANTANÉMENT (sort, filter, agg).
// - Texte : debounce léger (200 ms) pour éviter le jank sur grosses tables.
// - Date : range picker + presets (Aujourd'hui, 7j, 30j, Ce mois, Cette année).
// - Auto-détection des colonnes de date si `column.type` n'est pas renseigné.
// - Nombre : range from/to (pour l'instant — les opérateurs viendront au round 2).
// - Enum : multi-checkbox (inchangé, mais apply-on-change).
// - Pas de bouton "Appliquer" : juste "Effacer tout" + Fermer (Esc).

// ─── Accordion ──────────────────────────────────────────────

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

// ─── Date presets helper ────────────────────────────────────

interface DatePreset {
  label: string
  compute: () => { from: string; to: string }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const DATE_PRESETS: DatePreset[] = [
  {
    label: "Aujourd'hui",
    compute: () => { const t = toIsoDate(new Date()); return { from: t, to: t } },
  },
  {
    label: 'Hier',
    compute: () => {
      const d = new Date(); d.setDate(d.getDate() - 1)
      const s = toIsoDate(d); return { from: s, to: s }
    },
  },
  {
    label: '7 derniers jours',
    compute: () => {
      const to = new Date()
      const from = new Date(); from.setDate(from.getDate() - 6)
      return { from: toIsoDate(from), to: toIsoDate(to) }
    },
  },
  {
    label: '30 derniers jours',
    compute: () => {
      const to = new Date()
      const from = new Date(); from.setDate(from.getDate() - 29)
      return { from: toIsoDate(from), to: toIsoDate(to) }
    },
  },
  {
    label: 'Ce mois',
    compute: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: toIsoDate(from), to: toIsoDate(to) }
    },
  },
  {
    label: 'Mois dernier',
    compute: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: toIsoDate(from), to: toIsoDate(to) }
    },
  },
  {
    label: 'Cette année',
    compute: () => {
      const y = new Date().getFullYear()
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    },
  },
  {
    label: "L'année dernière",
    compute: () => {
      const y = new Date().getFullYear() - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    },
  },
]

// Détecte si un champ ressemble à une date. Match ISO (YYYY-MM-DD), locale
// française (DD/MM/YYYY), ou Date valide. Seuil 70% pour tolérer quelques
// lignes vides ou erronées.
function looksLikeDateValues(values: string[]): boolean {
  if (values.length === 0) return false
  const sample = values.slice(0, Math.min(30, values.length))
  const iso = /^\d{4}-\d{2}-\d{2}/
  const fr = /^\d{2}\/\d{2}\/\d{4}/
  let matches = 0
  for (const v of sample) {
    if (iso.test(v) || fr.test(v)) { matches++; continue }
    const t = Date.parse(v)
    if (!isNaN(t) && v.length >= 8) matches++
  }
  return matches / sample.length >= 0.7
}

// ─── ColumnPopup ────────────────────────────────────────────

interface ColumnPopupProps<T> {
  column: SmartColumn<T>
  data: T[]
  currentSettings: ColumnSettings
  /** Appliqué instantanément à chaque changement (apply-on-change). */
  onApply: (settings: ColumnSettings) => void
  /** Efface tous les filtres/styles de la colonne. */
  onClear: () => void
  /** Masque la colonne dans la vue courante. */
  onHide?: () => void
  /** Colonnes masquées disponibles à réinsérer à côté de la colonne active. */
  hiddenColumnsList?: { id: string; header: string }[]
  /** Réinsère une colonne masquée juste après la colonne active. */
  onAddHiddenColumn?: (colId: string) => void
  onClose: () => void
  anchorRect: DOMRect | null
  entityConfig?: { mainLine: string; subLine?: string; sortField?: string }
  sampleEntity?: unknown
  onEntityConfigSave?: (entityType: string, config: { mainLine: string; subLine?: string; sortField?: string }) => void
}

export function ColumnPopup<T>({
  column,
  data,
  currentSettings,
  onApply,
  onClear,
  onHide,
  hiddenColumnsList,
  onAddHiddenColumn,
  onClose,
  anchorRect,
  entityConfig,
  sampleEntity,
  onEntityConfigSave,
}: ColumnPopupProps<T>) {
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnSearch, setAddColumnSearch] = useState('')
  const [sort, setSort] = useState<'asc' | 'desc' | null>(currentSettings.sort ?? null)
  const [filterTextOp, setFilterTextOp] = useState<TextFilterOp>(currentSettings.filterTextOp ?? 'contains')
  const [filterText, setFilterText] = useState(currentSettings.filterText ?? '')
  const [filterDateFrom, setFilterDateFrom] = useState(currentSettings.filterDateFrom ?? '')
  const [filterDateTo, setFilterDateTo] = useState(currentSettings.filterDateTo ?? '')
  const [filterTimeFrom, setFilterTimeFrom] = useState(currentSettings.filterTimeFrom ?? '')
  const [filterTimeTo, setFilterTimeTo] = useState(currentSettings.filterTimeTo ?? '')
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    new Set(currentSettings.filterValues ?? []),
  )
  const [style, setStyle] = useState<ColumnStyle>(currentSettings.style ?? {})
  const [aggFn, setAggFn] = useState<AggFn | null>(currentSettings.aggFn ?? column.footerAgg ?? null)
  const [filterNumberOp, setFilterNumberOp] = useState<NumberFilterOp>(currentSettings.filterNumberOp ?? 'between')
  const [filterNumberFrom, setFilterNumberFrom] = useState<string>(currentSettings.filterNumberFrom != null ? String(currentSettings.filterNumberFrom) : '')
  const [filterNumberTo, setFilterNumberTo] = useState<string>(currentSettings.filterNumberTo != null ? String(currentSettings.filterNumberTo) : '')

  const [optionSearch, setOptionSearch] = useState('')

  // Entity column designer state
  const hasEntityDesigner = !!(column.entityType && entityConfig)
  const entityVars = column.entityType ? (ENTITY_VARIABLES[column.entityType] ?? []) : []
  const entityDefaults = column.entityType ? DEFAULT_TEMPLATES[column.entityType] : undefined
  const [entityMainLine, setEntityMainLine] = useState(entityConfig?.mainLine ?? entityDefaults?.mainLine ?? '')
  const [entitySubLine, setEntitySubLine] = useState(entityConfig?.subLine ?? entityDefaults?.subLine ?? '')
  const [entitySortField, setEntitySortField] = useState(entityConfig?.sortField ?? entityDefaults?.sortField ?? '')
  const [entityActiveInput, setEntityActiveInput] = useState<'main' | 'sub'>('main')
  const entityMainRef = useRef<HTMLInputElement>(null)
  const entitySubRef = useRef<HTMLInputElement>(null)
  const entityGrouped = useMemo((): [string, EntityVar[]][] => {
    const groups = new Map<string, EntityVar[]>()
    entityVars.forEach(v => {
      if (!groups.has(v.group)) groups.set(v.group, [])
      groups.get(v.group)!.push(v)
    })
    return Array.from(groups.entries())
  }, [entityVars])
  const entityFormatMap = useMemo(() => {
    const map: Record<string, string> = {}
    entityVars.forEach(v => { if (v.format) map[v.key] = v.format })
    return map
  }, [entityVars])

  const insertEntityVar = (varKey: string) => {
    const token = `{${varKey}}`
    const ref = entityActiveInput === 'main' ? entityMainRef.current : entitySubRef.current
    const setter = entityActiveInput === 'main' ? setEntityMainLine : setEntitySubLine
    if (ref) {
      const start = ref.selectionStart ?? ref.value.length
      const end = ref.selectionEnd ?? start
      const before = ref.value.slice(0, start)
      const after = ref.value.slice(end)
      const sep = before && !before.endsWith(' ') && !before.endsWith('—') ? ' ' : ''
      const newVal = before + sep + token + after
      setter(newVal)
      requestAnimationFrame(() => {
        const pos = (before + sep + token).length
        ref.setSelectionRange(pos, pos)
        ref.focus()
      })
    } else {
      setter(prev => (prev ? prev + ' ' + token : token))
    }
  }
  const [designerOpen, setDesignerOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Detect unique values from data
  const uniqueValues = useMemo(() => {
    const accessor = column.accessorKey
      ? (row: T) => (row as Record<string, unknown>)[column.accessorKey!]
      : column.accessorFn
    if (!accessor) return []
    const vals = new Map<string, { value: string; count: number }>()
    data.forEach((row) => {
      const raw = accessor(row)
      const v = raw == null ? '' : String(raw)
      if (v) {
        const existing = vals.get(v)
        if (existing) existing.count++
        else vals.set(v, { value: v, count: 1 })
      }
    })
    return Array.from(vals.values()).sort((a, b) => a.value.localeCompare(b.value))
  }, [data, column])

  // Auto-detect column types quand `column.type` n'est pas renseigné :
  //  - date si les valeurs ressemblent à des dates (ISO ou FR)
  //  - nombre si toutes les valeurs non vides sont numériques
  // Prend le `column.type` explicite quand il est fourni — c'est plus fiable
  // que la détection heuristique pour des colonnes sparse ou calculées.
  const isDateColumn = useMemo(() => {
    if (column.type === 'date') return true
    if (column.type === 'time' || column.type === 'number') return false
    if (column.filterOptions) return false
    // Auto-detect from header name or data
    const headerLooksLikeDate = /date|jour|quand/i.test(column.header)
    if (!headerLooksLikeDate) return false
    return looksLikeDateValues(uniqueValues.map(v => v.value))
  }, [column.type, column.filterOptions, column.header, uniqueValues])
  const isTimeColumn = column.type === 'time'

  // Detect number columns: explicit type, has footerAgg, or all non-empty values are numeric
  const isNumberColumn = useMemo(() => {
    if (isDateColumn) return false
    if (column.type === 'number') return true
    if (column.filterOptions) return false
    if (column.footerAgg) return true
    if (uniqueValues.length === 0) return false
    return uniqueValues.every(v => !isNaN(Number(v.value)))
  }, [column.type, column.filterOptions, column.footerAgg, uniqueValues, isDateColumn])

  const filterOptions = useMemo(() => {
    if (column.filterOptions) return column.filterOptions
    return uniqueValues.map((v) => ({ value: v.value, label: v.value }))
  }, [column.filterOptions, uniqueValues])

  const hasExplicitOptions = !!column.filterOptions
  const showCheckboxes =
    (column.filterable ?? true) &&
    !isDateColumn && !isTimeColumn && !isNumberColumn &&
    filterOptions.length > 0 &&
    (hasExplicitOptions || filterOptions.length < 50)
  const needsSearch = filterOptions.length > 10
  const aggOptions = allowedAggFns(column.type ?? (isDateColumn ? 'date' : isNumberColumn ? 'number' : undefined))

  const filteredOptions = useMemo(() => {
    if (!optionSearch) return filterOptions
    const q = optionSearch.toLowerCase()
    return filterOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [filterOptions, optionSearch])

  const allSelected = selectedValues.size === 0

  const toggleValue = (v: string) => {
    setSelectedValues((prev) => {
      const clean = new Set(Array.from(prev).filter(x => filterOptions.some(o => o.value === x)))
      if (clean.size === 0 && prev.size === 0) {
        const next = new Set(filterOptions.map(o => o.value))
        next.delete(v)
        return next
      }
      if (clean.size === 0) return new Set([v])
      const next = new Set(clean)
      if (next.has(v)) next.delete(v); else next.add(v)
      if (next.size === filterOptions.length) return new Set()
      return next
    })
  }

  const selectAll = () => setSelectedValues(new Set())
  const selectNone = () => setSelectedValues(new Set(['__NONE__']))

  const renderOptionLabel = (opt: { value: string; label: string; render?: ReactNode }) => {
    if (opt.render) return opt.render
    if (hasExplicitOptions && column.cell && column.accessorKey) {
      const fakeRow = { [column.accessorKey]: opt.value } as T
      return column.cell({ row: fakeRow, value: opt.value })
    }
    return <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
  }

  // Esc + click-outside
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // ── Build settings from current local state ──────────────
  const isTextFilter = !isDateColumn && !isTimeColumn && !isNumberColumn && !showCheckboxes
  const needsTextInput = isTextFilter && filterTextOp !== 'empty' && filterTextOp !== 'notEmpty'
  const needsNumberValue = isNumberColumn && filterNumberOp !== 'empty' && filterNumberOp !== 'notEmpty'

  const currentSnapshot = useMemo((): ColumnSettings => ({
    sort,
    filterTextOp: isTextFilter && filterTextOp !== 'contains' ? filterTextOp : undefined,
    filterText: isTextFilter && needsTextInput ? (filterText || undefined) : (isTextFilter && !needsTextInput ? '' : undefined),
    filterDateFrom: isDateColumn && filterDateFrom ? filterDateFrom : undefined,
    filterDateTo: isDateColumn && filterDateTo ? filterDateTo : undefined,
    filterTimeFrom: isTimeColumn && filterTimeFrom ? filterTimeFrom : undefined,
    filterTimeTo: isTimeColumn && filterTimeTo ? filterTimeTo : undefined,
    filterNumberOp: isNumberColumn && filterNumberOp !== 'between' ? filterNumberOp : undefined,
    filterNumberFrom: isNumberColumn && needsNumberValue && filterNumberFrom !== '' ? Number(filterNumberFrom) : undefined,
    filterNumberTo: isNumberColumn && needsNumberValue && filterNumberOp === 'between' && filterNumberTo !== '' ? Number(filterNumberTo) : undefined,
    filterValues: (() => {
      if (!showCheckboxes) return undefined
      const real = Array.from(selectedValues).filter(v => filterOptions.some(o => o.value === v))
      if (selectedValues.size > 0 && real.length === 0) return ['__NONE__']
      if (real.length > 0 && real.length < filterOptions.length) return real
      return undefined
    })(),
    style: Object.values(style).some((v) => v && v !== 'transparent') ? style : undefined,
    aggFn: aggFn ?? undefined,
  }), [sort, filterText, filterTextOp, filterDateFrom, filterDateTo, filterTimeFrom, filterTimeTo, filterNumberOp, filterNumberFrom, filterNumberTo, selectedValues, style, aggFn, isDateColumn, isTimeColumn, isNumberColumn, isTextFilter, showCheckboxes, filterOptions, needsTextInput, needsNumberValue])

  // Apply-on-change : le parent se synchronise sur chaque changement. Le
  // debounce 200 ms sur les inputs texte évite de refiltrer la table à
  // chaque touche sur les grosses tables. Les autres changements
  // (boutons, checkboxes, dates) s'appliquent instantanément — c'est ce
  // qu'attendent les utilisateurs Airtable/Ninox.
  const lastSentRef = useRef<string>(JSON.stringify(currentSettings))
  useEffect(() => {
    const serialized = JSON.stringify(currentSnapshot)
    if (serialized === lastSentRef.current) return
    const hasTextDelta =
      (currentSnapshot.filterText ?? '') !== (JSON.parse(lastSentRef.current).filterText ?? '') ||
      (currentSnapshot.filterNumberFrom ?? null) !== (JSON.parse(lastSentRef.current).filterNumberFrom ?? null) ||
      (currentSnapshot.filterNumberTo ?? null) !== (JSON.parse(lastSentRef.current).filterNumberTo ?? null)
    const delay = hasTextDelta ? 200 : 0
    const timer = setTimeout(() => {
      lastSentRef.current = serialized
      onApply(currentSnapshot)
    }, delay)
    return () => clearTimeout(timer)
  }, [currentSnapshot, onApply])

  // Entity config save (on change, debounced)
  useEffect(() => {
    if (!hasEntityDesigner || !column.entityType || !onEntityConfigSave) return
    const timer = setTimeout(() => {
      onEntityConfigSave(column.entityType!, {
        mainLine: entityMainLine,
        subLine: entitySubLine || undefined,
        sortField: entitySortField || undefined,
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [entityMainLine, entitySubLine, entitySortField, hasEntityDesigner, column.entityType, onEntityConfigSave])

  const handleClearAll = () => {
    setSort(null)
    setFilterText(''); setFilterTextOp('contains')
    setFilterDateFrom(''); setFilterDateTo('')
    setFilterTimeFrom(''); setFilterTimeTo('')
    setFilterNumberFrom(''); setFilterNumberTo(''); setFilterNumberOp('between')
    setSelectedValues(new Set())
    setStyle({})
    setAggFn(null)
    onClear()
  }

  const TEXT_OP_OPTIONS: { value: TextFilterOp; label: string }[] = [
    { value: 'contains', label: 'Contient' },
    { value: 'equals', label: 'Est exactement' },
    { value: 'starts', label: 'Commence par' },
    { value: 'ends', label: 'Finit par' },
    { value: 'empty', label: 'Est vide' },
    { value: 'notEmpty', label: "N'est pas vide" },
  ]

  const NUM_OP_OPTIONS: { value: NumberFilterOp; label: string }[] = [
    { value: 'between', label: 'Entre' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'empty', label: 'Est vide' },
    { value: 'notEmpty', label: "N'est pas vide" },
  ]

  const applyPreset = (p: DatePreset) => {
    const { from, to } = p.compute()
    setFilterDateFrom(from); setFilterDateTo(to)
  }

  const popupStyle: React.CSSProperties = {}
  if (anchorRect) {
    popupStyle.position = 'fixed'
    popupStyle.top = anchorRect.bottom + 4
    const totalWidth = designerOpen ? 320 + 8 + 360 : 320
    popupStyle.left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - totalWidth - 8))
    popupStyle.zIndex = 9999
  }

  return (
    <div ref={panelRef} style={popupStyle} className="flex items-start gap-2">
    {/* ── Main popup ── */}
    <div
      className="w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-900"
    >
      {/* ── Header avec nom de colonne + X fermer ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Colonne</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{column.header}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Fermer (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sort */}
      {(column.sortable ?? true) && (
        <div className="px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Trier</p>
          <div className="flex gap-2">
            <button
              onClick={() => setSort(sort === 'asc' ? null : 'asc')}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                sort === 'asc'
                  ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {isNumberColumn ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />}
              {isNumberColumn ? 'Croissant' : 'A → Z'}
            </button>
            <button
              onClick={() => setSort(sort === 'desc' ? null : 'desc')}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                sort === 'desc'
                  ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              {isNumberColumn ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
              {isNumberColumn ? 'Décroissant' : 'Z → A'}
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      {(column.filterable ?? true) && (
        <Accordion title="Filtrer" icon={<Filter className="h-4 w-4" />} defaultOpen>
          {isDateColumn ? (
            <div className="space-y-2 mb-2">
              {/* Presets rapides */}
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-400"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">De</label>
                <div className="flex-1">
                  <DatePicker value={filterDateFrom} onChange={setFilterDateFrom} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">À</label>
                <div className="flex-1">
                  <DatePicker value={filterDateTo} onChange={setFilterDateTo} />
                </div>
              </div>
              {(filterDateFrom || filterDateTo) && (
                <button
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Effacer les dates
                </button>
              )}
            </div>
          ) : isTimeColumn ? (
            <div className="space-y-2 mb-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">De</label>
                <input
                  type="time"
                  value={filterTimeFrom}
                  onChange={(e) => setFilterTimeFrom(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">À</label>
                <input
                  type="time"
                  value={filterTimeTo}
                  onChange={(e) => setFilterTimeTo(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
              </div>
            </div>
          ) : isNumberColumn && !hasExplicitOptions ? (
            <div className="space-y-2 mb-2">
              {/* Dropdown operateur */}
              <select
                value={filterNumberOp}
                onChange={(e) => setFilterNumberOp(e.target.value as NumberFilterOp)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {NUM_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {needsNumberValue && (
                filterNumberOp === 'between' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">Min</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={filterNumberFrom}
                        onChange={(e) => setFilterNumberFrom(e.target.value)}
                        placeholder="Min"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0">Max</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={filterNumberTo}
                        onChange={(e) => setFilterNumberTo(e.target.value)}
                        placeholder="Max"
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={filterNumberFrom}
                    onChange={(e) => setFilterNumberFrom(e.target.value)}
                    placeholder="Valeur"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                )
              )}
            </div>
          ) : (
            <div className="space-y-2 mb-2">
              {/* Dropdown operateur texte */}
              <select
                value={filterTextOp}
                onChange={(e) => setFilterTextOp(e.target.value as TextFilterOp)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {TEXT_OP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {needsTextInput && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder={
                      filterTextOp === 'contains' ? 'Contient…' :
                      filterTextOp === 'equals' ? 'Valeur exacte' :
                      filterTextOp === 'starts' ? 'Commence par…' :
                      filterTextOp === 'ends' ? 'Finit par…' : 'Valeur'
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>
              )}
            </div>
          )}

          {showCheckboxes && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
                    Tous
                  </button>
                  <button onClick={selectNone} className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300">
                    Aucun
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">{filterOptions.length} valeurs</span>
              </div>

              {needsSearch && (
                <div className="relative mb-1.5">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={optionSearch}
                    onChange={(e) => setOptionSearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full rounded border border-slate-200 py-1 pl-6 pr-2 text-xs text-slate-600 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>
              )}

              <div className="max-h-44 overflow-y-auto space-y-0.5">
                {filteredOptions.map((opt) => {
                  const checked = allSelected || selectedValues.has(opt.value)
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(opt.value)}
                        className="rounded border-slate-300 text-primary-600 dark:text-primary-400 focus:ring-primary-500 dark:border-slate-600"
                      />
                      <span className="flex-1 min-w-0">{renderOptionLabel(opt)}</span>
                    </label>
                  )
                })}
                {filteredOptions.length === 0 && (
                  <p className="py-2 text-center text-xs text-slate-400">Aucune valeur correspondante</p>
                )}
              </div>
            </div>
          )}
        </Accordion>
      )}

      {/* Footer aggregation */}
      {aggOptions.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pied de colonne</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setAggFn(null)}
              className={clsx(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                !aggFn
                  ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              Aucun
            </button>
            {aggOptions.map(fn => (
              <button
                key={fn}
                onClick={() => setAggFn(aggFn === fn ? null : fn)}
                className={clsx(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  aggFn === fn
                    ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
                )}
              >
                {AGG_LABELS[fn]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Styling (colors + typography unified) */}
      <ColumnStyler style={style} setStyle={setStyle} />


      {/* Entity column designer — trigger */}
      {hasEntityDesigner && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setDesignerOpen(!designerOpen)}
            className={clsx(
              'flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors',
              designerOpen
                ? 'text-primary-600 bg-primary-50/50 dark:text-primary-400 dark:bg-primary-900/20'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50',
            )}
          >
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Personnaliser l'affichage
            </span>
            <ChevronRight className={clsx('h-4 w-4 transition-transform', designerOpen && 'text-primary-500')} />
          </button>
        </div>
      )}

      {/* Footer — Réinitialiser (gauche) + Ajouter colonne & Masquer (droite) */}
      <div className="relative flex items-center justify-between border-t border-slate-200 px-4 py-2.5 dark:border-slate-700">
        <button
          onClick={handleClearAll}
          className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
        >
          Réinitialiser
        </button>
        <div className="flex items-center gap-2">
          {onAddHiddenColumn && hiddenColumnsList && hiddenColumnsList.length > 0 && (
            <button
              onClick={() => setAddColumnOpen(v => !v)}
              className="inline-flex items-center justify-center h-6 w-6 rounded text-slate-500 hover:text-primary-600 hover:bg-primary-50 dark:text-slate-400 dark:hover:text-primary-400 dark:hover:bg-primary-950/30 transition-colors"
              title="Ajouter une colonne à côté"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {onHide && (
            <button
              onClick={() => { onHide(); onClose() }}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              title="Masquer cette colonne dans la vue courante"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Masquer colonne
            </button>
          )}
        </div>

        {/* Add-column popup */}
        {addColumnOpen && hiddenColumnsList && onAddHiddenColumn && (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setAddColumnOpen(false)} />
            <div className="absolute bottom-full right-10 mb-1 z-[9999] w-60 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <input
                  autoFocus
                  value={addColumnSearch}
                  onChange={e => setAddColumnSearch(e.target.value)}
                  placeholder="Rechercher une colonne..."
                  className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <div className="max-h-[240px] overflow-y-auto py-1">
                {hiddenColumnsList
                  .filter(c => c.header.toLowerCase().includes(addColumnSearch.toLowerCase()))
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onAddHiddenColumn(c.id); setAddColumnOpen(false); setAddColumnSearch('') }}
                      className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Plus className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
                      <span className="truncate">{c.header}</span>
                    </button>
                  ))
                }
                {hiddenColumnsList.filter(c => c.header.toLowerCase().includes(addColumnSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Aucune colonne masquée</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {/* ── Entity designer sub-panel ── */}
    {designerOpen && hasEntityDesigner && (
      <div className="w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Configurer l'affichage</h3>
          <button
            onClick={() => setDesignerOpen(false)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Live preview */}
        {sampleEntity != null && (() => {
          const hasImg = templateHasImageVar(entityMainLine, entityFormatMap)
            || templateHasImageVar(entitySubLine, entityFormatMap)
          const imgUrl = hasImg
            ? (extractImageUrl(entityMainLine, sampleEntity, entityFormatMap)
              ?? extractImageUrl(entitySubLine, sampleEntity, entityFormatMap))
            : null
          return (
            <div className="mx-4 mt-3 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2">Aperçu</p>
              <div className="flex items-center gap-3">
                {hasImg && (
                  imgUrl
                    ? <img src={imgUrl} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0 bg-slate-200 dark:bg-slate-700 shadow-sm" />
                    : <div className="h-11 w-11 rounded-lg shrink-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-sm">
                        <Home className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                      </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {resolveTemplate(entityMainLine, sampleEntity, entityFormatMap) || '—'}
                  </div>
                  {entitySubLine && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {resolveTemplate(entitySubLine, sampleEntity, entityFormatMap)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Template inputs */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Ligne principale
            </label>
            <input
              ref={entityMainRef}
              type="text"
              value={entityMainLine}
              onChange={e => setEntityMainLine(e.target.value)}
              onFocus={() => setEntityActiveInput('main')}
              className={clsx(
                'w-full rounded-lg border px-3 py-2 text-sm font-mono',
                'focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400',
                'dark:bg-slate-800 dark:text-slate-300',
                entityActiveInput === 'main' ? 'border-primary-400 dark:border-primary-500' : 'border-slate-200 dark:border-slate-700',
              )}
              placeholder="{reference} — {typeBien}"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Sous-titre
              <span className="font-normal text-slate-400 text-[10px]">optionnel</span>
            </label>
            <input
              ref={entitySubRef}
              type="text"
              value={entitySubLine}
              onChange={e => setEntitySubLine(e.target.value)}
              onFocus={() => setEntityActiveInput('sub')}
              className={clsx(
                'w-full rounded-lg border px-3 py-2 text-sm font-mono',
                'focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400',
                'dark:bg-slate-800 dark:text-slate-300',
                entityActiveInput === 'sub' ? 'border-primary-400 dark:border-primary-500' : 'border-slate-200 dark:border-slate-700',
              )}
              placeholder="{adresse}"
            />
          </div>
        </div>

        {/* Variable chips */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2.5">
            Cliquer pour insérer un champ
          </p>
          <div className="space-y-2.5">
            {entityGrouped.map(([group, vars]: [string, EntityVar[]]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {vars.map(v => (
                    <button
                      key={v.key}
                      onClick={() => insertEntityVar(v.key)}
                      title={v.key}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-primary-600 dark:hover:text-primary-400"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sort field */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Trier par</label>
          <select
            value={entitySortField}
            onChange={e => setEntitySortField(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="">Par défaut</option>
            {entityVars.filter(v => !v.key.includes('.') || v.format).map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Reset */}
        {entityDefaults && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <button
              onClick={() => { setEntityMainLine(entityDefaults.mainLine); setEntitySubLine(entityDefaults.subLine ?? ''); setEntitySortField(entityDefaults.sortField ?? '') }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Réinitialiser par défaut
            </button>
          </div>
        )}
      </div>
    )}
    </div>
  )
}
