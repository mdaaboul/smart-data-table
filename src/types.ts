import type { MutableRefObject, ReactNode } from 'react'

// ─── Filter definition (kept exported for consumer use) ─────
// FilterPanel UI is intentionally NOT shipped in this package.
// Consumers can still consume `FilterDef` to describe their own
// filter chrome wired to `onFilterChange` etc. (deprecated props).
export interface FilterDef {
  key: string
  label: string
  kind: 'text' | 'multi' | 'date' | 'number' | 'boolean'
  options?: { value: string; label: string }[]
}

// ─── Preferences API (injected by consumer) ─────────────────
//
// Consumers wire this to whatever persistence they want
// (localStorage, server-backed user prefs, in-memory). Use
// `createLocalStoragePrefs()` from `./useTableState` for the
// no-config localStorage default.
export interface PrefsAPI {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

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
  /** Preferences adapter — required. Use `createLocalStoragePrefs()` for the default. */
  prefs: PrefsAPI
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
  /** @deprecated Card / kanban view modes are out of scope — only 'table' renders. Kept for call-site compatibility. */
  viewModes?: ViewMode[]
  defaultView?: ViewMode
  /** @deprecated Kanban view is not shipped in this package. */
  kanban?: KanbanConfig
  /** @deprecated Card / kanban view custom renderer — not used by the table view. */
  renderCard?: (row: T) => ReactNode
  /** @deprecated Entity-type metadata system is out of scope for this package. */
  entityType?: string
  /** @deprecated Kanban view is not shipped in this package. */
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
  /** @deprecated Card view not shipped — separate data source for card view. */
  cardData?: T[]
  /** @deprecated Card view not shipped. */
  cardTotal?: number
  /** @deprecated Only 'table' is rendered. */
  onViewModeChange?: (mode: ViewMode) => void
  /** @deprecated Card view not shipped. */
  cardHasMore?: boolean
  /** @deprecated Card view not shipped. */
  cardLoadMore?: () => void
  /** @deprecated Card view not shipped. */
  cardLoadingMore?: boolean
  /** Called when the table scroll mode changes (pagination vs infinite) */
  onScrollModeChange?: (mode: 'pagination' | 'infinite') => void
  /** Called when sorting changes (for server-side sort with manualPagination) */
  onSortChange?: (sortBy: string | null, sortDir: 'asc' | 'desc' | null) => void
  /** @deprecated FilterPanel UI is not shipped. Type kept for consumers wiring their own external filters. */
  filterDefs?: FilterDef[]
  /** @deprecated External filter values — paired with deprecated filterDefs. */
  filterValues?: Record<string, unknown>
  /** @deprecated External filter onChange — paired with deprecated filterDefs. */
  onFilterChange?: (key: string, value: unknown) => void
  /** @deprecated External filter onReset — paired with deprecated filterDefs. */
  onFilterReset?: () => void
  /** Called with debounced search query for server-side search (skips client-side filtering when provided) */
  onGlobalSearch?: (query: string) => void
}
