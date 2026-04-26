import type { MutableRefObject, ReactNode } from 'react'
import type { FilterDef } from '../FilterPanel'

// ─── Column definition ──────────────────────────────────────

export interface SmartColumn<T> {
  id: string
  header: string
  accessorKey?: string
  accessorFn?: (row: T) => unknown
  cell?: (info: { row: T; value: unknown }) => ReactNode
  size?: number
  type?: 'text' | 'date' | 'number' | 'time'
  filterOptions?: { value: string; label: string; render?: ReactNode }[]
  sortable?: boolean
  filterable?: boolean
  entityType?: string                      // e.g., 'bien' — enables column designer
  entityAccessor?: (row: T) => unknown     // extracts the entity object from the row
  /** Fixed column — cannot be resized, reordered, or hidden */
  fixed?: boolean
  /** Default footer aggregation — user can override via column settings */
  footerAgg?: AggFn
  /** Format the aggregated footer value (e.g. add currency symbol) */
  footerFormat?: (value: number) => string
}

// ─── Entity column template config ──────────────────────────

export interface EntityColumnConfig {
  mainLine: string
  subLine?: string
  sortField?: string
}

// ─── View modes ─────────────────────────────────────────────

// ─── Footer aggregation ────────────────────────────────────

export type AggFn = 'sum' | 'count' | 'min' | 'max' | 'avg'

// ─── View modes ─────────────────────────────────────────────

export type ViewMode = 'table' | 'card' | 'kanban'

// ─── Kanban ─────────────────────────────────────────────────

export interface KanbanConfig {
  groupBy: string
  columns: { value: string; label: string; color?: string }[]
}

// ─── Column style & settings ────────────────────────────────

export interface ColumnStyle {
  borderLeft?: string
  borderLeftWidth?: string
  borderRight?: string
  background?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: string
  textAlign?: string
}

/** Opérateurs disponibles pour les filtres texte (Airtable/Ninox). */
export type TextFilterOp = 'contains' | 'equals' | 'starts' | 'ends' | 'empty' | 'notEmpty'

/** Opérateurs disponibles pour les filtres numériques. `between` utilise les
 *  champs filterNumberFrom + filterNumberTo ; les autres utilisent filterNumberFrom. */
export type NumberFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty'

export interface ColumnSettings {
  sort?: 'asc' | 'desc' | null
  /** Opérateur pour filterText. Défaut = 'contains' (rétro-compat). */
  filterTextOp?: TextFilterOp
  filterText?: string
  filterValues?: string[]
  filterDateFrom?: string
  filterDateTo?: string
  /** Opérateur pour filtre numérique. Défaut = 'between' (rétro-compat). */
  filterNumberOp?: NumberFilterOp
  filterNumberFrom?: number | null
  filterNumberTo?: number | null
  filterTimeFrom?: string
  filterTimeTo?: string
  style?: ColumnStyle
  /** Footer aggregation function selected by the user */
  aggFn?: AggFn | null
}

export type AllSettings = Record<string, ColumnSettings>

// ─── Selection ─────────────────────────────────────────────

export interface SelectionState {
  /** 'include' = only selectedIds are checked; 'all' = everything except excludedIds */
  mode: 'include' | 'all'
  selectedIds: Set<string>
  excludedIds: Set<string>
  /** Number of selected items (accounts for cross-page "all" mode) */
  count: number
  /** Check if a specific row ID is currently selected */
  isSelected: (id: string) => boolean
  /** Deselect everything */
  clear: () => void
}

// ─── Card layout (for SmartCard) ───────────────────────────

export type CardGridCols = 4 | 5 | 6 | 8

