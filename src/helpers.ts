import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import type { FilterFn } from '@tanstack/react-table'
import type { ColumnStyle, AggFn, SmartColumn, AllSettings } from './types'

// ─── Color palette ──────────────────────────────────────────

export const SWATCH_COLORS = [
  'transparent',
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#06b6d4', '#3b82f6', '#6366f1',
  '#a855f7', '#ec4899', '#64748b', '#1e293b',
]

// ─── Export helpers ──────────────────────────────────────────

function extractCellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

interface ExportOptions {
  columnOrder?: string[]
  columnSizing?: Record<string, number>
}

function buildExportData<T>(
  data: T[],
  columns: { id: string; header: string; accessorKey?: string; accessorFn?: (row: T) => unknown }[],
  hiddenCols: Set<string>,
  opts?: ExportOptions,
): { headers: string[]; rows: string[][]; colWidths: number[] } {
  let visibleCols = columns.filter(c => !hiddenCols.has(c.id))
  // Respect column order from table
  if (opts?.columnOrder?.length) {
    const order = opts.columnOrder
    const colMap = new Map(visibleCols.map(c => [c.id, c]))
    const ordered = order.filter(id => colMap.has(id)).map(id => colMap.get(id)!)
    const remaining = visibleCols.filter(c => !order.includes(c.id))
    visibleCols = [...ordered, ...remaining]
  }
  const headers = visibleCols.map(c => c.header)
  const rows = data.map(row =>
    visibleCols.map(col => {
      const accessor = col.accessorKey
        ? (r: T) => (r as Record<string, unknown>)[col.accessorKey!]
        : col.accessorFn
      const val = accessor ? accessor(row) : ''
      return extractCellText(val)
    })
  )
  // Use table column sizing for widths (convert px to ~char width), fallback to content width
  const sizing = opts?.columnSizing ?? {}
  const colWidths = visibleCols.map((c, i) => {
    if (sizing[c.id]) return Math.min(60, Math.max(8, Math.round(sizing[c.id] / 8)))
    const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0)
    return Math.min(40, Math.max(10, Math.max(headers[i].length, maxDataLen) + 2))
  })
  return { headers, rows, colWidths }
}

export function exportCSV<T>(
  data: T[],
  columns: { id: string; header: string; accessorKey?: string; accessorFn?: (row: T) => unknown }[],
  hiddenCols: Set<string>,
  filename: string,
  opts?: ExportOptions,
) {
  const { headers, rows } = buildExportData(data, columns, hiddenCols, opts)
  const csvContent = [
    headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n')
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `${filename}.csv`)
}

