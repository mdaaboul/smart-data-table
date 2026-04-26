import * as react_jsx_runtime from 'react/jsx-runtime';
import * as react from 'react';
import { ReactNode, MutableRefObject } from 'react';
import { FilterFn } from '@tanstack/react-table';

interface FilterDef {
    key: string;
    label: string;
    kind: 'text' | 'multi' | 'date' | 'number' | 'boolean';
    options?: {
        value: string;
        label: string;
    }[];
}
interface PrefsAPI {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
}
interface SmartColumn<T> {
    id: string;
    header: string;
    accessorKey?: string;
    accessorFn?: (row: T) => unknown;
    cell?: (info: {
        row: T;
        value: unknown;
    }) => ReactNode;
    size?: number;
    type?: 'text' | 'date' | 'number' | 'time';
    filterOptions?: {
        value: string;
        label: string;
        render?: ReactNode;
    }[];
    sortable?: boolean;
    filterable?: boolean;
    entityType?: string;
    entityAccessor?: (row: T) => unknown;
    /** Fixed column — cannot be resized, reordered, or hidden */
    fixed?: boolean;
    /** Default footer aggregation — user can override via column settings */
    footerAgg?: AggFn;
    /** Format the aggregated footer value (e.g. add currency symbol) */
    footerFormat?: (value: number) => string;
}
interface EntityColumnConfig {
    mainLine: string;
    subLine?: string;
    sortField?: string;
}
type AggFn = 'sum' | 'count' | 'min' | 'max' | 'avg';
type ViewMode = 'table' | 'card' | 'kanban';
interface KanbanConfig {
    groupBy: string;
    columns: {
        value: string;
        label: string;
        color?: string;
    }[];
}
interface ColumnStyle {
    borderLeft?: string;
    borderLeftWidth?: string;
    borderRight?: string;
    background?: string;
    fontWeight?: string;
    fontStyle?: string;
    fontSize?: string;
    textAlign?: string;
}
/** Opérateurs disponibles pour les filtres texte (Airtable/Ninox). */
type TextFilterOp = 'contains' | 'equals' | 'starts' | 'ends' | 'empty' | 'notEmpty';
/** Opérateurs disponibles pour les filtres numériques. `between` utilise les
 *  champs filterNumberFrom + filterNumberTo ; les autres utilisent filterNumberFrom. */
type NumberFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty';
interface ColumnSettings {
    sort?: 'asc' | 'desc' | null;
    /** Opérateur pour filterText. Défaut = 'contains' (rétro-compat). */
    filterTextOp?: TextFilterOp;
    filterText?: string;
    filterValues?: string[];
    filterDateFrom?: string;
    filterDateTo?: string;
    /** Opérateur pour filtre numérique. Défaut = 'between' (rétro-compat). */
    filterNumberOp?: NumberFilterOp;
    filterNumberFrom?: number | null;
    filterNumberTo?: number | null;
    filterTimeFrom?: string;
    filterTimeTo?: string;
    style?: ColumnStyle;
    /** Footer aggregation function selected by the user */
    aggFn?: AggFn | null;
}
type AllSettings = Record<string, ColumnSettings>;
interface SelectionState {
    /** 'include' = only selectedIds are checked; 'all' = everything except excludedIds */
    mode: 'include' | 'all';
    selectedIds: Set<string>;
    excludedIds: Set<string>;
    /** Number of selected items (accounts for cross-page "all" mode) */
    count: number;
    /** Check if a specific row ID is currently selected */
    isSelected: (id: string) => boolean;
    /** Deselect everything */
    clear: () => void;
}
type CardGridCols = 4 | 5 | 6 | 8;
interface CardLayoutField {
    variableKey: string;
    showLabel: boolean;
    fontSize: 'sm' | 'md' | 'lg';
    fontWeight: 'normal' | 'bold';
    color: 'default' | 'primary' | 'muted' | 'accent';
    displayFormat?: 'currency' | 'surface' | 'date-relative' | 'date-absolute' | 'percentage' | 'boolean';
    /** Special rendering: 'badge' = pill badge, 'dpe' = DPE colored square, 'stat' = icon+count chip */
    renderAs?: 'text' | 'badge' | 'dpe' | 'stat';
    /** When true, this field renders as an overlay on the image zone */
    imageOverlay?: boolean;
}
type CardZoneId = 'image' | 'header' | 'body' | 'footer';
interface CardLayoutZone {
    id: CardZoneId;
    fields: CardLayoutField[];
}
interface CardLayout {
    entityType: string;
    zones: CardLayoutZone[];
    imageAspectRatio: '4/3' | '3/2' | '16/9' | '1/1';
    showImageZone: boolean;
}
interface TableStateSnapshot {
    hiddenColumns: string[];
    columnOrder: string[];
    allSettings: AllSettings;
    columnSizing: Record<string, number>;
    pageSize: number;
    viewMode?: ViewMode;
    gridCols?: CardGridCols;
    cardLayout?: CardLayout;
    /** Current filtered row count (for KPI display) */
    filteredRowCount?: number;
}
interface SmartDataTableProps<T> {
    columns: SmartColumn<T>[];
    data: T[];
    tableId: string;
    /** Preferences adapter — required. Use `createLocalStoragePrefs()` for the default. */
    prefs: PrefsAPI;
    loading?: boolean;
    onRowClick?: (row: T) => void;
    enablePagination?: boolean;
    manualPagination?: boolean;
    page?: number;
    pageSize?: number;
    total?: number;
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    searchPlaceholder?: string;
    emptyTitle?: string;
    emptyAction?: {
        label: string;
        onClick: () => void;
    };
    /** @deprecated Card / kanban view modes are out of scope — only 'table' renders. Kept for call-site compatibility. */
    viewModes?: ViewMode[];
    defaultView?: ViewMode;
    /** @deprecated Kanban view is not shipped in this package. */
    kanban?: KanbanConfig;
    /** @deprecated Card / kanban view custom renderer — not used by the table view. */
    renderCard?: (row: T) => ReactNode;
    /** @deprecated Entity-type metadata system is out of scope for this package. */
    entityType?: string;
    /** @deprecated Kanban view is not shipped in this package. */
    onKanbanMove?: (row: T, fromStatus: string, toStatus: string) => void;
    actions?: ReactNode;
    onAdd?: () => void;
    addLabel?: string;
    initialHiddenColumns?: Set<string>;
    /** Enable row selection (checkboxes) */
    enableSelection?: boolean;
    /** Extract a stable unique ID from each row (required when enableSelection is true) */
    getRowId?: (row: T) => string;
    /** Render action buttons when rows are selected */
    selectionActions?: (selection: SelectionState) => ReactNode;
    /** Ref that always holds the current table state snapshot (for external reads) */
    tableStateRef?: MutableRefObject<TableStateSnapshot | null>;
    /** Called whenever the table state changes */
    onTableStateChange?: (state: TableStateSnapshot) => void;
    /** When set/changed, restores the table to this state */
    initialTableState?: TableStateSnapshot | null;
    /** @deprecated Card view not shipped — separate data source for card view. */
    cardData?: T[];
    /** @deprecated Card view not shipped. */
    cardTotal?: number;
    /** @deprecated Only 'table' is rendered. */
    onViewModeChange?: (mode: ViewMode) => void;
    /** @deprecated Card view not shipped. */
    cardHasMore?: boolean;
    /** @deprecated Card view not shipped. */
    cardLoadMore?: () => void;
    /** @deprecated Card view not shipped. */
    cardLoadingMore?: boolean;
    /** Called when the table scroll mode changes (pagination vs infinite) */
    onScrollModeChange?: (mode: 'pagination' | 'infinite') => void;
    /** Called when sorting changes (for server-side sort with manualPagination) */
    onSortChange?: (sortBy: string | null, sortDir: 'asc' | 'desc' | null) => void;
    /** @deprecated FilterPanel UI is not shipped. Type kept for consumers wiring their own external filters. */
    filterDefs?: FilterDef[];
    /** @deprecated External filter values — paired with deprecated filterDefs. */
    filterValues?: Record<string, unknown>;
    /** @deprecated External filter onChange — paired with deprecated filterDefs. */
    onFilterChange?: (key: string, value: unknown) => void;
    /** @deprecated External filter onReset — paired with deprecated filterDefs. */
    onFilterReset?: () => void;
    /** Called with debounced search query for server-side search (skips client-side filtering when provided) */
    onGlobalSearch?: (query: string) => void;
}

declare function SmartDataTable<T>({ columns: userColumns, data, tableId, prefs, loading, onRowClick, enablePagination, manualPagination, page, pageSize: initialPageSize, total, onPageChange, onPageSizeChange: onPageSizeChangeProp, searchPlaceholder, emptyTitle, emptyAction, viewModes, defaultView, actions, onAdd, addLabel, initialHiddenColumns, enableSelection, getRowId, selectionActions, tableStateRef, onTableStateChange, initialTableState, onScrollModeChange: onScrollModeChangeProp, onSortChange, onGlobalSearch, }: SmartDataTableProps<T>): react_jsx_runtime.JSX.Element;

/**
 * Manages row selection with cross-pagination support.
 *
 * Two modes:
 *  - 'include': only IDs in `selectedIds` are selected (default)
 *  - 'all':     everything is selected *except* IDs in `excludedIds`
 */
declare function useSelection<T>(getRowId: (row: T) => string, total: number): {
    state: SelectionState;
    toggle: (id: string) => void;
    selectPage: (pageRows: T[]) => void;
    deselectPage: (pageRows: T[]) => void;
    selectAll: () => void;
    clear: () => void;
    isSelected: (id: string) => boolean;
    isPageFullySelected: (pageRows: T[]) => boolean;
    isPagePartiallySelected: (pageRows: T[]) => boolean;
};