export interface CardLayoutField {
  variableKey: string
  showLabel: boolean
  fontSize: 'sm' | 'md' | 'lg'
  fontWeight: 'normal' | 'bold'
  color: 'default' | 'primary' | 'muted' | 'accent'
  displayFormat?: 'currency' | 'surface' | 'date-relative' | 'date-absolute' | 'percentage' | 'boolean'
  /** Special rendering: 'badge' = pill badge, 'dpe' = DPE colored square, 'stat' = icon+count chip */
  renderAs?: 'text' | 'badge' | 'dpe' | 'stat'
  /** When true, this field renders as an overlay on the image zone */
  imageOverlay?: boolean
}

export type CardZoneId = 'image' | 'header' | 'body' | 'footer'

export interface CardLayoutZone {
  id: CardZoneId
  fields: CardLayoutField[]
}

export interface CardLayout {
  entityType: string
  zones: CardLayoutZone[]
  imageAspectRatio: '4/3' | '3/2' | '16/9' | '1/1'
  showImageZone: boolean
}

// ─── Table state snapshot (for saved views) ────────────────

export interface TableStateSnapshot {
  hiddenColumns: string[]
  columnOrder: string[]
  allSettings: AllSettings
  columnSizing: Record<string, number>
  pageSize: number
  viewMode?: ViewMode
  gridCols?: CardGridCols
  cardLayout?: CardLayout
  /** Current filtered row count (for KPI display) */
  filteredRowCount?: number
}

// ─── Component props ────────────────────────────────────────

export interface SmartDataTableProps<T> {
  columns: SmartColumn<T>[]
  data: T[]
  tableId: string
  loading?: boolean
  onRowClick?: (row: T) => void
  enablePagination?: boolean
  manualPagination?: boolean
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  searchPlaceholder?: string
  emptyTitle?: string
  emptyAction?: { label: string; onClick: () => void }
  viewModes?: ViewMode[]
  defaultView?: ViewMode
  kanban?: KanbanConfig
  renderCard?: (row: T) => ReactNode
  /** Entity type for SmartCard rendering (e.g. 'bien', 'contact') */
  entityType?: string
  onKanbanMove?: (row: T, fromStatus: string, toStatus: string) => void
  actions?: ReactNode
  onAdd?: () => void
  addLabel?: string
  initialHiddenColumns?: Set<string>
  /** Enable row selection (checkboxes) */
  enableSelection?: boolean
  /** Extract a stable unique ID from each row (required when enableSelection is true) */
  getRowId?: (row: T) => string
  /** Render action buttons when rows are selected */
  selectionActions?: (selection: SelectionState) => ReactNode
  /** Ref that always holds the current table state snapshot (for external reads) */
  tableStateRef?: MutableRefObject<TableStateSnapshot | null>
  /** Called whenever the table state changes */
  onTableStateChange?: (state: TableStateSnapshot) => void
  /** When set/changed, restores the table to this state */
  initialTableState?: TableStateSnapshot | null
  /** Separate data source for card view (e.g. infinite-scrolled full dataset when table is paginated) */
  cardData?: T[]
  /** Total count for cardData (for display only) */
  cardTotal?: number
  /** Called when view mode changes (table/card/kanban) */
  onViewModeChange?: (mode: ViewMode) => void
  /** Whether card view has more data to load */
  cardHasMore?: boolean
  /** Callback to load more card data */
  cardLoadMore?: () => void
  /** Whether card data is currently loading more */
  cardLoadingMore?: boolean
  /** Called when the table scroll mode changes (pagination vs infinite) */
  onScrollModeChange?: (mode: 'pagination' | 'infinite') => void
  /** Called when sorting changes (for server-side sort with manualPagination) */
  onSortChange?: (sortBy: string | null, sortDir: 'asc' | 'desc' | null) => void
  /** FilterPanel definitions for external/advanced filters (unified filter system) */
  filterDefs?: FilterDef[]
  /** Current external filter values */
  filterValues?: Record<string, unknown>
  /** Called when an external filter changes */
  onFilterChange?: (key: string, value: unknown) => void
  /** Called when all external filters are reset */
  onFilterReset?: () => void
  /** Called with debounced search query for server-side search (skips client-side filtering when provided) */
  onGlobalSearch?: (query: string) => void
}