export function exportExcel<T>(
  data: T[],
  columns: { id: string; header: string; accessorKey?: string; accessorFn?: (row: T) => unknown }[],
  hiddenCols: Set<string>,
  filename: string,
  opts?: ExportOptions,
) {
  const { headers, rows, colWidths } = buildExportData(data, columns, hiddenCols, opts)
  const wb = XLSX.utils.book_new()
  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = colWidths.map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${filename}.xlsx`)
}

// ─── Smart filter function ──────────────────────────────────

export const smartFilterFn: FilterFn<unknown> = (row, columnId, filterValue) => {
  const {
    filterTextOp, filterText, filterValues, filterDateFrom, filterDateTo,
    filterTimeFrom, filterTimeTo, filterNumberOp, filterNumberFrom, filterNumberTo,
  } = filterValue as {
    filterTextOp?: 'contains' | 'equals' | 'starts' | 'ends' | 'empty' | 'notEmpty'
    filterText?: string
    filterValues?: string[]
    filterDateFrom?: string
    filterDateTo?: string
    filterTimeFrom?: string
    filterTimeTo?: string
    filterNumberOp?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty'
    filterNumberFrom?: number | null
    filterNumberTo?: number | null
  }
  const cellValue = row.getValue(columnId)
  const cellStr = cellValue == null ? '' : String(cellValue)
  const cellLower = cellStr.toLowerCase()

  // Text filter avec operateur
  const op = filterTextOp ?? 'contains'
  if (op === 'empty') {
    if (cellStr !== '') return false
  } else if (op === 'notEmpty') {
    if (cellStr === '') return false
  } else if (filterText) {
    const q = filterText.toLowerCase()
    if (op === 'contains' && !cellLower.includes(q)) return false
    else if (op === 'equals' && cellLower !== q) return false
    else if (op === 'starts' && !cellLower.startsWith(q)) return false
    else if (op === 'ends' && !cellLower.endsWith(q)) return false
  }

  // Value set check (multiselect)
  if (filterValues && filterValues.length > 0) {
    if (!filterValues.includes(cellStr)) return false
  }

  // Date range check
  if (filterDateFrom || filterDateTo) {
    const dateStr = cellValue == null ? '' : String(cellValue).slice(0, 10)
    if (!dateStr) return false
    if (filterDateFrom && dateStr < filterDateFrom) return false
    if (filterDateTo && dateStr > filterDateTo) return false
  }

  // Time range check (compares HH:MM strings)
  if (filterTimeFrom || filterTimeTo) {
    const timeStr = cellValue == null ? '' : String(cellValue).slice(0, 5)
    if (!timeStr) return false
    if (filterTimeFrom && timeStr < filterTimeFrom) return false
    if (filterTimeTo && timeStr > filterTimeTo) return false
  }

  // Number filter avec operateur
  const numOp = filterNumberOp ?? 'between'
  if (numOp === 'empty') {
    if (cellStr !== '') return false
  } else if (numOp === 'notEmpty') {
    if (cellStr === '') return false
  } else if (filterNumberFrom != null || filterNumberTo != null) {
    const n = typeof cellValue === 'number' ? cellValue : Number(cellStr)
    if (isNaN(n)) return false
    if (numOp === 'eq' && filterNumberFrom != null && n !== filterNumberFrom) return false
    else if (numOp === 'neq' && filterNumberFrom != null && n === filterNumberFrom) return false
    else if (numOp === 'gt' && filterNumberFrom != null && n <= filterNumberFrom) return false
    else if (numOp === 'gte' && filterNumberFrom != null && n < filterNumberFrom) return false
    else if (numOp === 'lt' && filterNumberFrom != null && n >= filterNumberFrom) return false
    else if (numOp === 'lte' && filterNumberFrom != null && n > filterNumberFrom) return false
    else if (numOp === 'between') {
      if (filterNumberFrom != null && n < filterNumberFrom) return false
      if (filterNumberTo != null && n > filterNumberTo) return false
    }
  }

  return true
}

// ─── Cell style helpers ─────────────────────────────────────

export function getCellStyle(style: ColumnStyle | undefined): React.CSSProperties {
  if (!style) return {}
  const out: React.CSSProperties = {}
  const bw = style.borderLeftWidth ?? '1px'
  if (style.borderLeft && style.borderLeft !== 'transparent') {
    out.borderLeft = `${bw} solid ${style.borderLeft}`
  }
  if (style.borderRight && style.borderRight !== 'transparent') {
    out.borderRight = `${bw} solid ${style.borderRight}`
  }
  if (style.background && style.background !== 'transparent') {
    out.backgroundColor = style.background + '15'
  }
  if (style.textAlign) out.textAlign = style.textAlign as React.CSSProperties['textAlign']
  return out
}

// ─── Entity template resolver ─────────────────────────────

export function resolvePath(obj: unknown, path: string): unknown {
  let current: unknown = obj
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function formatValue(value: unknown, format?: string): string {
  if (value == null) return ''
  // Coerce string-encoded numbers for numeric formats
  const num = (format === 'currency' || format === 'surface' || format === 'number' || format === 'percentage')
    ? (typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN)
    : NaN
  if (format === 'currency' && !isNaN(num)) {
    return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
  }
  if (format === 'surface' && !isNaN(num)) {
    return num.toLocaleString('fr-FR') + ' m²'
  }
  if (format === 'date' && typeof value === 'string') {
    try {
      return new Date(value).toLocaleDateString('fr-FR')
    } catch { return value }
  }
  if (format === 'boolean') {
    return value ? 'Oui' : 'Non'
  }
  if (format === 'duration' && !isNaN(num)) {
    if (num >= 60) {
      const h = Math.floor(num / 60)
      const m = num % 60
      return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
    }
    return `${num} min`
  }
  if (format === 'rating' && !isNaN(num)) {
    const full = Math.round(Math.min(Math.max(num, 0), 5))
    return '\u2605'.repeat(full) + '\u2606'.repeat(5 - full)
  }
  if (Array.isArray(value)) return value.map(v => humanizeEnum(String(v))).join(', ')
  const str = String(value)
  return humanizeEnum(str)
}

/**
 * Converts UPPER_SNAKE_CASE enum values to "Title case" labels.
 * e.g. "LOCAL_COMMERCIAL" -> "Local commercial", "EN_VENTE" -> "En vente"
 * Strings that are not UPPER_SNAKE_CASE are returned as-is.
 */
function humanizeEnum(value: string): string {
  if (!value || !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(value)) return value
  return value
    .split('_')
    .map((word, i) => i === 0
      ? word.charAt(0) + word.slice(1).toLowerCase()
      : word.toLowerCase()
    )
    .join(' ')
}

/**
 * Resolves a template string like "{reference} — {typeBien}" against an entity object.
 * Image-format variables are excluded from text output (rendered separately).
 */
export function resolveTemplate(
  template: string,
  entity: unknown,
  formatMap?: Record<string, string>,
): string {
  if (!template || entity == null) return ''
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const k = key.trim()
    // Skip image variables — they're rendered as thumbnails, not text
    if (formatMap?.[k] === 'image') return ''
    const value = resolvePath(entity, k)
    if (value == null || value === '') return ''
    return formatValue(value, formatMap?.[k])
  }).replace(/\s*—\s*—\s*/g, ' — ').replace(/^\s*—\s*|\s*—\s*$/g, '').trim()
}

/**
 * Extracts image URLs from a template. Returns the first image variable's URL or null.
 */
export function extractImageUrl(
  template: string,
  entity: unknown,
  formatMap?: Record<string, string>,
): string | null {
  if (!template || entity == null || !formatMap) return null
  const match = template.match(/\{([^}]+)\}/g)
  if (!match) return null
  for (const m of match) {
    const key = m.slice(1, -1).trim()
    if (formatMap[key] === 'image') {
      let url = resolvePath(entity, key)
      if (!url && key.endsWith('Url')) {
        url = resolvePath(entity, key.slice(0, -3))
      }
      if (url && typeof url === 'string' && url.startsWith('http')) return url
    }
  }
  return null
}

/**
 * Checks whether a template references any image-format variable.
 */
export function templateHasImageVar(
  template: string,
  formatMap?: Record<string, string>,
): boolean {
  if (!template || !formatMap) return false
  const match = template.match(/\{([^}]+)\}/g)
  if (!match) return false
  return match.some(m => formatMap[m.slice(1, -1).trim()] === 'image')
}

// ─── Aggregation helpers ──────────────────────────────────

export const AGG_LABELS: Record<AggFn, string> = {
  sum: 'Somme',
  count: 'Total',
  min: 'Min',
  max: 'Max',
  avg: 'Moyenne',
}

/** Which aggregation functions are valid for each column type */
export function allowedAggFns(colType?: string): AggFn[] {
  if (colType === 'number') return ['sum', 'count', 'min', 'max', 'avg']
  if (colType === 'date') return ['count', 'min', 'max']
  return ['count']
}

/** Compute a single aggregation value from numeric data */
function computeAgg(values: number[], fn: AggFn): number | null {
  if (values.length === 0) return null
  switch (fn) {
    case 'count': return values.length
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
  }
}

/** Compute all active aggregations for visible columns */
export function computeAggregations<T>(
  data: T[],
  columns: SmartColumn<T>[],
  settings: AllSettings,
): Record<string, { fn: AggFn; value: number | null }> {
  const result: Record<string, { fn: AggFn; value: number | null }> = {}
  for (const col of columns) {
    const fn = settings[col.id]?.aggFn ?? col.footerAgg ?? null
    if (!fn) continue
    // Extract values via accessor
    const accessor = col.accessorKey
      ? (row: T) => (row as Record<string, unknown>)[col.accessorKey!]
      : col.accessorFn
    if (fn === 'count') {
      if (accessor) {
        let total = 0
        for (const row of data) {
          const v = accessor(row)
          if (Array.isArray(v)) total += v.length
          else if (typeof v === 'number') total += v  // sum numeric values (e.g. array lengths from accessorFn)
          else if (v != null) total += 1
        }
        result[col.id] = { fn, value: total }
      } else {
        result[col.id] = { fn, value: data.length }
      }
      continue
    }
    if (!accessor) { result[col.id] = { fn, value: null }; continue }
    const nums: number[] = []
    for (const row of data) {
      const v = accessor(row)
      if (v != null && typeof v === 'number' && !isNaN(v)) nums.push(v)
      else if (v != null && typeof v === 'string' && col.type === 'date') nums.push(new Date(v).getTime())
    }
    result[col.id] = { fn, value: computeAgg(nums, fn) }
  }
  return result
}

// ─── SmartCard field formatting ────────────────────────────

/**
 * Extended field value formatter for SmartCard.
 * Supports all base formats plus date-relative and percentage.
 */
export function formatFieldValue(value: unknown, format?: string): string {
  if (value == null) return ''
  // Extended formats
  if (format === 'date-relative' && typeof value === 'string') {
    try {
      const d = new Date(value)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffDays = Math.floor(diffMs / 86_400_000)
      if (diffDays === 0) return "Aujourd'hui"
      if (diffDays === 1) return 'Hier'
      if (diffDays < 30) return `Il y a ${diffDays} j`
      if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`
      return `Il y a ${Math.floor(diffDays / 365)} an${Math.floor(diffDays / 365) > 1 ? 's' : ''}`
    } catch { return String(value) }
  }
  if (format === 'date-absolute' && typeof value === 'string') {
    try { return new Date(value).toLocaleDateString('fr-FR') } catch { return value }
  }
  if (format === 'percentage') {
    const n = typeof value === 'number' ? value : parseFloat(String(value))
    if (!isNaN(n)) return n.toLocaleString('fr-FR') + ' %'
  }
  // Delegate to base formatter
  return formatValue(value, format)
}

export function getTypoStyle(style: ColumnStyle | undefined): React.CSSProperties | null {
  if (!style) return null
  const hasTypo =
    (style.fontWeight && style.fontWeight !== '400') ||
    (style.fontStyle && style.fontStyle !== 'normal') ||
    style.fontSize
  if (!hasTypo) return null
  const out: React.CSSProperties = {}
  if (style.fontWeight && style.fontWeight !== '400') out.fontWeight = style.fontWeight
  if (style.fontStyle && style.fontStyle !== 'normal') out.fontStyle = style.fontStyle
  if (style.fontSize === 'S') out.fontSize = '12px'
  else if (style.fontSize === 'L') out.fontSize = '16px'
  return out
}