declare function createLocalStoragePrefs(): PrefsAPI;
declare function useTableState<T>(tableId: string, smartColumns: SmartColumn<T>[], defaultView: ViewMode, viewModes: ViewMode[] | undefined, initialPageSize: number, prefs: PrefsAPI, initialHiddenColumns?: Set<string>): {
    viewMode: ViewMode;
    changeView: (mode: ViewMode) => void;
    allSettings: AllSettings;
    updateSettings: (next: AllSettings) => void;
    internalPageSize: number;
    changePageSize: (size: number) => void;
    hiddenColumns: Set<string>;
    toggleColumn: (colId: string) => void;
    visibleColumns: SmartColumn<T>[];
    activePopup: string | null;
    setActivePopup: react.Dispatch<react.SetStateAction<string | null>>;
    popupAnchor: DOMRect | null;
    setPopupAnchor: react.Dispatch<react.SetStateAction<DOMRect | null>>;
    showColumnPicker: boolean;
    setShowColumnPicker: react.Dispatch<react.SetStateAction<boolean>>;
    globalSearch: string;
    setGlobalSearch: react.Dispatch<react.SetStateAction<string>>;
    debouncedSearch: string;
    activeFilterCount: number;
    filterByGlobalSearch: (data: T[]) => T[];
    hasIndicator: (colId: string) => boolean;
    handleHeaderClick: (colId: string, e: React.MouseEvent<HTMLDivElement>) => void;
    cycleSort: (colId: string, opts?: {
        additive?: boolean;
    }) => void;
    openHeaderPopup: (colId: string, anchor: DOMRect) => void;
    restoreState: (snapshot: TableStateSnapshot) => void;
};

type TFn = (key: string, options?: Record<string, unknown>) => string;
declare const SWATCH_COLORS: string[];
interface ExportOptions {
    columnOrder?: string[];
    columnSizing?: Record<string, number>;
}
declare function exportCSV<T>(data: T[], columns: {
    id: string;
    header: string;
    accessorKey?: string;
    accessorFn?: (row: T) => unknown;
}[], hiddenCols: Set<string>, filename: string, opts?: ExportOptions): void;
declare function exportExcel<T>(data: T[], columns: {
    id: string;
    header: string;
    accessorKey?: string;
    accessorFn?: (row: T) => unknown;
}[], hiddenCols: Set<string>, filename: string, opts?: ExportOptions): void;
declare const smartFilterFn: FilterFn<unknown>;
declare function getCellStyle(style: ColumnStyle | undefined): React.CSSProperties;
declare function formatValue(value: unknown, format?: string): string;
/**
 * Resolves a template string like "{reference} — {typeBien}" against an entity object.
 * Image-format variables are excluded from text output (rendered separately).
 */
declare function resolveTemplate(template: string, entity: unknown, formatMap?: Record<string, string>): string;
/**
 * Extracts image URLs from a template. Returns the first image variable's URL or null.
 */
declare function extractImageUrl(template: string, entity: unknown, formatMap?: Record<string, string>): string | null;
/**
 * Checks whether a template references any image-format variable.
 */
declare function templateHasImageVar(template: string, formatMap?: Record<string, string>): boolean;
/**
 * @deprecated Use `getAggLabel(fn, t)` instead. This map ships English
 * labels only and is kept for back-compat with consumers that haven't
 * migrated to the i18n flow. New code should always go through
 * `getAggLabel` so labels are translated via the consumer's i18n instance.
 */
declare const AGG_LABELS: Record<AggFn, string>;
/** Resolve the localized label for an aggregation function. */
declare function getAggLabel(fn: AggFn, t: TFn): string;
/** Which aggregation functions are valid for each column type */
declare function allowedAggFns(colType?: string): AggFn[];
/** Compute all active aggregations for visible columns */
declare function computeAggregations<T>(data: T[], columns: SmartColumn<T>[], settings: AllSettings): Record<string, {
    fn: AggFn;
    value: number | null;
}>;
/**
 * Extended field value formatter for SmartCard.
 * Supports all base formats plus date-relative and percentage.
 *
 * @param t Optional translation function. When provided, `date-relative`
 * uses translated labels ("Today" / "Aujourd'hui", "Hier", etc.). Without
 * it, English fallbacks are returned to keep the helper safe to call from
 * non-component contexts.
 */
declare function formatFieldValue(value: unknown, format?: string, t?: TFn): string;
declare function getTypoStyle(style: ColumnStyle | undefined): React.CSSProperties | null;

export { AGG_LABELS, type AggFn, type AllSettings, type CardGridCols, type CardLayout, type CardLayoutField, type CardLayoutZone, type CardZoneId, type ColumnSettings, type ColumnStyle, type EntityColumnConfig, type FilterDef, type KanbanConfig, type NumberFilterOp, type PrefsAPI, SWATCH_COLORS, type SelectionState, type SmartColumn, SmartDataTable, type SmartDataTableProps, type TFn, type TableStateSnapshot, type TextFilterOp, type ViewMode, allowedAggFns, computeAggregations, createLocalStoragePrefs, SmartDataTable as default, exportCSV, exportExcel, extractImageUrl, formatFieldValue, formatValue, getAggLabel, getCellStyle, getTypoStyle, resolveTemplate, smartFilterFn, templateHasImageVar, useSelection, useTableState };
