// Public API barrel for @wavatec/smart-data-table.

// Main component
export { default as SmartDataTable } from './SmartDataTable';
export { default } from './SmartDataTable';

// Hooks
export { useSelection } from './useSelection';
export { useTableState, createLocalStoragePrefs } from './useTableState';

// Types
export type {
  SmartColumn,
  SmartDataTableProps,
  PrefsAPI,
  ColumnSettings,
  AllSettings,
  ColumnStyle,
  AggFn,
  TextFilterOp,
  NumberFilterOp,
  SelectionState,
  TableStateSnapshot,
  ViewMode,
  KanbanConfig,
  EntityColumnConfig,
  CardGridCols,
  CardLayout,
  CardLayoutField,
  CardLayoutZone,
  CardZoneId,
  FilterDef,
} from './types';

// Helpers (some consumers may want these)
export {
  exportCSV,
  exportExcel,
  smartFilterFn,
  getCellStyle,
  resolveTemplate,
  extractImageUrl,
  templateHasImageVar,
  computeAggregations,
  AGG_LABELS,
  getAggLabel,
  allowedAggFns,
  formatFieldValue,
  formatValue,
  getTypoStyle,
  SWATCH_COLORS,
} from './helpers';
export type { TFn } from './helpers';
