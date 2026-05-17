'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var react = require('react');
var reactTable = require('@tanstack/react-table');
var lucideReact = require('lucide-react');
var reactI18next = require('react-i18next');
var fileSaver = require('file-saver');
var clsx = require('clsx');
var reactDom = require('react-dom');
var jsxRuntime = require('react/jsx-runtime');

// src/SmartDataTable.tsx
var SWATCH_COLORS = [
  "transparent",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#1e293b"
];
function extractCellText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
function buildExportData(data, columns, hiddenCols, opts) {
  let visibleCols = columns.filter((c) => !hiddenCols.has(c.id));
  if (opts?.columnOrder?.length) {
    const order = opts.columnOrder;
    const colMap = new Map(visibleCols.map((c) => [c.id, c]));
    const ordered = order.filter((id) => colMap.has(id)).map((id) => colMap.get(id));
    const remaining = visibleCols.filter((c) => !order.includes(c.id));
    visibleCols = [...ordered, ...remaining];
  }
  const headers = visibleCols.map((c) => c.header);
  const rows = data.map(
    (row) => visibleCols.map((col) => {
      const accessor = col.accessorKey ? (r) => r[col.accessorKey] : col.accessorFn;
      const val = accessor ? accessor(row) : "";
      return extractCellText(val);
    })
  );
  const sizing = opts?.columnSizing ?? {};
  const colWidths = visibleCols.map((c, i) => {
    if (sizing[c.id]) return Math.min(60, Math.max(8, Math.round(sizing[c.id] / 8)));
    const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.min(40, Math.max(10, Math.max(headers[i].length, maxDataLen) + 2));
  });
  return { headers, rows, colWidths };
}
function exportCSV(data, columns, hiddenCols, filename, opts) {
  const { headers, rows } = buildExportData(data, columns, hiddenCols, opts);
  const csvContent = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  fileSaver.saveAs(blob, `${filename}.csv`);
}
async function exportExcel(data, columns, hiddenCols, filename, opts) {
  const { headers, rows, colWidths } = buildExportData(data, columns, hiddenCols, opts);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRows([headers, ...rows]);
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  fileSaver.saveAs(blob, `${filename}.xlsx`);
}
var smartFilterFn = (row, columnId, filterValue) => {
  const {
    filterTextOp,
    filterText,
    filterValues,
    filterDateFrom,
    filterDateTo,
    filterTimeFrom,
    filterTimeTo,
    filterNumberOp,
    filterNumberFrom,
    filterNumberTo
  } = filterValue;
  const cellValue = row.getValue(columnId);
  const cellStr = cellValue == null ? "" : String(cellValue);
  const cellLower = cellStr.toLowerCase();
  const op = filterTextOp ?? "contains";
  if (op === "empty") {
    if (cellStr !== "") return false;
  } else if (op === "notEmpty") {
    if (cellStr === "") return false;
  } else if (filterText) {
    const q = filterText.toLowerCase();
    if (op === "contains" && !cellLower.includes(q)) return false;
    else if (op === "equals" && cellLower !== q) return false;
    else if (op === "starts" && !cellLower.startsWith(q)) return false;
    else if (op === "ends" && !cellLower.endsWith(q)) return false;
  }
  if (filterValues && filterValues.length > 0) {
    if (!filterValues.includes(cellStr)) return false;
  }
  if (filterDateFrom || filterDateTo) {
    const dateStr = cellValue == null ? "" : String(cellValue).slice(0, 10);
    if (!dateStr) return false;
    if (filterDateFrom && dateStr < filterDateFrom) return false;
    if (filterDateTo && dateStr > filterDateTo) return false;
  }
  if (filterTimeFrom || filterTimeTo) {
    const timeStr = cellValue == null ? "" : String(cellValue).slice(0, 5);
    if (!timeStr) return false;
    if (filterTimeFrom && timeStr < filterTimeFrom) return false;
    if (filterTimeTo && timeStr > filterTimeTo) return false;
  }
  const numOp = filterNumberOp ?? "between";
  if (numOp === "empty") {
    if (cellStr !== "") return false;
  } else if (numOp === "notEmpty") {
    if (cellStr === "") return false;
  } else if (filterNumberFrom != null || filterNumberTo != null) {
    const n = typeof cellValue === "number" ? cellValue : Number(cellStr);
    if (isNaN(n)) return false;
    if (numOp === "eq" && filterNumberFrom != null && n !== filterNumberFrom) return false;
    else if (numOp === "neq" && filterNumberFrom != null && n === filterNumberFrom) return false;
    else if (numOp === "gt" && filterNumberFrom != null && n <= filterNumberFrom) return false;
    else if (numOp === "gte" && filterNumberFrom != null && n < filterNumberFrom) return false;
    else if (numOp === "lt" && filterNumberFrom != null && n >= filterNumberFrom) return false;
    else if (numOp === "lte" && filterNumberFrom != null && n > filterNumberFrom) return false;
    else if (numOp === "between") {
      if (filterNumberFrom != null && n < filterNumberFrom) return false;
      if (filterNumberTo != null && n > filterNumberTo) return false;
    }
  }
  return true;
};
function getCellStyle(style) {
  if (!style) return {};
  const out = {};
  const bw = style.borderLeftWidth ?? "1px";
  if (style.borderLeft && style.borderLeft !== "transparent") {
    out.borderLeft = `${bw} solid ${style.borderLeft}`;
  }
  if (style.borderRight && style.borderRight !== "transparent") {
    out.borderRight = `${bw} solid ${style.borderRight}`;
  }
  if (style.background && style.background !== "transparent") {
    out.backgroundColor = style.background + "15";
  }
  if (style.textAlign) out.textAlign = style.textAlign;
  return out;
}
function resolvePath(obj, path) {
  let current = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return void 0;
    current = current[key];
  }
  return current;
}
function formatValue(value, format) {
  if (value == null) return "";
  const num = format === "currency" || format === "surface" || format === "number" || format === "percentage" ? typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN : NaN;
  if (format === "currency" && !isNaN(num)) {
    return num.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " \u20AC";
  }
  if (format === "surface" && !isNaN(num)) {
    return num.toLocaleString("en-US") + " m\xB2";
  }
  if (format === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-US");
    } catch {
      return value;
    }
  }
  if (format === "boolean") {
    return value ? "Yes" : "No";
  }
  if (format === "duration" && !isNaN(num)) {
    if (num >= 60) {
      const h = Math.floor(num / 60);
      const m = num % 60;
      return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
    }
    return `${num} min`;
  }
  if (format === "rating" && !isNaN(num)) {
    const full = Math.round(Math.min(Math.max(num, 0), 5));
    return "\u2605".repeat(full) + "\u2606".repeat(5 - full);
  }
  if (Array.isArray(value)) return value.map((v) => humanizeEnum(String(v))).join(", ");
  const str = String(value);
  return humanizeEnum(str);
}
function humanizeEnum(value) {
  if (!value || !/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(value)) return value;
  return value.split("_").map(
    (word, i) => i === 0 ? word.charAt(0) + word.slice(1).toLowerCase() : word.toLowerCase()
  ).join(" ");
}
function resolveTemplate(template, entity, formatMap) {
  if (!template || entity == null) return "";
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const k = key.trim();
    if (formatMap?.[k] === "image") return "";
    const value = resolvePath(entity, k);
    if (value == null || value === "") return "";
    return formatValue(value, formatMap?.[k]);
  }).replace(/\s*—\s*—\s*/g, " \u2014 ").replace(/^\s*—\s*|\s*—\s*$/g, "").trim();
}
function extractImageUrl(template, entity, formatMap) {
  if (!template || entity == null || !formatMap) return null;
  const match = template.match(/\{([^}]+)\}/g);
  if (!match) return null;
  for (const m of match) {
    const key = m.slice(1, -1).trim();
    if (formatMap[key] === "image") {
      let url = resolvePath(entity, key);
      if (!url && key.endsWith("Url")) {
        url = resolvePath(entity, key.slice(0, -3));
      }
      if (url && typeof url === "string" && url.startsWith("http")) return url;
    }
  }
  return null;
}
function templateHasImageVar(template, formatMap) {
  if (!template || !formatMap) return false;
  const match = template.match(/\{([^}]+)\}/g);
  if (!match) return false;
  return match.some((m) => formatMap[m.slice(1, -1).trim()] === "image");
}
var AGG_LABELS = {
  sum: "Sum",
  count: "Total",
  min: "Min",
  max: "Max",
  avg: "Avg"
};
function getAggLabel(fn, t) {
  return t(`agg.${fn}`);
}
function allowedAggFns(colType) {
  if (colType === "number") return ["sum", "count", "min", "max", "avg"];
  if (colType === "date") return ["count", "min", "max"];
  return ["count"];
}
function computeAgg(values, fn) {
  if (values.length === 0) return null;
  switch (fn) {
    case "count":
      return values.length;
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
function computeAggregations(data, columns, settings) {
  const result = {};
  for (const col of columns) {
    const fn = settings[col.id]?.aggFn ?? col.footerAgg ?? null;
    if (!fn) continue;
    const accessor = col.accessorKey ? (row) => row[col.accessorKey] : col.accessorFn;
    if (fn === "count") {
      if (accessor) {
        let total = 0;
        for (const row of data) {
          const v = accessor(row);
          if (Array.isArray(v)) total += v.length;
          else if (typeof v === "number") total += v;
          else if (v != null) total += 1;
        }
        result[col.id] = { fn, value: total };
      } else {
        result[col.id] = { fn, value: data.length };
      }
      continue;
    }
    if (!accessor) {
      result[col.id] = { fn, value: null };
      continue;
    }
    const nums = [];
    for (const row of data) {
      const v = accessor(row);
      if (v != null && typeof v === "number" && !isNaN(v)) nums.push(v);
      else if (v != null && typeof v === "string" && col.type === "date") nums.push(new Date(v).getTime());
    }
    result[col.id] = { fn, value: computeAgg(nums, fn) };
  }
  return result;
}
function formatFieldValue(value, format, t) {
  if (value == null) return "";
  if (format === "date-relative" && typeof value === "string") {
    try {
      const d = new Date(value);
      const now = /* @__PURE__ */ new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / 864e5);
      if (diffDays === 0) return t ? t("format.today") : "Today";
      if (diffDays === 1) return t ? t("format.yesterday") : "Yesterday";
      if (diffDays < 30) return t ? t("format.daysAgo", { count: diffDays }) : `${diffDays}d ago`;
      if (diffDays < 365) return t ? t("format.monthsAgo", { count: Math.floor(diffDays / 30) }) : `${Math.floor(diffDays / 30)}mo ago`;
      const years = Math.floor(diffDays / 365);
      return t ? t("format.yearsAgo", { count: years }) : `${years}y ago`;
    } catch {
      return String(value);
    }
  }
  if (format === "date-absolute" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString("en-US");
    } catch {
      return value;
    }
  }
  if (format === "percentage") {
    const n = typeof value === "number" ? value : parseFloat(String(value));
    if (!isNaN(n)) return n.toLocaleString("en-US") + " %";
  }
  return formatValue(value, format);
}
function getTypoStyle(style) {
  if (!style) return null;
  const hasTypo = style.fontWeight && style.fontWeight !== "400" || style.fontStyle && style.fontStyle !== "normal" || style.fontSize;
  if (!hasTypo) return null;
  const out = {};
  if (style.fontWeight && style.fontWeight !== "400") out.fontWeight = style.fontWeight;
  if (style.fontStyle && style.fontStyle !== "normal") out.fontStyle = style.fontStyle;
  if (style.fontSize === "S") out.fontSize = "12px";
  else if (style.fontSize === "L") out.fontSize = "16px";
  return out;
}
function createLocalStoragePrefs() {
  return {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
      }
    }
  };
}
function useTableState(tableId, smartColumns, defaultView, viewModes, initialPageSize, prefs, initialHiddenColumns) {
  const [viewMode, setViewMode] = react.useState(() => {
    const saved = prefs.get(`${tableId}-view`, null);
    if (saved && viewModes?.includes(saved)) return saved;
    return defaultView;
  });
  const changeView = react.useCallback((mode) => {
    setViewMode(mode);
    prefs.set(`${tableId}-view`, mode);
  }, [tableId, prefs]);
  const [allSettings, setAllSettings] = react.useState(() => {
    const stored = prefs.get(`smarttable-${tableId}`, {});
    const cleaned = {};
    for (const [colId, s] of Object.entries(stored)) {
      const { filterValues, filterText, filterNumberFrom, filterNumberTo, filterDateFrom, filterDateTo, filterTimeFrom, filterTimeTo, ...rest } = s;
      if (Object.keys(rest).length > 0) cleaned[colId] = rest;
    }
    if (JSON.stringify(cleaned) !== JSON.stringify(stored)) prefs.set(`smarttable-${tableId}`, cleaned);
    return cleaned;
  });
  const updateSettings = react.useCallback((next) => {
    setAllSettings(next);
    prefs.set(`smarttable-${tableId}`, next);
  }, [tableId, prefs]);
  const [internalPageSize, setInternalPageSize] = react.useState(() => {
    const saved = prefs.get(`${tableId}-pageSize`, null);
    return saved && saved > 0 ? saved : initialPageSize;
  });
  const changePageSize = react.useCallback((size) => {
    setInternalPageSize(size);
    prefs.set(`${tableId}-pageSize`, size);
  }, [tableId, prefs]);
  const [hiddenColumns, setHiddenColumns] = react.useState(() => {
    const saved = prefs.get(`${tableId}-hidden-cols`, null);
    if (saved) return new Set(saved);
    return initialHiddenColumns ? new Set(initialHiddenColumns) : /* @__PURE__ */ new Set();
  });
  const toggleColumn = react.useCallback((colId) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      prefs.set(`${tableId}-hidden-cols`, [...next]);
      return next;
    });
  }, [tableId, prefs]);
  const visibleColumns = react.useMemo(
    () => smartColumns.filter((c) => !hiddenColumns.has(c.id)),
    [smartColumns, hiddenColumns]
  );
  const [activePopup, setActivePopup] = react.useState(null);
  const [popupAnchor, setPopupAnchor] = react.useState(null);
  const [showColumnPicker, setShowColumnPicker] = react.useState(false);
  const [globalSearch, setGlobalSearch] = react.useState("");
  const [debouncedSearch, setDebouncedSearch] = react.useState("");
  react.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(globalSearch), 50);
    return () => clearTimeout(timer);
  }, [globalSearch]);
  const activeFilterCount = react.useMemo(() => {
    let count = 0;
    Object.values(allSettings).forEach((s) => {
      if (s.filterText) count++;
      else if (s.filterTextOp === "empty" || s.filterTextOp === "notEmpty") count++;
      if (s.filterValues && s.filterValues.length > 0 && !s.filterValues.every((v) => v === "__NONE__")) count++;
      if (s.filterDateFrom || s.filterDateTo) count++;
      if (s.filterTimeFrom || s.filterTimeTo) count++;
      if (s.filterNumberFrom != null || s.filterNumberTo != null) count++;
      else if (s.filterNumberOp === "empty" || s.filterNumberOp === "notEmpty") count++;
    });
    return count;
  }, [allSettings]);
  const filterByGlobalSearch = react.useCallback((data) => {
    const terms = debouncedSearch.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return data;
    return data.filter((row) => {
      const values = smartColumns.map((col) => {
        const accessor = col.accessorKey ? (r) => r[col.accessorKey] : col.accessorFn;
        if (!accessor) return "";
        const val = accessor(row);
        return val != null ? String(val).toLowerCase() : "";
      });
      return terms.every((term) => values.some((v) => v.includes(term)));
    });
  }, [debouncedSearch, smartColumns]);
  const hasIndicator = react.useCallback((colId) => {
    const s = allSettings[colId];
    if (!s) return false;
    return !!(s.sort || s.filterText || s.filterValues && s.filterValues.length > 0 || s.filterDateFrom || s.filterDateTo || s.filterTimeFrom || s.filterTimeTo || s.filterNumberFrom != null || s.filterNumberTo != null || s.filterTextOp === "empty" || s.filterTextOp === "notEmpty" || s.filterNumberOp === "empty" || s.filterNumberOp === "notEmpty");
  }, [allSettings]);
  const restoreState = react.useCallback((snapshot) => {
    const nextHidden = new Set(snapshot.hiddenColumns ?? []);
    setHiddenColumns(nextHidden);
    prefs.set(`${tableId}-hidden-cols`, [...nextHidden]);
    const nextSettings = snapshot.allSettings ?? {};
    setAllSettings(nextSettings);
    prefs.set(`smarttable-${tableId}`, nextSettings);
    if (snapshot.pageSize && snapshot.pageSize > 0) {
      setInternalPageSize(snapshot.pageSize);
      prefs.set(`${tableId}-pageSize`, snapshot.pageSize);
    }
  }, [tableId, prefs]);
  const cycleSort = react.useCallback((colId, opts) => {
    const current = allSettings[colId]?.sort;
    const nextSort = current === "asc" ? "desc" : current === "desc" ? null : "asc";
    const next = { ...allSettings };
    if (!opts?.additive) {
      for (const k of Object.keys(next)) {
        if (k !== colId && next[k]?.sort) next[k] = { ...next[k], sort: null };
      }
    }
    if (nextSort) {
      next[colId] = { ...next[colId] ?? {}, sort: nextSort };
    } else if (next[colId]) {
      const { sort: _s, ...rest } = next[colId];
      if (Object.keys(rest).length > 0) next[colId] = rest;
      else delete next[colId];
    }
    updateSettings(next);
  }, [allSettings, updateSettings]);
  const openHeaderPopup = react.useCallback((colId, anchor) => {
    setPopupAnchor(anchor);
    setActivePopup(colId);
  }, []);
  const handleHeaderClick = react.useCallback((colId, e) => {
    e.stopPropagation();
    const col = smartColumns.find((c) => c.id === colId);
    if (!(col?.sortable ?? true)) {
      const rect = e.currentTarget.getBoundingClientRect();
      openHeaderPopup(colId, rect);
      return;
    }
    cycleSort(colId, { additive: e.shiftKey });
  }, [cycleSort, smartColumns, openHeaderPopup]);
  return {
    viewMode,
    changeView,
    allSettings,
    updateSettings,
    internalPageSize,
    changePageSize,
    hiddenColumns,
    toggleColumn,
    visibleColumns,
    activePopup,
    setActivePopup,
    popupAnchor,
    setPopupAnchor,
    showColumnPicker,
    setShowColumnPicker,
    globalSearch,
    setGlobalSearch,
    debouncedSearch,
    activeFilterCount,
    filterByGlobalSearch,
    hasIndicator,
    handleHeaderClick,
    cycleSort,
    openHeaderPopup,
    restoreState
  };
}
function extractCellText2(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
function CellContextMenu({
  target,
  onClose,
  onOpenRow,
  onHideColumn,
  onCopyCell,
  onCopyRow
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const menuRef = react.useRef(null);
  react.useEffect(() => {
    if (!target) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const t2 = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t2);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);
  if (!target) return null;
  const cellText = extractCellText2(target.cellValue);
  const actions = [
    {
      label: t("context.copyCell"),
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Copy, { className: "h-3.5 w-3.5" }),
      onClick: () => {
        navigator.clipboard.writeText(cellText).catch(() => {
        });
        onCopyCell?.(cellText);
        onClose();
      },
      shortcut: "\u2318C"
    },
    {
      label: t("context.copyRow"),
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ClipboardCopy, { className: "h-3.5 w-3.5" }),
      onClick: () => {
        onCopyRow?.(target.row);
        onClose();
      }
    },
    ...onOpenRow ? [{
      label: t("context.openRow"),
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ExternalLink, { className: "h-3.5 w-3.5" }),
      onClick: () => {
        onOpenRow(target.row);
        onClose();
      },
      shortcut: "\u21B5"
    }] : [],
    ...onHideColumn && !target.column.fixed ? [{
      label: t("context.hideQuoted", { header: target.column.header }),
      icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.EyeOff, { className: "h-3.5 w-3.5" }),
      onClick: () => {
        onHideColumn(target.column.id);
        onClose();
      }
    }] : []
  ];
  const MENU_W = 240;
  const MENU_H = actions.length * 32 + 8;
  const left = Math.min(target.x, window.innerWidth - MENU_W - 8);
  const top = Math.min(target.y, window.innerHeight - MENU_H - 8);
  return reactDom.createPortal(
    /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        ref: menuRef,
        style: { position: "fixed", top, left, zIndex: 1e4, width: MENU_W },
        className: "rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 py-1 animate-fade-in",
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "px-3 py-1.5 border-b border-slate-100 dark:border-slate-800", children: [
            /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-slate-400", children: target.column.header }),
            /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-xs text-slate-700 dark:text-slate-300 truncate", title: cellText, children: cellText || /* @__PURE__ */ jsxRuntime.jsx("span", { className: "italic text-slate-400", children: t("context.empty") }) })
          ] }),
          actions.map((a, i) => /* @__PURE__ */ jsxRuntime.jsxs(
            "button",
            {
              onClick: a.onClick,
              className: clsx.clsx(
                "flex w-full items-center justify-between px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300",
                "hover:bg-slate-100 dark:hover:bg-slate-800",
                a.danger && "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              ),
              children: [
                /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "flex items-center gap-2", children: [
                  a.icon,
                  /* @__PURE__ */ jsxRuntime.jsx("span", { children: a.label })
                ] }),
                a.shortcut && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-[10px] text-slate-400", children: a.shortcut })
              ]
            },
            i
          ))
        ]
      }
    ),
    document.body
  );
}
function TableView({
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
  aggregatedTotalRows
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const rows = table.getRowModel().rows;
  const skeletonRows = react.useMemo(() => Array.from({ length: 5 }, (_, i) => i), []);
  const isResizing = table.getState().columnSizingInfo.isResizingColumn;
  const [fitColumns, setFitColumns] = react.useState(
    () => prefs.get(`${tableId}-fit-cols`, true)
  );
  const toggleFitColumns = react.useCallback(() => {
    setFitColumns((prev) => {
      const next = !prev;
      prefs.set(`${tableId}-fit-cols`, next);
      return next;
    });
  }, [tableId, prefs]);
  const [cogOpen, setCogOpen] = react.useState(false);
  const [cogRect, setCogRect] = react.useState(null);
  const cogRef = react.useRef(null);
  const cogBtnRef = react.useRef(null);
  const [showCogHint, setShowCogHint] = react.useState(
    () => !prefs.get("smartdt-cog-used", false)
  );
  const dismissCogHint = react.useCallback(() => {
    setShowCogHint(false);
    prefs.set("smartdt-cog-used", true);
  }, [prefs]);
  react.useEffect(() => {
    if (!cogOpen) return;
    const handler = (e) => {
      if (cogRef.current && !cogRef.current.contains(e.target)) setCogOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cogOpen]);
  const [dragColId, setDragColId] = react.useState(null);
  const [dropTarget, setDropTarget] = react.useState(null);
  const dragRef = react.useRef(null);
  const handleDragStart = react.useCallback((colId, e) => {
    dragRef.current = colId;
    setDragColId(colId);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.className = "px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold shadow-lg";
    ghost.textContent = table.getColumn(colId)?.columnDef.header ?? colId;
    ghost.style.position = "absolute";
    ghost.style.top = "-1000px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, [table]);
  const handleDragOver = react.useCallback((colId, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragRef.current && dragRef.current !== colId) {
      setDropTarget(colId);
    }
  }, []);
  const handleDrop = react.useCallback((targetColId, e) => {
    e.preventDefault();
    const sourceColId = dragRef.current;
    if (!sourceColId || sourceColId === targetColId) {
      setDragColId(null);
      setDropTarget(null);
      return;
    }
    const currentOrder = table.getState().columnOrder.length ? [...table.getState().columnOrder] : table.getAllLeafColumns().map((c) => c.id);
    const fromIdx = currentOrder.indexOf(sourceColId);
    const toIdx = currentOrder.indexOf(targetColId);
    if (fromIdx === -1 || toIdx === -1) return;
    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, sourceColId);
    table.setColumnOrder(currentOrder);
    setDragColId(null);
    setDropTarget(null);
  }, [table]);
  const handleDragEnd = react.useCallback(() => {
    dragRef.current = null;
    setDragColId(null);
    setDropTarget(null);
  }, []);
  const onResizeStart = react.useCallback((header, e) => {
    e.stopPropagation();
    e.preventDefault();
    header.getResizeHandler()(e);
  }, []);
  const totalWidth = react.useMemo(() => {
    return table.getVisibleLeafColumns().reduce((sum, col) => sum + col.getSize(), 0);
  }, [table.getVisibleLeafColumns(), table.getState().columnSizing]);
  const ACTIONS_COL_W = 44;
  const CHECK_COL_W = enableSelection ? 40 : 0;
  const scrollContainerRef = react.useRef(null);
  const [scrolledDown, setScrolledDown] = react.useState(false);
  react.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => setScrolledDown(el.scrollTop > 8);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const [focusedRowIdx, setFocusedRowIdx] = react.useState(null);
  react.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const active = document.activeElement;
      const focusInTable = el === active || el.contains(active);
      if (focusedRowIdx == null && !focusInTable) return;
      const total = rows.length;
      if (total === 0) return;
      const cur = focusedRowIdx ?? -1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIdx(Math.min(total - 1, cur + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIdx(Math.max(0, cur - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusedRowIdx(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusedRowIdx(total - 1);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setFocusedRowIdx(Math.min(total - 1, cur + 10));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setFocusedRowIdx(Math.max(0, cur - 10));
      } else if (e.key === "Escape") {
        setFocusedRowIdx(null);
      } else if (e.key === "Enter" && cur >= 0 && onRowClick) {
        e.preventDefault();
        onRowClick(rows[cur].original);
      } else if (e.key === " " && cur >= 0 && enableSelection && onToggleRow && getRowId) {
        e.preventDefault();
        onToggleRow(getRowId(rows[cur].original));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [rows, focusedRowIdx, onRowClick, enableSelection, onToggleRow, getRowId]);
  react.useEffect(() => {
    setFocusedRowIdx(null);
  }, [rows.length]);
  const [cellContext, setCellContext] = react.useState(null);
  const hasAggregations = aggregations && Object.keys(aggregations).length > 0 && rows.length > 0;
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative", children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        ref: scrollContainerRef,
        role: "region",
        "aria-label": t("table.ariaLabel"),
        className: clsx.clsx(
          "relative rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
          "overflow-y-auto max-h-[calc(100vh-280px)]",
          fitColumns ? "overflow-x-hidden" : "overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent",
          isResizing && "select-none cursor-col-resize"
        ),
        tabIndex: 0,
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs(
            "table",
            {
              className: "text-sm w-full",
              style: {
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                ...!fitColumns ? { width: totalWidth + ACTIONS_COL_W + CHECK_COL_W, minWidth: totalWidth + ACTIONS_COL_W + CHECK_COL_W } : void 0
              },
              children: [
                /* @__PURE__ */ jsxRuntime.jsxs("colgroup", { children: [
                  enableSelection && /* @__PURE__ */ jsxRuntime.jsx("col", { style: { width: CHECK_COL_W } }),
                  table.getVisibleLeafColumns().map((col) => /* @__PURE__ */ jsxRuntime.jsx("col", { style: { width: col.getSize() } }, col.id)),
                  /* @__PURE__ */ jsxRuntime.jsx("col", { style: { width: ACTIONS_COL_W } })
                ] }),
                /* @__PURE__ */ jsxRuntime.jsx("thead", { className: "sticky top-0 z-20 shadow-[0_1px_0_0_rgb(226,232,240)] dark:shadow-[0_1px_0_0_rgb(51,65,85)]", children: table.getHeaderGroups().map((headerGroup) => /* @__PURE__ */ jsxRuntime.jsxs(
                  "tr",
                  {
                    className: "bg-slate-50 dark:bg-slate-800",
                    children: [
                      enableSelection && /* @__PURE__ */ jsxRuntime.jsx("th", { className: "w-[40px] px-2 py-3 text-center bg-slate-50 dark:bg-slate-800", children: /* @__PURE__ */ jsxRuntime.jsx(
                        "input",
                        {
                          type: "checkbox",
                          checked: !!pageFullSel,
                          ref: (el) => {
                            if (el) el.indeterminate = !!pagePartialSel;
                          },
                          onChange: () => onTogglePage?.(),
                          "aria-label": t("table.selectAllAria"),
                          className: "h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-600 dark:checked:bg-primary-500 dark:focus:ring-primary-400 cursor-pointer"
                        }
                      ) }),
                      headerGroup.headers.map((header) => {
                        const colId = header.column.id;
                        const smartCol = smartColumns.find((c) => c.id === colId);
                        const isFixed = smartCol?.fixed ?? false;
                        const isActive = hasIndicator(colId);
                        const sortDir = allSettings[colId]?.sort;
                        const isDragging = dragColId === colId;
                        const isDropping = dropTarget === colId;
                        return /* @__PURE__ */ jsxRuntime.jsxs(
                          "th",
                          {
                            draggable: !isFixed,
                            onDragStart: isFixed ? void 0 : (e) => handleDragStart(colId, e),
                            onDragOver: (e) => handleDragOver(colId, e),
                            onDrop: (e) => handleDrop(colId, e),
                            onDragEnd: handleDragEnd,
                            onDragLeave: () => {
                              if (dropTarget === colId) setDropTarget(null);
                            },
                            "aria-sort": sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : void 0,
                            className: clsx.clsx(
                              "group relative px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400",
                              !allSettings[colId]?.style?.textAlign && "text-left",
                              "transition-colors duration-150 cursor-grab active:cursor-grabbing",
                              "hover:bg-slate-100/50 dark:hover:bg-slate-700/30",
                              isDragging && "opacity-40",
                              isDropping && "bg-primary-50 dark:bg-primary-900/20"
                            ),
                            style: {
                              width: header.getSize(),
                              ...cellStyleMap[colId] ?? {}
                            },
                            children: [
                              isDropping && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "absolute left-0 top-0 bottom-0 w-0.5 bg-primary-500 z-10" }),
                              header.isPlaceholder ? null : /* @__PURE__ */ jsxRuntime.jsxs(
                                "div",
                                {
                                  className: clsx.clsx(
                                    "group/header flex items-center cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300 min-w-0 relative",
                                    isActive && "text-primary-600 dark:text-primary-400",
                                    allSettings[colId]?.style?.textAlign === "center" && "justify-center",
                                    allSettings[colId]?.style?.textAlign === "right" && "justify-end"
                                  ),
                                  onClick: (e) => {
                                    if (e.target.closest("[data-header-menu-trigger]")) return;
                                    handleHeaderClick(colId, e);
                                  },
                                  onContextMenu: (e) => {
                                    e.preventDefault();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    openHeaderPopup(colId, rect);
                                  },
                                  title: t("table.headerSortHint"),
                                  children: [
                                    /* @__PURE__ */ jsxRuntime.jsx("span", { className: "truncate", children: reactTable.flexRender(header.column.columnDef.header, header.getContext()) }),
                                    (sortDir || isActive) && /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "ml-1 flex shrink-0 items-center gap-0.5", children: [
                                      sortDir === "asc" && /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowUp, { className: "h-3 w-3 text-primary-600 dark:text-primary-400" }),
                                      sortDir === "desc" && /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowDown, { className: "h-3 w-3 text-primary-600 dark:text-primary-400" }),
                                      sortDir && (() => {
                                        const sortedCols = Object.entries(allSettings).filter(([, s]) => s.sort).map(([k]) => k);
                                        if (sortedCols.length <= 1) return null;
                                        const pos = sortedCols.indexOf(colId) + 1;
                                        return /* @__PURE__ */ jsxRuntime.jsx("span", { className: "inline-flex h-3 min-w-[12px] items-center justify-center rounded-full bg-primary-500 px-0.5 text-[9px] font-bold text-white", children: pos });
                                      })(),
                                      isActive && !sortDir && /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Filter, { className: "h-3 w-3 text-primary-500 dark:text-primary-300" })
                                    ] }),
                                    /* @__PURE__ */ jsxRuntime.jsx(
                                      "button",
                                      {
                                        type: "button",
                                        "data-header-menu-trigger": true,
                                        onClick: (e) => {
                                          e.stopPropagation();
                                          if (activePopupId === colId && closeHeaderPopup) {
                                            closeHeaderPopup();
                                            return;
                                          }
                                          const rect = e.currentTarget.closest("th").getBoundingClientRect();
                                          openHeaderPopup(colId, rect);
                                        },
                                        "aria-label": t("table.columnOptions"),
                                        className: clsx.clsx(
                                          "ml-auto shrink-0 rounded p-0.5 transition-opacity",
                                          "opacity-0 group-hover/header:opacity-100 focus:opacity-100",
                                          (isActive || activePopupId === colId) && "opacity-100",
                                          activePopupId === colId ? "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300" : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        ),
                                        title: t("table.filterAggregateStyle"),
                                        children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronDown, { className: clsx.clsx("h-3.5 w-3.5 transition-transform", activePopupId === colId && "rotate-180") })
                                      }
                                    )
                                  ]
                                }
                              ),
                              !isFixed && /* @__PURE__ */ jsxRuntime.jsx(
                                "div",
                                {
                                  onMouseDown: (e) => onResizeStart(header, e),
                                  onTouchStart: (e) => onResizeStart(header, e),
                                  onDoubleClick: () => header.column.resetSize(),
                                  className: clsx.clsx(
                                    "absolute right-0 top-0 h-full w-4 -mr-2 z-20",
                                    "cursor-col-resize select-none touch-none",
                                    "flex items-center justify-center",
                                    "group/resize"
                                  ),
                                  children: /* @__PURE__ */ jsxRuntime.jsx(
                                    "div",
                                    {
                                      className: clsx.clsx(
                                        "h-2/3 w-px rounded-full transition-all duration-150",
                                        header.column.getIsResizing() ? "w-0.5 bg-primary-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]" : "bg-transparent group-hover/resize:bg-slate-300 dark:group-hover/resize:bg-slate-600 group-hover/resize:w-0.5"
                                      )
                                    }
                                  )
                                }
                              )
                            ]
                          },
                          header.id
                        );
                      }),
                      /* @__PURE__ */ jsxRuntime.jsx(
                        "th",
                        {
                          className: "sticky right-0 z-30 w-[44px] bg-slate-50 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 px-0 py-3",
                          children: /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: cogRef, className: "flex items-center justify-center", children: [
                            showCogHint && !cogOpen && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "absolute right-full mr-2 top-1/2 -translate-y-1/2 z-40 flex items-center animate-bounce-gentle", children: [
                              /* @__PURE__ */ jsxRuntime.jsx("span", { className: "whitespace-nowrap rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-amber-400 dark:text-slate-900", children: t("table.customizeColumns") }),
                              /* @__PURE__ */ jsxRuntime.jsx("span", { className: "w-0 h-0 border-y-[5px] border-y-transparent border-l-[6px] border-l-amber-500 dark:border-l-amber-400 shrink-0" })
                            ] }),
                            /* @__PURE__ */ jsxRuntime.jsx(
                              "button",
                              {
                                ref: cogBtnRef,
                                onClick: () => {
                                  dismissCogHint();
                                  if (!cogOpen && cogBtnRef.current) setCogRect(cogBtnRef.current.getBoundingClientRect());
                                  setCogOpen(!cogOpen);
                                },
                                className: clsx.clsx(
                                  "p-1 rounded-md transition-colors",
                                  showCogHint && !cogOpen ? "text-amber-500 dark:text-amber-400 ring-2 ring-amber-300 dark:ring-amber-500/50 bg-amber-50 dark:bg-amber-900/40" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                ),
                                children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Settings, { className: "h-3.5 w-3.5" })
                              }
                            ),
                            cogOpen && cogRect && /* @__PURE__ */ jsxRuntime.jsxs(
                              "div",
                              {
                                className: "fixed w-60 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900",
                                style: { top: cogRect.bottom + 4, right: window.innerWidth - cogRect.right, zIndex: 9999 },
                                children: [
                                  /* @__PURE__ */ jsxRuntime.jsxs(
                                    "button",
                                    {
                                      onClick: toggleFitColumns,
                                      className: "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                                      children: [
                                        /* @__PURE__ */ jsxRuntime.jsx("div", { className: clsx.clsx(
                                          "flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0",
                                          fitColumns ? "border-primary-500 bg-primary-500 text-white" : "border-slate-300 dark:border-slate-600"
                                        ), children: fitColumns && /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Check, { className: "h-3 w-3" }) }),
                                        t("table.fitToWidth")
                                      ]
                                    }
                                  ),
                                  /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-100 dark:border-slate-800 px-3 py-2", children: [
                                    /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5", children: t("table.columns") }),
                                    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "space-y-0.5", children: smartColumns.map((col) => {
                                      const visible = !hiddenColumns.has(col.id);
                                      return /* @__PURE__ */ jsxRuntime.jsxs(
                                        "button",
                                        {
                                          onClick: () => toggleColumn(col.id),
                                          className: "flex w-full items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors",
                                          children: [
                                            visible ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Eye, { className: "h-3.5 w-3.5 text-primary-500 shrink-0" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.EyeOff, { className: "h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" }),
                                            /* @__PURE__ */ jsxRuntime.jsx("span", { className: clsx.clsx(
                                              "text-left truncate",
                                              visible ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-400"
                                            ), children: col.header })
                                          ]
                                        },
                                        col.id
                                      );
                                    }) })
                                  ] })
                                ]
                              }
                            )
                          ] })
                        }
                      )
                    ]
                  },
                  headerGroup.id
                )) }),
                /* @__PURE__ */ jsxRuntime.jsx("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: loading ? skeletonRows.map((i) => /* @__PURE__ */ jsxRuntime.jsxs("tr", { children: [
                  enableSelection && /* @__PURE__ */ jsxRuntime.jsx("td", { className: "w-[40px] px-2 py-3 text-center", children: /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-4 w-4 mx-auto animate-pulse rounded bg-slate-200 dark:bg-slate-700" }) }),
                  table.getVisibleFlatColumns().map((col) => /* @__PURE__ */ jsxRuntime.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" }) }, col.id)),
                  /* @__PURE__ */ jsxRuntime.jsx("td", { className: "sticky right-0 z-10 w-[44px] bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800" })
                ] }, i)) : rows.map((row, rowIdx) => {
                  const stripeBg = rowIdx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/70 dark:bg-slate-800/30";
                  const rowId = enableSelection && getRowId ? getRowId(row.original) : "";
                  const rowChecked = enableSelection && isSelected ? isSelected(rowId) : false;
                  const isFocused = focusedRowIdx === rowIdx;
                  const rowBg = rowChecked ? "bg-primary-50 dark:bg-primary-950/40" : isFocused ? "bg-primary-50/60 dark:bg-primary-950/20" : stripeBg;
                  return /* @__PURE__ */ jsxRuntime.jsxs(
                    "tr",
                    {
                      onClick: () => {
                        setFocusedRowIdx(rowIdx);
                        onRowClick?.(row.original);
                      },
                      className: clsx.clsx(
                        "transition-colors duration-100 group/row",
                        rowBg,
                        isFocused && "ring-1 ring-primary-400 ring-inset",
                        onRowClick && "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-700/50"
                      ),
                      children: [
                        enableSelection && /* @__PURE__ */ jsxRuntime.jsx(
                          "td",
                          {
                            className: clsx.clsx(
                              "w-[40px] px-2 py-3 text-center",
                              rowBg,
                              rowChecked && "border-l-2 border-l-primary-500"
                            ),
                            onClick: (e) => e.stopPropagation(),
                            children: /* @__PURE__ */ jsxRuntime.jsx(
                              "input",
                              {
                                type: "checkbox",
                                checked: rowChecked,
                                onChange: () => onToggleRow?.(rowId),
                                "aria-label": t("selection.selectRowAriaLabel"),
                                className: "h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-600 dark:checked:bg-primary-500 dark:focus:ring-primary-400 cursor-pointer"
                              }
                            )
                          }
                        ),
                        row.getVisibleCells().map((cell) => {
                          const typo = getTypoStyle(allSettings[cell.column.id]?.style);
                          const content = reactTable.flexRender(cell.column.columnDef.cell, cell.getContext());
                          const smartCol = smartColumns.find((c) => c.id === cell.column.id);
                          return /* @__PURE__ */ jsxRuntime.jsx(
                            "td",
                            {
                              onContextMenu: (e) => {
                                if (!smartCol) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setCellContext({
                                  x: e.clientX,
                                  y: e.clientY,
                                  row: row.original,
                                  column: smartCol,
                                  cellValue: cell.getValue()
                                });
                              },
                              className: clsx.clsx(
                                "overflow-hidden px-4 py-3 text-slate-700 dark:text-slate-300",
                                dragColId === cell.column.id && "opacity-40"
                              ),
                              style: {
                                maxWidth: cell.column.getSize(),
                                ...cellStyleMap[cell.column.id] ?? {}
                              },
                              children: /* @__PURE__ */ jsxRuntime.jsx(
                                "div",
                                {
                                  className: clsx.clsx(
                                    "truncate",
                                    typo?.fontWeight && "col-typo-weight",
                                    typo?.fontStyle && "col-typo-style"
                                  ),
                                  style: typo ?? void 0,
                                  children: content
                                }
                              )
                            },
                            cell.id
                          );
                        }),
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "td",
                          {
                            className: clsx.clsx(
                              "sticky right-0 z-10 w-[44px] border-l border-slate-100 dark:border-slate-800 px-0 py-3",
                              rowBg,
                              onRowClick && "group-hover/row:bg-blue-50/50 dark:group-hover/row:bg-slate-700/50"
                            ),
                            children: onRowClick && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center justify-center", children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronRight, { className: "h-4 w-4 text-slate-300 dark:text-slate-600 group-hover/row:text-slate-500 dark:group-hover/row:text-slate-400 transition-colors" }) })
                          }
                        )
                      ]
                    },
                    row.id
                  );
                }) }),
                hasAggregations && /* @__PURE__ */ jsxRuntime.jsx("tfoot", { className: "sticky bottom-0 z-20", children: /* @__PURE__ */ jsxRuntime.jsxs("tr", { className: "bg-slate-50 dark:bg-slate-800", children: [
                  enableSelection && /* @__PURE__ */ jsxRuntime.jsx("td", { className: "w-[40px] px-2 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-600" }),
                  table.getVisibleLeafColumns().map((col) => {
                    const agg = aggregations[col.id];
                    const sc = smartColumns.find((c) => c.id === col.id);
                    return /* @__PURE__ */ jsxRuntime.jsx(
                      "td",
                      {
                        className: "px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-600",
                        style: cellStyleMap[col.id] ?? {},
                        children: agg ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col", children: [
                          /* @__PURE__ */ jsxRuntime.jsxs(
                            "span",
                            {
                              className: "text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-400 font-medium leading-tight",
                              title: aggregatedTotalRows != null && aggregatedRowCount != null && aggregatedTotalRows > aggregatedRowCount ? t("footer.computedHint", { loaded: aggregatedRowCount, total: aggregatedTotalRows }) : void 0,
                              children: [
                                getAggLabel(agg.fn, t),
                                aggregatedRowCount != null && aggregatedTotalRows != null && aggregatedTotalRows > aggregatedRowCount && /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "ml-1 text-slate-500 dark:text-slate-300 normal-case tracking-normal", children: [
                                  "\xB7 ",
                                  aggregatedRowCount,
                                  "/",
                                  aggregatedTotalRows
                                ] })
                              ]
                            }
                          ),
                          /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-sm font-medium text-slate-700 dark:text-slate-300", children: agg.value == null ? "\u2014" : agg.fn === "count" ? agg.value.toLocaleString("fr-FR") : sc?.footerFormat ? sc.footerFormat(agg.value) : sc?.type === "date" ? new Date(agg.value).toLocaleDateString("fr-FR") : agg.fn === "avg" ? agg.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : agg.value.toLocaleString("fr-FR") })
                        ] }) : null
                      },
                      col.id
                    );
                  }),
                  /* @__PURE__ */ jsxRuntime.jsx("td", { className: "sticky right-0 z-10 w-[44px] bg-slate-50 dark:bg-slate-800 border-l border-slate-100 dark:border-slate-800 border-t border-t-slate-300 dark:border-t-slate-600" })
                ] }) })
              ]
            }
          ),
          !loading && rows.length === 0 && /* @__PURE__ */ jsxRuntime.jsx(
            EmptyState,
            {
              title: emptyTitle,
              action: emptyAction ? /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: emptyAction.onClick,
                  className: "rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700",
                  children: emptyAction.label
                }
              ) : void 0
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      CellContextMenu,
      {
        target: cellContext,
        onClose: () => setCellContext(null),
        onOpenRow: onRowClick,
        onHideColumn: toggleColumn,
        onCopyRow: (row) => {
          const line = smartColumns.filter((c) => !hiddenColumns.has(c.id)).map((c) => {
            const accessor = c.accessorKey ? (r) => r[c.accessorKey] : c.accessorFn;
            const v = accessor ? accessor(row) : "";
            return v == null ? "" : String(v).replace(/\t/g, " ").replace(/\n/g, " ");
          }).join("	");
          navigator.clipboard.writeText(line).catch(() => {
          });
        }
      }
    ),
    scrolledDown && rows.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        onClick: () => scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" }),
        className: "absolute left-[1px] right-[10px] top-[48px] z-30 h-8 flex items-start justify-center cursor-pointer bg-gradient-to-b from-white/80 via-white/40 to-transparent dark:from-slate-900/80 dark:via-slate-900/40 dark:to-transparent",
        children: /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors", children: [
          /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronUp, { className: "h-3 w-3" }),
          t("scrollUp")
        ] })
      }
    )
  ] });
}
function EmptyState({ icon: Icon, title, action }) {
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-col items-center justify-center gap-3 py-12 text-center", children: [
    Icon && /* @__PURE__ */ jsxRuntime.jsx(Icon, { className: "h-10 w-10 text-slate-300 dark:text-slate-600" }),
    /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-sm text-slate-500 dark:text-slate-400", children: title }),
    action
  ] });
}
var SCROLL_MODE_KEY = "smartdt-scroll-mode";
function getScrollMode() {
  try {
    return localStorage.getItem(SCROLL_MODE_KEY) || "pagination";
  } catch {
    return "pagination";
  }
}
function setScrollMode(mode) {
  try {
    localStorage.setItem(SCROLL_MODE_KEY, mode);
  } catch {
  }
}
var PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
function SmartPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  showScrollToggle,
  onScrollModeChange
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const getPageNumbers = () => {
    const pages = [];
    const delta = 2;
    const start = Math.max(2, page - delta);
    const end = Math.min(totalPages - 1, page + delta);
    pages.push(1);
    if (start > 2) pages.push("ellipsis");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push("ellipsis");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 text-sm", children: [
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-3 text-slate-500 dark:text-slate-400", children: [
      /* @__PURE__ */ jsxRuntime.jsx("span", { children: t("pagination.rangeOf", { from, to, total }) }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "select",
        {
          value: pageSize,
          onChange: (e) => onPageSizeChange(Number(e.target.value)),
          className: "rounded-lg border border-slate-300 bg-white pl-3 pr-7 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat",
          children: PAGE_SIZE_OPTIONS.map((s) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: s, children: t("pagination.perPage", { count: s }) }, s))
        }
      ),
      showScrollToggle && /* @__PURE__ */ jsxRuntime.jsxs(
        "button",
        {
          onClick: () => {
            setScrollMode("infinite");
            onScrollModeChange?.("infinite");
          },
          className: "flex items-center gap-1 px-2 py-1 text-xs text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-lg transition-colors",
          title: t("pagination.infiniteScrollHint"),
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowDownToLine, { className: "w-3.5 h-3.5" }),
            /* @__PURE__ */ jsxRuntime.jsx("span", { className: "hidden sm:inline", children: t("pagination.infiniteScroll") })
          ]
        }
      )
    ] }),
    totalPages > 1 && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        NavButton,
        {
          onClick: () => onPageChange(1),
          disabled: page === 1,
          label: t("pagination.firstPage"),
          children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronsLeft, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        NavButton,
        {
          onClick: () => onPageChange(page - 1),
          disabled: page === 1,
          label: t("pagination.previousPage"),
          children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronLeft, { className: "h-4 w-4" })
        }
      ),
      getPageNumbers().map(
        (p, i) => p === "ellipsis" ? /* @__PURE__ */ jsxRuntime.jsx("span", { className: "px-1.5 text-slate-400", children: "..." }, `e${i}`) : /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            onClick: () => onPageChange(p),
            className: clsx.clsx(
              "flex h-8 min-w-[2rem] items-center justify-center rounded-lg text-sm font-medium transition-colors",
              p === page ? "bg-primary-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            ),
            children: p
          },
          p
        )
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        NavButton,
        {
          onClick: () => onPageChange(page + 1),
          disabled: page >= totalPages,
          label: t("pagination.nextPage"),
          children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronRight, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsx(
        NavButton,
        {
          onClick: () => onPageChange(totalPages),
          disabled: page >= totalPages,
          label: t("pagination.lastPage"),
          children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronsRight, { className: "h-4 w-4" })
        }
      )
    ] })
  ] });
}
function NavButton({
  onClick,
  disabled,
  label,
  children
}) {
  return /* @__PURE__ */ jsxRuntime.jsx(
    "button",
    {
      onClick,
      disabled,
      "aria-label": label,
      className: "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors",
      children
    }
  );
}
function Accordion({
  title,
  icon,
  defaultOpen = false,
  children
}) {
  const [open, setOpen] = react.useState(defaultOpen);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-200 dark:border-slate-700", children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        onClick: () => setOpen(!open),
        className: "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "flex items-center gap-2", children: [
            icon,
            title
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronDown, { className: clsx.clsx("h-4 w-4 transition-transform", open && "rotate-180") })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "px-4 pb-3", children })
  ] });
}
var PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#1e293b"
];
function ColorDot({
  label,
  value,
  onChange
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const [open, setOpen] = react.useState(false);
  const ref = react.useRef(null);
  const active = value || "";
  react.useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { ref, className: "relative flex items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-xs text-slate-500 dark:text-slate-400 w-24 shrink-0", children: label }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        onClick: () => setOpen(!open),
        className: clsx.clsx(
          "h-6 w-6 rounded-md border transition-transform hover:scale-110 shrink-0",
          active ? "border-slate-300 dark:border-slate-600" : "border-dashed border-slate-300 dark:border-slate-600 bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:8px_8px]"
        ),
        style: active ? { backgroundColor: active } : void 0
      }
    ),
    active && /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        onClick: () => onChange(""),
        className: "text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300",
        title: t("remove"),
        children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-3 w-3" })
      }
    ),
    open && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "absolute left-24 top-full mt-1 z-50 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900 w-[200px]", children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { className: "grid grid-cols-6 gap-1.5", children: PRESET_COLORS.map((c) => /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          onClick: () => {
            onChange(c);
            setOpen(false);
          },
          className: clsx.clsx(
            "h-6 w-6 rounded-md border transition-transform hover:scale-110",
            active === c ? "border-primary-500 ring-1 ring-primary-300 dark:ring-primary-700" : "border-slate-200 dark:border-slate-600"
          ),
          style: { backgroundColor: c }
        },
        c
      )) }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mt-2 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-2", children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "input",
          {
            type: "color",
            value: active || "#3b82f6",
            onChange: (e) => {
              onChange(e.target.value);
              setOpen(false);
            },
            className: "h-6 w-6 cursor-pointer rounded border-0 p-0"
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-[10px] text-slate-400", children: t("custom") })
      ] })
    ] })
  ] });
}
function ButtonGroup({
  options,
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntime.jsx("div", { className: "inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden", children: options.map((opt) => /* @__PURE__ */ jsxRuntime.jsx(
    "button",
    {
      onClick: () => onChange(opt.value),
      className: clsx.clsx(
        "px-2.5 py-1 text-xs font-medium transition-colors",
        opt.value === value ? "bg-primary-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      ),
      children: opt.label
    },
    opt.value
  )) });
}
function ColumnStyler({ style, setStyle }) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  return /* @__PURE__ */ jsxRuntime.jsx(Accordion, { title: t("appearance.title"), icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Paintbrush, { className: "h-4 w-4" }), defaultOpen: false, children: /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-2.5", children: [
    /* @__PURE__ */ jsxRuntime.jsx(
      ColorDot,
      {
        label: t("appearance.borderLeft"),
        value: style.borderLeft ?? "",
        onChange: (v) => setStyle({ ...style, borderLeft: v || void 0 })
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      ColorDot,
      {
        label: t("appearance.borderRight"),
        value: style.borderRight ?? "",
        onChange: (v) => setStyle({ ...style, borderRight: v || void 0 })
      }
    ),
    /* @__PURE__ */ jsxRuntime.jsx(
      ColorDot,
      {
        label: t("appearance.background"),
        value: style.background ?? "",
        onChange: (v) => setStyle({ ...style, background: v || void 0 })
      }
    ),
    (style.borderLeft || style.borderRight) && /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1.5 text-xs text-slate-500 dark:text-slate-400", children: t("appearance.borderWidth") }),
      /* @__PURE__ */ jsxRuntime.jsx(
        ButtonGroup,
        {
          options: [
            { value: "1px", label: t("appearance.thin") },
            { value: "2px", label: t("appearance.medium") },
            { value: "3px", label: t("appearance.thick") }
          ],
          value: style.borderLeftWidth ?? "1px",
          onChange: (v) => setStyle({ ...style, borderLeftWidth: v })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "border-t border-slate-100 dark:border-slate-800" }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1.5 text-xs text-slate-500 dark:text-slate-400", children: t("appearance.weight") }),
      /* @__PURE__ */ jsxRuntime.jsx(
        ButtonGroup,
        {
          options: [
            { value: "300", label: t("appearance.light") },
            { value: "400", label: t("appearance.normal") },
            { value: "700", label: t("appearance.bold") },
            { value: "900", label: t("appearance.heavy") }
          ],
          value: style.fontWeight ?? "400",
          onChange: (v) => setStyle({ ...style, fontWeight: v })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1.5 text-xs text-slate-500 dark:text-slate-400", children: t("appearance.style") }),
      /* @__PURE__ */ jsxRuntime.jsx(
        ButtonGroup,
        {
          options: [
            { value: "normal", label: t("appearance.normal") },
            { value: "italic", label: t("appearance.italic") }
          ],
          value: style.fontStyle ?? "normal",
          onChange: (v) => setStyle({ ...style, fontStyle: v })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1.5 text-xs text-slate-500 dark:text-slate-400", children: t("appearance.size") }),
        /* @__PURE__ */ jsxRuntime.jsx(
          ButtonGroup,
          {
            options: [
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" }
            ],
            value: style.fontSize ?? "M",
            onChange: (v) => setStyle({ ...style, fontSize: v })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-1.5 text-xs text-slate-500 dark:text-slate-400", children: t("appearance.alignment") }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { className: "inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden", children: [
          { value: "left", icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.AlignLeft, { className: "h-3.5 w-3.5" }) },
          { value: "center", icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.AlignCenter, { className: "h-3.5 w-3.5" }) },
          { value: "right", icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.AlignRight, { className: "h-3.5 w-3.5" }) }
        ].map((opt) => /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            onClick: () => setStyle({ ...style, textAlign: opt.value }),
            className: clsx.clsx(
              "px-2.5 py-1 transition-colors",
              (style.textAlign ?? "left") === opt.value ? "bg-primary-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            ),
            children: opt.icon
          },
          opt.value
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "div",
      {
        className: "mt-1 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700",
        style: {
          borderLeftColor: style.borderLeft || void 0,
          borderLeftWidth: style.borderLeft ? style.borderLeftWidth ?? "1px" : void 0,
          borderRightColor: style.borderRight || void 0,
          borderRightWidth: style.borderRight ? style.borderLeftWidth ?? "1px" : void 0,
          backgroundColor: style.background ? style.background + "20" : void 0,
          fontWeight: style.fontWeight ?? void 0,
          fontStyle: style.fontStyle ?? void 0,
          fontSize: style.fontSize === "S" ? "12px" : style.fontSize === "L" ? "16px" : "14px",
          textAlign: style.textAlign ?? void 0
        },
        children: /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-slate-600 dark:text-slate-400", children: t("appearance.sampleText") })
      }
    )
  ] }) });
}
var ENTITY_VARIABLES = {};
var DEFAULT_TEMPLATES = {};
function Accordion2({
  title,
  icon,
  defaultOpen = false,
  children
}) {
  const [open, setOpen] = react.useState(defaultOpen);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-200 dark:border-slate-700", children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        onClick: () => setOpen(!open),
        className: "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "flex items-center gap-2", children: [
            icon,
            title
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronDown, { className: clsx.clsx("h-4 w-4 transition-transform", open && "rotate-180") })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "px-4 pb-3", children })
  ] });
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function toIsoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function buildDatePresets(t) {
  return [
    {
      label: t("datePresets.today"),
      compute: () => {
        const s = toIsoDate(/* @__PURE__ */ new Date());
        return { from: s, to: s };
      }
    },
    {
      label: t("datePresets.yesterday"),
      compute: () => {
        const d = /* @__PURE__ */ new Date();
        d.setDate(d.getDate() - 1);
        const s = toIsoDate(d);
        return { from: s, to: s };
      }
    },
    {
      label: t("datePresets.last7Days"),
      compute: () => {
        const to = /* @__PURE__ */ new Date();
        const from = /* @__PURE__ */ new Date();
        from.setDate(from.getDate() - 6);
        return { from: toIsoDate(from), to: toIsoDate(to) };
      }
    },
    {
      label: t("datePresets.last30Days"),
      compute: () => {
        const to = /* @__PURE__ */ new Date();
        const from = /* @__PURE__ */ new Date();
        from.setDate(from.getDate() - 29);
        return { from: toIsoDate(from), to: toIsoDate(to) };
      }
    },
    {
      label: t("datePresets.thisMonth"),
      compute: () => {
        const now = /* @__PURE__ */ new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: toIsoDate(from), to: toIsoDate(to) };
      }
    },
    {
      label: t("datePresets.lastMonth"),
      compute: () => {
        const now = /* @__PURE__ */ new Date();
        const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const to = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: toIsoDate(from), to: toIsoDate(to) };
      }
    },
    {
      label: t("datePresets.thisYear"),
      compute: () => {
        const y = (/* @__PURE__ */ new Date()).getFullYear();
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      }
    },
    {
      label: t("datePresets.lastYear"),
      compute: () => {
        const y = (/* @__PURE__ */ new Date()).getFullYear() - 1;
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      }
    }
  ];
}
function looksLikeDateValues(values) {
  if (values.length === 0) return false;
  const sample = values.slice(0, Math.min(30, values.length));
  const iso = /^\d{4}-\d{2}-\d{2}/;
  const fr = /^\d{2}\/\d{2}\/\d{4}/;
  let matches = 0;
  for (const v of sample) {
    if (iso.test(v) || fr.test(v)) {
      matches++;
      continue;
    }
    const t = Date.parse(v);
    if (!isNaN(t) && v.length >= 8) matches++;
  }
  return matches / sample.length >= 0.7;
}
function ColumnPopup({
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
  onEntityConfigSave
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const datePresets = react.useMemo(() => buildDatePresets(t), [t]);
  const [addColumnOpen, setAddColumnOpen] = react.useState(false);
  const [addColumnSearch, setAddColumnSearch] = react.useState("");
  const [sort, setSort] = react.useState(currentSettings.sort ?? null);
  const [filterTextOp, setFilterTextOp] = react.useState(currentSettings.filterTextOp ?? "contains");
  const [filterText, setFilterText] = react.useState(currentSettings.filterText ?? "");
  const [filterDateFrom, setFilterDateFrom] = react.useState(currentSettings.filterDateFrom ?? "");
  const [filterDateTo, setFilterDateTo] = react.useState(currentSettings.filterDateTo ?? "");
  const [filterTimeFrom, setFilterTimeFrom] = react.useState(currentSettings.filterTimeFrom ?? "");
  const [filterTimeTo, setFilterTimeTo] = react.useState(currentSettings.filterTimeTo ?? "");
  const [selectedValues, setSelectedValues] = react.useState(
    new Set(currentSettings.filterValues ?? [])
  );
  const [style, setStyle] = react.useState(currentSettings.style ?? {});
  const [aggFn, setAggFn] = react.useState(currentSettings.aggFn ?? column.footerAgg ?? null);
  const [filterNumberOp, setFilterNumberOp] = react.useState(currentSettings.filterNumberOp ?? "between");
  const [filterNumberFrom, setFilterNumberFrom] = react.useState(currentSettings.filterNumberFrom != null ? String(currentSettings.filterNumberFrom) : "");
  const [filterNumberTo, setFilterNumberTo] = react.useState(currentSettings.filterNumberTo != null ? String(currentSettings.filterNumberTo) : "");
  const [optionSearch, setOptionSearch] = react.useState("");
  const hasEntityDesigner = !!(column.entityType && entityConfig);
  const entityVars = column.entityType ? ENTITY_VARIABLES[column.entityType] ?? [] : [];
  const entityDefaults = column.entityType ? DEFAULT_TEMPLATES[column.entityType] : void 0;
  const [entityMainLine, setEntityMainLine] = react.useState(entityConfig?.mainLine ?? entityDefaults?.mainLine ?? "");
  const [entitySubLine, setEntitySubLine] = react.useState(entityConfig?.subLine ?? entityDefaults?.subLine ?? "");
  const [entitySortField, setEntitySortField] = react.useState(entityConfig?.sortField ?? entityDefaults?.sortField ?? "");
  const [entityActiveInput, setEntityActiveInput] = react.useState("main");
  const entityMainRef = react.useRef(null);
  const entitySubRef = react.useRef(null);
  const entityGrouped = react.useMemo(() => {
    const groups = /* @__PURE__ */ new Map();
    entityVars.forEach((v) => {
      if (!groups.has(v.group)) groups.set(v.group, []);
      groups.get(v.group).push(v);
    });
    return Array.from(groups.entries());
  }, [entityVars]);
  const entityFormatMap = react.useMemo(() => {
    const map = {};
    entityVars.forEach((v) => {
      if (v.format) map[v.key] = v.format;
    });
    return map;
  }, [entityVars]);
  const insertEntityVar = (varKey) => {
    const token = `{${varKey}}`;
    const ref = entityActiveInput === "main" ? entityMainRef.current : entitySubRef.current;
    const setter = entityActiveInput === "main" ? setEntityMainLine : setEntitySubLine;
    if (ref) {
      const start = ref.selectionStart ?? ref.value.length;
      const end = ref.selectionEnd ?? start;
      const before = ref.value.slice(0, start);
      const after = ref.value.slice(end);
      const sep = before && !before.endsWith(" ") && !before.endsWith("\u2014") ? " " : "";
      const newVal = before + sep + token + after;
      setter(newVal);
      requestAnimationFrame(() => {
        const pos = (before + sep + token).length;
        ref.setSelectionRange(pos, pos);
        ref.focus();
      });
    } else {
      setter((prev) => prev ? prev + " " + token : token);
    }
  };
  const [designerOpen, setDesignerOpen] = react.useState(false);
  const panelRef = react.useRef(null);
  const uniqueValues = react.useMemo(() => {
    const accessor = column.accessorKey ? (row) => row[column.accessorKey] : column.accessorFn;
    if (!accessor) return [];
    const vals = /* @__PURE__ */ new Map();
    data.forEach((row) => {
      const raw = accessor(row);
      const v = raw == null ? "" : String(raw);
      if (v) {
        const existing = vals.get(v);
        if (existing) existing.count++;
        else vals.set(v, { value: v, count: 1 });
      }
    });
    return Array.from(vals.values()).sort((a, b) => a.value.localeCompare(b.value));
  }, [data, column]);
  const isDateColumn = react.useMemo(() => {
    if (column.type === "date") return true;
    if (column.type === "time" || column.type === "number") return false;
    if (column.filterOptions) return false;
    const headerLooksLikeDate = /date|jour|quand/i.test(column.header);
    if (!headerLooksLikeDate) return false;
    return looksLikeDateValues(uniqueValues.map((v) => v.value));
  }, [column.type, column.filterOptions, column.header, uniqueValues]);
  const isTimeColumn = column.type === "time";
  const isNumberColumn = react.useMemo(() => {
    if (isDateColumn) return false;
    if (column.type === "number") return true;
    if (column.filterOptions) return false;
    if (column.footerAgg) return true;
    if (uniqueValues.length === 0) return false;
    return uniqueValues.every((v) => !isNaN(Number(v.value)));
  }, [column.type, column.filterOptions, column.footerAgg, uniqueValues, isDateColumn]);
  const filterOptions = react.useMemo(() => {
    if (column.filterOptions) return column.filterOptions;
    return uniqueValues.map((v) => ({ value: v.value, label: v.value }));
  }, [column.filterOptions, uniqueValues]);
  const hasExplicitOptions = !!column.filterOptions;
  const showCheckboxes = (column.filterable ?? true) && !isDateColumn && !isTimeColumn && !isNumberColumn && filterOptions.length > 0 && (hasExplicitOptions || filterOptions.length < 50);
  const needsSearch = filterOptions.length > 10;
  const aggOptions = allowedAggFns(column.type ?? (isDateColumn ? "date" : isNumberColumn ? "number" : void 0));
  const filteredOptions = react.useMemo(() => {
    if (!optionSearch) return filterOptions;
    const q = optionSearch.toLowerCase();
    return filterOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [filterOptions, optionSearch]);
  const allSelected = selectedValues.size === 0;
  const toggleValue = (v) => {
    setSelectedValues((prev) => {
      const clean = new Set(Array.from(prev).filter((x) => filterOptions.some((o) => o.value === x)));
      if (clean.size === 0 && prev.size === 0) {
        const next2 = new Set(filterOptions.map((o) => o.value));
        next2.delete(v);
        return next2;
      }
      if (clean.size === 0) return /* @__PURE__ */ new Set([v]);
      const next = new Set(clean);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      if (next.size === filterOptions.length) return /* @__PURE__ */ new Set();
      return next;
    });
  };
  const selectAll = () => setSelectedValues(/* @__PURE__ */ new Set());
  const selectNone = () => setSelectedValues(/* @__PURE__ */ new Set(["__NONE__"]));
  const renderOptionLabel = (opt) => {
    if (opt.render) return opt.render;
    if (hasExplicitOptions && column.cell && column.accessorKey) {
      const fakeRow = { [column.accessorKey]: opt.value };
      return column.cell({ row: fakeRow, value: opt.value });
    }
    return /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-sm text-slate-700 dark:text-slate-300", children: opt.label });
  };
  react.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  react.useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);
  const isTextFilter = !isDateColumn && !isTimeColumn && !isNumberColumn && !showCheckboxes;
  const needsTextInput = isTextFilter && filterTextOp !== "empty" && filterTextOp !== "notEmpty";
  const needsNumberValue = isNumberColumn && filterNumberOp !== "empty" && filterNumberOp !== "notEmpty";
  const currentSnapshot = react.useMemo(() => ({
    sort,
    filterTextOp: isTextFilter && filterTextOp !== "contains" ? filterTextOp : void 0,
    filterText: isTextFilter && needsTextInput ? filterText || void 0 : isTextFilter && !needsTextInput ? "" : void 0,
    filterDateFrom: isDateColumn && filterDateFrom ? filterDateFrom : void 0,
    filterDateTo: isDateColumn && filterDateTo ? filterDateTo : void 0,
    filterTimeFrom: isTimeColumn && filterTimeFrom ? filterTimeFrom : void 0,
    filterTimeTo: isTimeColumn && filterTimeTo ? filterTimeTo : void 0,
    filterNumberOp: isNumberColumn && filterNumberOp !== "between" ? filterNumberOp : void 0,
    filterNumberFrom: isNumberColumn && needsNumberValue && filterNumberFrom !== "" ? Number(filterNumberFrom) : void 0,
    filterNumberTo: isNumberColumn && needsNumberValue && filterNumberOp === "between" && filterNumberTo !== "" ? Number(filterNumberTo) : void 0,
    filterValues: (() => {
      if (!showCheckboxes) return void 0;
      const real = Array.from(selectedValues).filter((v) => filterOptions.some((o) => o.value === v));
      if (selectedValues.size > 0 && real.length === 0) return ["__NONE__"];
      if (real.length > 0 && real.length < filterOptions.length) return real;
      return void 0;
    })(),
    style: Object.values(style).some((v) => v && v !== "transparent") ? style : void 0,
    aggFn: aggFn ?? void 0
  }), [sort, filterText, filterTextOp, filterDateFrom, filterDateTo, filterTimeFrom, filterTimeTo, filterNumberOp, filterNumberFrom, filterNumberTo, selectedValues, style, aggFn, isDateColumn, isTimeColumn, isNumberColumn, isTextFilter, showCheckboxes, filterOptions, needsTextInput, needsNumberValue]);
  const lastSentRef = react.useRef(JSON.stringify(currentSettings));
  react.useEffect(() => {
    const serialized = JSON.stringify(currentSnapshot);
    if (serialized === lastSentRef.current) return;
    const hasTextDelta = (currentSnapshot.filterText ?? "") !== (JSON.parse(lastSentRef.current).filterText ?? "") || (currentSnapshot.filterNumberFrom ?? null) !== (JSON.parse(lastSentRef.current).filterNumberFrom ?? null) || (currentSnapshot.filterNumberTo ?? null) !== (JSON.parse(lastSentRef.current).filterNumberTo ?? null);
    const delay = hasTextDelta ? 200 : 0;
    const timer = setTimeout(() => {
      lastSentRef.current = serialized;
      onApply(currentSnapshot);
    }, delay);
    return () => clearTimeout(timer);
  }, [currentSnapshot, onApply]);
  react.useEffect(() => {
    if (!hasEntityDesigner || !column.entityType || !onEntityConfigSave) return;
    const timer = setTimeout(() => {
      onEntityConfigSave(column.entityType, {
        mainLine: entityMainLine,
        subLine: entitySubLine || void 0,
        sortField: entitySortField || void 0
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [entityMainLine, entitySubLine, entitySortField, hasEntityDesigner, column.entityType, onEntityConfigSave]);
  const handleClearAll = () => {
    setSort(null);
    setFilterText("");
    setFilterTextOp("contains");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterTimeFrom("");
    setFilterTimeTo("");
    setFilterNumberFrom("");
    setFilterNumberTo("");
    setFilterNumberOp("between");
    setSelectedValues(/* @__PURE__ */ new Set());
    setStyle({});
    setAggFn(null);
    onClear();
  };
  const TEXT_OP_OPTIONS = [
    { value: "contains", label: t("textOp.contains") },
    { value: "equals", label: t("textOp.equals") },
    { value: "starts", label: t("textOp.starts") },
    { value: "ends", label: t("textOp.ends") },
    { value: "empty", label: t("textOp.empty") },
    { value: "notEmpty", label: t("textOp.notEmpty") }
  ];
  const NUM_OP_OPTIONS = [
    { value: "between", label: t("numOp.between") },
    { value: "eq", label: t("numOp.eq") },
    { value: "neq", label: t("numOp.neq") },
    { value: "gt", label: t("numOp.gt") },
    { value: "gte", label: t("numOp.gte") },
    { value: "lt", label: t("numOp.lt") },
    { value: "lte", label: t("numOp.lte") },
    { value: "empty", label: t("numOp.empty") },
    { value: "notEmpty", label: t("numOp.notEmpty") }
  ];
  const applyPreset = (p) => {
    const { from, to } = p.compute();
    setFilterDateFrom(from);
    setFilterDateTo(to);
  };
  const popupStyle = {};
  if (anchorRect) {
    popupStyle.position = "fixed";
    popupStyle.top = anchorRect.bottom + 4;
    const totalWidth = designerOpen ? 320 + 8 + 360 : 320;
    popupStyle.left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - totalWidth - 8));
    popupStyle.zIndex = 9999;
  }
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { ref: panelRef, style: popupStyle, className: "flex items-start gap-2", children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "div",
      {
        className: "w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-900",
        children: [
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700", children: [
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wider text-slate-400", children: t("column.label") }),
              /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-200 truncate", children: column.header })
            ] }),
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                onClick: onClose,
                className: "shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                title: t("close"),
                children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-4 w-4" })
              }
            )
          ] }),
          (column.sortable ?? true) && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "px-4 py-3", children: [
            /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400", children: t("sort.title") }),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxRuntime.jsxs(
                "button",
                {
                  onClick: () => setSort(sort === "asc" ? null : "asc"),
                  className: clsx.clsx(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    sort === "asc" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  ),
                  children: [
                    isNumberColumn ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowUp, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowUpAZ, { className: "h-3.5 w-3.5" }),
                    isNumberColumn ? t("sort.ascending") : t("sort.azc")
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntime.jsxs(
                "button",
                {
                  onClick: () => setSort(sort === "desc" ? null : "desc"),
                  className: clsx.clsx(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    sort === "desc" ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  ),
                  children: [
                    isNumberColumn ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowDown, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ArrowDownAZ, { className: "h-3.5 w-3.5" }),
                    isNumberColumn ? t("sort.descending") : t("sort.azd")
                  ]
                }
              )
            ] })
          ] }),
          (column.filterable ?? true) && /* @__PURE__ */ jsxRuntime.jsxs(Accordion2, { title: t("filter.title"), icon: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Filter, { className: "h-4 w-4" }), defaultOpen: true, children: [
            isDateColumn ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-2 mb-2", children: [
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-wrap gap-1", children: datePresets.map((p) => /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: () => applyPreset(p),
                  className: "rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-400",
                  children: p.label
                },
                p.label
              )) }),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.from") }),
                /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex-1", children: /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "date",
                    value: filterDateFrom,
                    onChange: (e) => setFilterDateFrom(e.target.value),
                    className: "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-white dark:border-slate-600"
                  }
                ) })
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.to") }),
                /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex-1", children: /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "date",
                    value: filterDateTo,
                    onChange: (e) => setFilterDateTo(e.target.value),
                    className: "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-white dark:border-slate-600"
                  }
                ) })
              ] }),
              (filterDateFrom || filterDateTo) && /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: () => {
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  },
                  className: "text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300",
                  children: t("clearDates")
                }
              )
            ] }) : isTimeColumn ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-2 mb-2", children: [
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.from") }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "time",
                    value: filterTimeFrom,
                    onChange: (e) => setFilterTimeFrom(e.target.value),
                    className: "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.to") }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "time",
                    value: filterTimeTo,
                    onChange: (e) => setFilterTimeTo(e.target.value),
                    className: "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }
                )
              ] })
            ] }) : isNumberColumn && !hasExplicitOptions ? /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-2 mb-2", children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "select",
                {
                  value: filterNumberOp,
                  onChange: (e) => setFilterNumberOp(e.target.value),
                  className: "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                  children: NUM_OP_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: o.value, children: o.label }, o.value))
                }
              ),
              needsNumberValue && (filterNumberOp === "between" ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.min") }),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    "input",
                    {
                      type: "number",
                      inputMode: "decimal",
                      value: filterNumberFrom,
                      onChange: (e) => setFilterNumberFrom(e.target.value),
                      placeholder: t("filter.min"),
                      className: "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntime.jsx("label", { className: "text-xs text-slate-500 dark:text-slate-400 w-8 shrink-0", children: t("filter.max") }),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    "input",
                    {
                      type: "number",
                      inputMode: "decimal",
                      value: filterNumberTo,
                      onChange: (e) => setFilterNumberTo(e.target.value),
                      placeholder: t("filter.max"),
                      className: "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }
                  )
                ] })
              ] }) : /* @__PURE__ */ jsxRuntime.jsx(
                "input",
                {
                  type: "number",
                  inputMode: "decimal",
                  value: filterNumberFrom,
                  onChange: (e) => setFilterNumberFrom(e.target.value),
                  placeholder: t("value"),
                  className: "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }
              ))
            ] }) : /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-2 mb-2", children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "select",
                {
                  value: filterTextOp,
                  onChange: (e) => setFilterTextOp(e.target.value),
                  className: "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                  children: TEXT_OP_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: o.value, children: o.label }, o.value))
                }
              ),
              needsTextInput && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "text",
                    autoFocus: true,
                    value: filterText,
                    onChange: (e) => setFilterText(e.target.value),
                    placeholder: filterTextOp === "contains" ? t("textOp.containsPlaceholder") : filterTextOp === "equals" ? t("textOp.equalsPlaceholder") : filterTextOp === "starts" ? t("textOp.startsPlaceholder") : filterTextOp === "ends" ? t("textOp.endsPlaceholder") : t("value"),
                    className: "w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }
                )
              ] })
            ] }),
            showCheckboxes && /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mb-1.5 flex items-center justify-between", children: [
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex gap-2", children: [
                  /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: selectAll, className: "text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400", children: t("checkbox.all") }),
                  /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: selectNone, className: "text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300", children: t("checkbox.none") })
                ] }),
                /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-[10px] text-slate-400", children: t("checkbox.valuesCount", { count: filterOptions.length }) })
              ] }),
              needsSearch && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative mb-1.5", children: [
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Search, { className: "absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" }),
                /* @__PURE__ */ jsxRuntime.jsx(
                  "input",
                  {
                    type: "text",
                    value: optionSearch,
                    onChange: (e) => setOptionSearch(e.target.value),
                    placeholder: t("search"),
                    className: "w-full rounded border border-slate-200 py-1 pl-6 pr-2 text-xs text-slate-600 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "max-h-44 overflow-y-auto space-y-0.5", children: [
                filteredOptions.map((opt) => {
                  const checked = allSelected || selectedValues.has(opt.value);
                  return /* @__PURE__ */ jsxRuntime.jsxs(
                    "label",
                    {
                      className: "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50",
                      children: [
                        /* @__PURE__ */ jsxRuntime.jsx(
                          "input",
                          {
                            type: "checkbox",
                            checked,
                            onChange: () => toggleValue(opt.value),
                            className: "rounded border-slate-300 text-primary-600 dark:text-primary-400 focus:ring-primary-500 dark:border-slate-600"
                          }
                        ),
                        /* @__PURE__ */ jsxRuntime.jsx("span", { className: "flex-1 min-w-0", children: renderOptionLabel(opt) })
                      ]
                    },
                    opt.value
                  );
                }),
                filteredOptions.length === 0 && /* @__PURE__ */ jsxRuntime.jsx("p", { className: "py-2 text-center text-xs text-slate-400", children: t("noMatchingValues") })
              ] })
            ] })
          ] }),
          aggOptions.length > 0 && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-200 dark:border-slate-700 px-4 py-3", children: [
            /* @__PURE__ */ jsxRuntime.jsx("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400", children: t("footer.title") }),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
              /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: () => setAggFn(null),
                  className: clsx.clsx(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    !aggFn ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  ),
                  children: t("footer.none")
                }
              ),
              aggOptions.map((fn) => /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: () => setAggFn(aggFn === fn ? null : fn),
                  className: clsx.clsx(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    aggFn === fn ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-400" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  ),
                  children: getAggLabel(fn, t)
                },
                fn
              ))
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(ColumnStyler, { style, setStyle }),
          hasEntityDesigner && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "border-t border-slate-200 dark:border-slate-700", children: /* @__PURE__ */ jsxRuntime.jsxs(
            "button",
            {
              onClick: () => setDesignerOpen(!designerOpen),
              className: clsx.clsx(
                "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors",
                designerOpen ? "text-primary-600 bg-primary-50/50 dark:text-primary-400 dark:bg-primary-900/20" : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
              ),
              children: [
                /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Wrench, { className: "h-4 w-4" }),
                  t("designer.open")
                ] }),
                /* @__PURE__ */ jsxRuntime.jsx(lucideReact.ChevronRight, { className: clsx.clsx("h-4 w-4 transition-transform", designerOpen && "text-primary-500") })
              ]
            }
          ) }),
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative flex items-center justify-between border-t border-slate-200 px-4 py-2.5 dark:border-slate-700", children: [
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                onClick: handleClearAll,
                className: "text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors",
                children: t("column.reset")
              }
            ),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2", children: [
              onAddHiddenColumn && hiddenColumnsList && hiddenColumnsList.length > 0 && /* @__PURE__ */ jsxRuntime.jsx(
                "button",
                {
                  onClick: () => setAddColumnOpen((v) => !v),
                  className: "inline-flex items-center justify-center h-6 w-6 rounded text-slate-500 hover:text-primary-600 hover:bg-primary-50 dark:text-slate-400 dark:hover:text-primary-400 dark:hover:bg-primary-950/30 transition-colors",
                  title: t("addColumnNext"),
                  children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { className: "h-4 w-4" })
                }
              ),
              onHide && /* @__PURE__ */ jsxRuntime.jsxs(
                "button",
                {
                  onClick: () => {
                    onHide();
                    onClose();
                  },
                  className: "inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors",
                  title: t("column.hideTooltip"),
                  children: [
                    /* @__PURE__ */ jsxRuntime.jsx(lucideReact.EyeOff, { className: "h-3.5 w-3.5" }),
                    t("column.hide")
                  ]
                }
              )
            ] }),
            addColumnOpen && hiddenColumnsList && onAddHiddenColumn && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "fixed inset-0 z-[9998]", onClick: () => setAddColumnOpen(false) }),
              /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "absolute bottom-full right-10 mb-1 z-[9999] w-60 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden", children: [
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2", children: [
                  /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Search, { className: "h-3.5 w-3.5 text-slate-400 dark:text-slate-500" }),
                  /* @__PURE__ */ jsxRuntime.jsx(
                    "input",
                    {
                      autoFocus: true,
                      value: addColumnSearch,
                      onChange: (e) => setAddColumnSearch(e.target.value),
                      placeholder: t("searchColumn"),
                      className: "flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "max-h-[240px] overflow-y-auto py-1", children: [
                  hiddenColumnsList.filter((c) => c.header.toLowerCase().includes(addColumnSearch.toLowerCase())).map((c) => /* @__PURE__ */ jsxRuntime.jsxs(
                    "button",
                    {
                      onClick: () => {
                        onAddHiddenColumn(c.id);
                        setAddColumnOpen(false);
                        setAddColumnSearch("");
                      },
                      className: "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors",
                      children: [
                        /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { className: "h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" }),
                        /* @__PURE__ */ jsxRuntime.jsx("span", { className: "truncate", children: c.header })
                      ]
                    },
                    c.id
                  )),
                  hiddenColumnsList.filter((c) => c.header.toLowerCase().includes(addColumnSearch.toLowerCase())).length === 0 && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "px-3 py-2 text-xs text-slate-400 dark:text-slate-500", children: t("noHiddenColumns") })
                ] })
              ] })
            ] })
          ] })
        ]
      }
    ),
    designerOpen && hasEntityDesigner && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "w-[360px] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-in dark:border-slate-700 dark:bg-slate-900", children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900", children: [
        /* @__PURE__ */ jsxRuntime.jsx("h3", { className: "text-sm font-semibold text-slate-800 dark:text-slate-200", children: t("designer.title") }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            onClick: () => setDesignerOpen(false),
            className: "rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300",
            children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-4 w-4" })
          }
        )
      ] }),
      sampleEntity != null && (() => {
        const hasImg = templateHasImageVar(entityMainLine, entityFormatMap) || templateHasImageVar(entitySubLine, entityFormatMap);
        const imgUrl = hasImg ? extractImageUrl(entityMainLine, sampleEntity, entityFormatMap) ?? extractImageUrl(entitySubLine, sampleEntity, entityFormatMap) : null;
        return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "mx-4 mt-3 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 dark:border-slate-700 dark:from-slate-800/50 dark:to-slate-900", children: [
          /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2", children: t("designer.preview") }),
          /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-3", children: [
            hasImg && (imgUrl ? /* @__PURE__ */ jsxRuntime.jsx("img", { src: imgUrl, alt: "", className: "h-11 w-11 rounded-lg object-cover shrink-0 bg-slate-200 dark:bg-slate-700 shadow-sm" }) : /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-11 w-11 rounded-lg shrink-0 bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-sm", children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Home, { className: "h-5 w-5 text-slate-400 dark:text-slate-500" }) })),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "text-sm font-medium text-slate-800 dark:text-slate-200 truncate", children: resolveTemplate(entityMainLine, sampleEntity, entityFormatMap) || "\u2014" }),
              entitySubLine && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5", children: resolveTemplate(entitySubLine, sampleEntity, entityFormatMap) })
            ] })
          ] })
        ] });
      })(),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "px-4 pt-4 pb-3 space-y-3", children: [
        /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntime.jsx("label", { className: "flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5", children: t("designer.mainLine") }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "input",
            {
              ref: entityMainRef,
              type: "text",
              value: entityMainLine,
              onChange: (e) => setEntityMainLine(e.target.value),
              onFocus: () => setEntityActiveInput("main"),
              className: clsx.clsx(
                "w-full rounded-lg border px-3 py-2 text-sm font-mono",
                "focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400",
                "dark:bg-slate-800 dark:text-slate-300",
                entityActiveInput === "main" ? "border-primary-400 dark:border-primary-500" : "border-slate-200 dark:border-slate-700"
              ),
              placeholder: t("designer.mainPlaceholder")
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntime.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5", children: [
            t("designer.subLine"),
            /* @__PURE__ */ jsxRuntime.jsx("span", { className: "font-normal text-slate-400 text-[10px]", children: t("designer.optional") })
          ] }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "input",
            {
              ref: entitySubRef,
              type: "text",
              value: entitySubLine,
              onChange: (e) => setEntitySubLine(e.target.value),
              onFocus: () => setEntityActiveInput("sub"),
              className: clsx.clsx(
                "w-full rounded-lg border px-3 py-2 text-sm font-mono",
                "focus:outline-none focus:ring-2 focus:ring-primary-400/30 focus:border-primary-400",
                "dark:bg-slate-800 dark:text-slate-300",
                entityActiveInput === "sub" ? "border-primary-400 dark:border-primary-500" : "border-slate-200 dark:border-slate-700"
              ),
              placeholder: t("designer.subPlaceholder")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-100 dark:border-slate-800 px-4 py-3", children: [
        /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-2.5", children: t("designer.clickToInsert") }),
        /* @__PURE__ */ jsxRuntime.jsx("div", { className: "space-y-2.5", children: entityGrouped.map(([group, vars]) => /* @__PURE__ */ jsxRuntime.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntime.jsx("p", { className: "text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1", children: group }),
          /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex flex-wrap gap-1", children: vars.map((v) => /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              onClick: () => insertEntityVar(v.key),
              title: v.key,
              className: "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-primary-600 dark:hover:text-primary-400",
              children: v.label
            },
            v.key
          )) })
        ] }, group)) })
      ] }),
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "border-t border-slate-100 dark:border-slate-800 px-4 py-3", children: [
        /* @__PURE__ */ jsxRuntime.jsx("label", { className: "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5", children: t("designer.sortBy") }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "select",
          {
            value: entitySortField,
            onChange: (e) => setEntitySortField(e.target.value),
            className: "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
            children: [
              /* @__PURE__ */ jsxRuntime.jsx("option", { value: "", children: t("designer.default") }),
              entityVars.filter((v) => !v.key.includes(".") || v.format).map((v) => /* @__PURE__ */ jsxRuntime.jsx("option", { value: v.key, children: v.label }, v.key))
            ]
          }
        )
      ] }),
      entityDefaults && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "border-t border-slate-100 dark:border-slate-800 px-4 py-3", children: /* @__PURE__ */ jsxRuntime.jsxs(
        "button",
        {
          onClick: () => {
            setEntityMainLine(entityDefaults.mainLine);
            setEntitySubLine(entityDefaults.subLine ?? "");
            setEntitySortField(entityDefaults.sortField ?? "");
          },
          className: "flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(lucideReact.RotateCcw, { className: "h-3 w-3" }),
            t("designer.resetDefaults")
          ]
        }
      ) })
    ] })
  ] });
}
function FilterPills({
  allSettings,
  smartColumns,
  updateSettings
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const clearAllFilters = () => updateSettings({});
  const colMap = react.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    smartColumns.forEach((c) => m.set(c.id, c));
    return m;
  }, [smartColumns]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-xs font-medium text-slate-500 dark:text-slate-400", children: t("activeFilters") }),
    Object.entries(allSettings).map(([colId, s]) => {
      const col = colMap.get(colId);
      if (!col) return null;
      const parts = [];
      if (s.sort) parts.push(`${t("sort.label")} ${s.sort === "asc" ? "\u2191" : "\u2193"}`);
      if (s.filterText) parts.push(`"${s.filterText}"`);
      if (s.filterValues && s.filterValues.length > 0)
        parts.push(t("filterCount", { count: s.filterValues.length }));
      if (s.filterDateFrom && s.filterDateTo) parts.push(t("filterRange", { from: s.filterDateFrom, to: s.filterDateTo }));
      else if (s.filterDateFrom) parts.push(t("filterFrom", { date: s.filterDateFrom }));
      else if (s.filterDateTo) parts.push(t("filterUntil", { date: s.filterDateTo }));
      if (s.filterTimeFrom && s.filterTimeTo) parts.push(t("filterRange", { from: s.filterTimeFrom, to: s.filterTimeTo }));
      else if (s.filterTimeFrom) parts.push(t("filterFrom", { date: s.filterTimeFrom }));
      else if (s.filterTimeTo) parts.push(t("filterUntil", { date: s.filterTimeTo }));
      if (parts.length === 0) return null;
      return /* @__PURE__ */ jsxRuntime.jsxs(
        "span",
        {
          className: "inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300",
          children: [
            col.header,
            ": ",
            parts.join(", "),
            /* @__PURE__ */ jsxRuntime.jsx(
              "button",
              {
                onClick: () => {
                  const next = { ...allSettings };
                  delete next[colId];
                  updateSettings(next);
                },
                className: "hover:text-primary-900 dark:hover:text-primary-100",
                children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-3 w-3" })
              }
            )
          ]
        },
        colId
      );
    }),
    /* @__PURE__ */ jsxRuntime.jsx(
      "button",
      {
        onClick: clearAllFilters,
        className: "text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300",
        children: t("clearAll")
      }
    )
  ] });
}
function ExportDropdown({ onCSV, onExcel }) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const [open, setOpen] = react.useState(false);
  const ref = react.useRef(null);
  react.useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { ref, className: "relative", children: [
    /* @__PURE__ */ jsxRuntime.jsxs(
      "button",
      {
        onClick: () => setOpen(!open),
        className: "flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800",
        children: [
          /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Download, { className: "h-4 w-4" }),
          " ",
          t("export.button")
        ]
      }
    ),
    open && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900", children: [
      /* @__PURE__ */ jsxRuntime.jsxs(
        "button",
        {
          onClick: () => {
            onCSV();
            setOpen(false);
          },
          className: "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
          children: [
            /* @__PURE__ */ jsxRuntime.jsx("span", { className: "inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", children: "CSV" }),
            t("export.csv")
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntime.jsxs(
        "button",
        {
          onClick: () => {
            onExcel();
            setOpen(false);
          },
          className: "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
          children: [
            /* @__PURE__ */ jsxRuntime.jsx("span", { className: "inline-flex h-5 w-5 items-center justify-center rounded bg-green-100 text-[9px] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400", children: "XLS" }),
            t("export.excel")
          ]
        }
      )
    ] })
  ] });
}
function useSelection(getRowId, total) {
  const [mode, setMode] = react.useState("include");
  const [selectedIds, setSelectedIds] = react.useState(() => /* @__PURE__ */ new Set());
  const [excludedIds, setExcludedIds] = react.useState(() => /* @__PURE__ */ new Set());
  const count = mode === "include" ? selectedIds.size : total - excludedIds.size;
  const isSelected = react.useCallback(
    (id) => mode === "include" ? selectedIds.has(id) : !excludedIds.has(id),
    [mode, selectedIds, excludedIds]
  );
  const clear = react.useCallback(() => {
    setMode("include");
    setSelectedIds(/* @__PURE__ */ new Set());
    setExcludedIds(/* @__PURE__ */ new Set());
  }, []);
  const toggle = react.useCallback(
    (id) => {
      if (mode === "include") {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setExcludedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    },
    [mode]
  );
  const selectPage = react.useCallback(
    (pageRows) => {
      if (mode === "include") {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          pageRows.forEach((r) => next.add(getRowId(r)));
          return next;
        });
      } else {
        setExcludedIds((prev) => {
          const next = new Set(prev);
          pageRows.forEach((r) => next.delete(getRowId(r)));
          return next;
        });
      }
    },
    [mode, getRowId]
  );
  const deselectPage = react.useCallback(
    (pageRows) => {
      if (mode === "include") {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          pageRows.forEach((r) => next.delete(getRowId(r)));
          return next;
        });
      } else {
        setExcludedIds((prev) => {
          const next = new Set(prev);
          pageRows.forEach((r) => next.add(getRowId(r)));
          return next;
        });
      }
    },
    [mode, getRowId]
  );
  const selectAll = react.useCallback(() => {
    setMode("all");
    setExcludedIds(/* @__PURE__ */ new Set());
    setSelectedIds(/* @__PURE__ */ new Set());
  }, []);
  const isPageFullySelected = react.useCallback(
    (pageRows) => {
      if (pageRows.length === 0) return false;
      return pageRows.every((r) => isSelected(getRowId(r)));
    },
    [isSelected, getRowId]
  );
  const isPagePartiallySelected = react.useCallback(
    (pageRows) => {
      if (pageRows.length === 0) return false;
      const selectedCount = pageRows.filter((r) => isSelected(getRowId(r))).length;
      return selectedCount > 0 && selectedCount < pageRows.length;
    },
    [isSelected, getRowId]
  );
  const state = react.useMemo(
    () => ({ mode, selectedIds, excludedIds, count, isSelected, clear }),
    [mode, selectedIds, excludedIds, count, isSelected, clear]
  );
  return {
    state,
    toggle,
    selectPage,
    deselectPage,
    selectAll,
    clear,
    isSelected,
    isPageFullySelected,
    isPagePartiallySelected
  };
}
var ENTITY_VARIABLES2 = {};
var DEFAULT_TEMPLATES2 = {};
function SmartDataTable({
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
  defaultView = "table",
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
  onGlobalSearch
}) {
  const { t } = reactI18next.useTranslation("common", { keyPrefix: "smartTable" });
  const resolvedGetRowId = react.useMemo(
    () => getRowId ?? ((row) => String(row.id ?? "")),
    [getRowId]
  );
  const allSmartColumns = react.useMemo(() => {
    const idCol = {
      id: "_id",
      header: "ID",
      // Technical column header — keep untranslated; consumers can override via column override
      accessorFn: (row) => resolvedGetRowId(row),
      cell: ({ value }) => /* @__PURE__ */ jsxRuntime.jsx("span", { className: "inline-block rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 select-all", children: String(value).slice(0, 8) }),
      sortable: false,
      filterable: false,
      size: 95,
      fixed: true
    };
    return [idCol, ...userColumns];
  }, [userColumns, resolvedGetRowId]);
  const {
    viewMode,
    changeView,
    allSettings,
    updateSettings,
    internalPageSize,
    changePageSize,
    hiddenColumns,
    toggleColumn,
    visibleColumns,
    activePopup,
    setActivePopup,
    popupAnchor,
    globalSearch,
    setGlobalSearch,
    debouncedSearch,
    activeFilterCount,
    filterByGlobalSearch,
    hasIndicator,
    handleHeaderClick,
    openHeaderPopup,
    restoreState
  } = useTableState(tableId, allSmartColumns, defaultView, viewModes, initialPageSize, prefs, initialHiddenColumns);
  const cellStyleMap = react.useMemo(() => {
    const map = {};
    for (const [colId, s] of Object.entries(allSettings)) {
      if (s?.style) map[colId] = getCellStyle(s.style);
    }
    return map;
  }, [allSettings]);
  const sorting = react.useMemo(() => {
    const sorts = [];
    for (const [colId, s] of Object.entries(allSettings)) {
      if (s.sort) sorts.push({ id: colId, desc: s.sort === "desc" });
    }
    return sorts;
  }, [allSettings]);
  const suppressSortRef = react.useRef(true);
  react.useEffect(() => {
    suppressSortRef.current = true;
  }, [initialTableState]);
  react.useEffect(() => {
    if (!onSortChange) return;
    if (suppressSortRef.current) {
      suppressSortRef.current = false;
      return;
    }
    const active = sorting.length > 0 ? sorting[0] : null;
    onSortChange(active?.id ?? null, active ? active.desc ? "desc" : "asc" : null);
  }, [sorting]);
  const prevSettingsRef = react.useRef(allSettings);
  react.useEffect(() => {
    if (!manualPagination || !onPageChange) return;
    if (prevSettingsRef.current !== allSettings) {
      prevSettingsRef.current = allSettings;
      onPageChange(1);
    }
  }, [allSettings, manualPagination, onPageChange]);
  const [searchPending, setSearchPending] = react.useState(false);
  const [serverSearch, setServerSearch] = react.useState(globalSearch);
  react.useEffect(() => {
    const timer = setTimeout(() => setServerSearch(globalSearch), 200);
    return () => clearTimeout(timer);
  }, [globalSearch]);
  const suppressSearchRef = react.useRef(true);
  const lastServerSearchRef = react.useRef(null);
  react.useEffect(() => {
    suppressSearchRef.current = true;
    lastServerSearchRef.current = null;
  }, [initialTableState]);
  react.useEffect(() => {
    if (!onGlobalSearch) return;
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      lastServerSearchRef.current = serverSearch;
      return;
    }
    if (lastServerSearchRef.current === serverSearch) return;
    lastServerSearchRef.current = serverSearch;
    setSearchPending(true);
    onGlobalSearch(serverSearch);
  }, [serverSearch, onGlobalSearch]);
  react.useEffect(() => {
    if (!loading && searchPending) setSearchPending(false);
  }, [loading, searchPending]);
  react.useEffect(() => {
    if (!searchPending) return;
    const t2 = setTimeout(() => setSearchPending(false), 1500);
    return () => clearTimeout(t2);
  }, [searchPending]);
  const [entityConfigs, setEntityConfigs] = react.useState(() => {
    const configs = {};
    allSmartColumns.forEach((sc) => {
      if (!sc.entityType) return;
      const saved = prefs.get(`entity-template-${sc.entityType}`, null);
      configs[sc.entityType] = saved ?? {
        mainLine: DEFAULT_TEMPLATES2[sc.entityType]?.mainLine ?? "",
        subLine: DEFAULT_TEMPLATES2[sc.entityType]?.subLine,
        sortField: DEFAULT_TEMPLATES2[sc.entityType]?.sortField
      };
    });
    return configs;
  });
  const entityFormatMaps = react.useMemo(() => {
    const maps = {};
    allSmartColumns.forEach((sc) => {
      if (!sc.entityType || maps[sc.entityType]) return;
      const vars = ENTITY_VARIABLES2[sc.entityType] ?? [];
      const map = {};
      vars.forEach((v) => {
        if (v.format) map[v.key] = v.format;
      });
      maps[sc.entityType] = map;
    });
    return maps;
  }, [allSmartColumns]);
  const tanstackColumns = react.useMemo(
    () => allSmartColumns.map((sc) => {
      const def = {
        id: sc.id,
        header: sc.header,
        enableSorting: sc.sortable ?? true,
        enableColumnFilter: sc.filterable ?? true,
        filterFn: smartFilterFn,
        sortingFn: "nullsLast",
        size: sc.size
      };
      const ecfg = sc.entityType ? entityConfigs[sc.entityType] : null;
      if (sc.entityType && sc.entityAccessor && ecfg) {
        const accessor = sc.entityAccessor;
        const fmtMap = entityFormatMaps[sc.entityType] ?? {};
        const sortFieldPath = ecfg.sortField;
        def.accessorFn = (row) => {
          const entity = accessor(row);
          if (!entity) return "";
          if (sortFieldPath) {
            const parts = sortFieldPath.split(".");
            let val = entity;
            for (const p of parts) {
              if (val == null || typeof val !== "object") return "";
              val = val[p];
            }
            return val ?? "";
          }
          return resolveTemplate(ecfg.mainLine, entity, fmtMap);
        };
        def.cell = (info) => {
          const entity = accessor(info.row.original);
          if (!entity) return /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-slate-400", children: "\u2014" });
          const mainText = resolveTemplate(ecfg.mainLine, entity, fmtMap);
          const subText = ecfg.subLine ? resolveTemplate(ecfg.subLine, entity, fmtMap) : "";
          const showPhoto = templateHasImageVar(ecfg.mainLine, fmtMap) || templateHasImageVar(ecfg.subLine ?? "", fmtMap);
          const imageUrl = showPhoto ? extractImageUrl(ecfg.mainLine, entity, fmtMap) ?? extractImageUrl(ecfg.subLine ?? "", entity, fmtMap) : null;
          const PlaceholderIcon = sc.entityType === "bien" ? lucideReact.Home : sc.entityType === "contact" || sc.entityType === "acquereur" ? lucideReact.User : lucideReact.ImageIcon;
          return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2.5", children: [
            showPhoto && (imageUrl ? /* @__PURE__ */ jsxRuntime.jsx(
              "img",
              {
                src: imageUrl,
                alt: "",
                className: "h-10 w-10 rounded-md object-cover shrink-0 bg-slate-100 dark:bg-slate-800",
                onError: (e) => {
                  e.target.style.display = "none";
                }
              }
            ) : /* @__PURE__ */ jsxRuntime.jsx("div", { className: "h-10 w-10 rounded-md shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntime.jsx(PlaceholderIcon, { className: "h-5 w-5 text-slate-300 dark:text-slate-600" }) })),
            /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntime.jsx("div", { className: "font-medium truncate", children: mainText || "\u2014" }),
              subText && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "text-xs text-slate-500 dark:text-slate-400 truncate", children: subText })
            ] })
          ] });
        };
      } else {
        if (sc.accessorKey) {
          def.accessorKey = sc.accessorKey;
        } else if (sc.accessorFn) {
          def.accessorFn = sc.accessorFn;
        }
        if (sc.cell) {
          const cellRenderer = sc.cell;
          def.cell = (info) => cellRenderer({ row: info.row.original, value: info.getValue() });
        }
      }
      return def;
    }),
    [allSmartColumns, entityConfigs, entityFormatMaps]
  );
  const [scrollMode, setScrollMode2] = react.useState(getScrollMode);
  const globalFiltered = react.useMemo(() => onGlobalSearch ? data : filterByGlobalSearch(data), [data, filterByGlobalSearch, onGlobalSearch]);
  const filteredData = react.useMemo(() => {
    if (!manualPagination) return globalFiltered;
    const activeFilters = Object.entries(allSettings).filter(
      ([, s]) => s.filterValues?.length || s.filterText || s.filterTextOp === "empty" || s.filterTextOp === "notEmpty" || s.filterNumberFrom != null || s.filterNumberTo != null || s.filterNumberOp === "empty" || s.filterNumberOp === "notEmpty" || s.filterDateFrom || s.filterDateTo
    );
    if (activeFilters.length === 0) return globalFiltered;
    let result = globalFiltered.filter((row) => {
      for (const [colId, settings] of activeFilters) {
        const col = allSmartColumns.find((c) => c.id === colId);
        if (!col) continue;
        const accessor = col.accessorKey ? (r) => r[col.accessorKey] : col.accessorFn;
        if (!accessor) continue;
        const raw = accessor(row);
        const rawStr = raw == null ? "" : String(raw);
        if (settings.filterValues && settings.filterValues.length > 0) {
          const realValues = settings.filterValues.filter((v) => v !== "__NONE__");
          if (realValues.length > 0) {
            if (!realValues.includes(rawStr)) return false;
          }
        }
        const textOp = settings.filterTextOp ?? "contains";
        if (textOp === "empty" && rawStr !== "") return false;
        else if (textOp === "notEmpty" && rawStr === "") return false;
        else if (settings.filterText) {
          const q = settings.filterText.toLowerCase();
          const v = rawStr.toLowerCase();
          if (textOp === "contains" && !v.includes(q)) return false;
          else if (textOp === "equals" && v !== q) return false;
          else if (textOp === "starts" && !v.startsWith(q)) return false;
          else if (textOp === "ends" && !v.endsWith(q)) return false;
        }
        const numOp = settings.filterNumberOp ?? "between";
        if (numOp === "empty" && rawStr !== "") return false;
        else if (numOp === "notEmpty" && rawStr === "") return false;
        else if (settings.filterNumberFrom != null || settings.filterNumberTo != null) {
          const n = typeof raw === "number" ? raw : Number(rawStr);
          if (isNaN(n)) return false;
          const from = settings.filterNumberFrom;
          const to = settings.filterNumberTo;
          if (numOp === "eq" && from != null && n !== from) return false;
          else if (numOp === "neq" && from != null && n === from) return false;
          else if (numOp === "gt" && from != null && n <= from) return false;
          else if (numOp === "gte" && from != null && n < from) return false;
          else if (numOp === "lt" && from != null && n >= from) return false;
          else if (numOp === "lte" && from != null && n > from) return false;
          else if (numOp === "between") {
            if (from != null && n < from) return false;
            if (to != null && n > to) return false;
          }
        }
        if (settings.filterDateFrom || settings.filterDateTo) {
          if (settings.filterDateFrom && rawStr < settings.filterDateFrom) return false;
          if (settings.filterDateTo && rawStr > settings.filterDateTo) return false;
        }
      }
      return true;
    });
    if (!onSortChange) {
      const sortEntry = Object.entries(allSettings).find(([, s]) => s.sort);
      if (sortEntry) {
        const [sortColId, sortSettings] = sortEntry;
        const sortCol = allSmartColumns.find((c) => c.id === sortColId);
        if (sortCol) {
          const sortAccessor = sortCol.accessorKey ? (r) => r[sortCol.accessorKey] : sortCol.accessorFn;
          if (sortAccessor) {
            const dir = sortSettings.sort === "desc" ? -1 : 1;
            result = [...result].sort((a, b) => {
              const va = sortAccessor(a);
              const vb = sortAccessor(b);
              const aEmpty = va == null || va === "" || va === "\u2014";
              const bEmpty = vb == null || vb === "" || vb === "\u2014";
              if (aEmpty && bEmpty) return 0;
              if (aEmpty) return 1;
              if (bEmpty) return -1;
              if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
              return String(va).localeCompare(String(vb), "fr") * dir;
            });
          }
        }
      }
    }
    return result;
  }, [globalFiltered, allSettings, allSmartColumns, manualPagination]);
  const visibleTanstackCols = react.useMemo(
    () => tanstackColumns.filter((c) => !hiddenColumns.has(c.id)),
    [tanstackColumns, hiddenColumns]
  );
  const [columnOrder, setColumnOrder] = react.useState(
    () => prefs.get(`${tableId}-col-order`, visibleTanstackCols.map((c) => c.id))
  );
  react.useEffect(() => {
    const ids = visibleTanstackCols.map((c) => c.id);
    setColumnOrder((prev) => {
      const existing = prev.filter((id) => ids.includes(id) && id !== "_id");
      const added = ids.filter((id) => !prev.includes(id) && id !== "_id");
      const rest = [...existing, ...added];
      return ids.includes("_id") ? ["_id", ...rest] : rest;
    });
  }, [visibleTanstackCols]);
  const fixedColIds = react.useMemo(() => new Set(allSmartColumns.filter((c) => c.fixed).map((c) => c.id)), [allSmartColumns]);
  const [columnSizing, setColumnSizing] = react.useState(() => {
    const saved = prefs.get(`${tableId}-col-sizing`, {});
    const cleaned = {};
    for (const [k, v] of Object.entries(saved)) {
      if (!fixedColIds.has(k)) cleaned[k] = v;
    }
    return cleaned;
  });
  const changeScrollMode = (mode) => {
    setScrollMode2(mode);
    onScrollModeChangeProp?.(mode);
  };
  react.useEffect(() => {
    const snapshot = {
      hiddenColumns: Array.from(hiddenColumns),
      columnOrder,
      allSettings,
      columnSizing,
      pageSize: internalPageSize,
      viewMode,
      filteredRowCount: filteredData.length
    };
    if (tableStateRef) tableStateRef.current = snapshot;
    onTableStateChange?.(snapshot);
  }, [hiddenColumns, columnOrder, allSettings, columnSizing, internalPageSize, viewMode, filteredData.length]);
  const restoreCountRef = react.useRef(0);
  const prevInitialRef = react.useRef(null);
  react.useEffect(() => {
    if (!initialTableState || initialTableState === prevInitialRef.current) return;
    prevInitialRef.current = initialTableState;
    restoreCountRef.current++;
    restoreState(initialTableState);
    if (initialTableState.columnOrder?.length) {
      setColumnOrder(initialTableState.columnOrder);
      prefs.set(`${tableId}-col-order`, initialTableState.columnOrder);
    }
    if (initialTableState.columnSizing && Object.keys(initialTableState.columnSizing).length) {
      setColumnSizing(initialTableState.columnSizing);
      prefs.set(`${tableId}-col-sizing`, initialTableState.columnSizing);
    }
    changeView("table");
  }, [initialTableState]);
  const table = reactTable.useReactTable({
    data: filteredData,
    columns: visibleTanstackCols,
    state: {
      sorting,
      columnOrder,
      columnSizing,
      ...manualPagination ? { pagination: { pageIndex: page - 1, pageSize: internalPageSize } } : {}
    },
    // For client-side pagination, let TanStack manage page state internally
    ...!manualPagination ? { initialState: { pagination: { pageIndex: 0, pageSize: internalPageSize } } } : {},
    onColumnSizingChange: (updater) => {
      const raw = typeof updater === "function" ? updater(columnSizing) : updater;
      const next = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!fixedColIds.has(k)) next[k] = v;
      }
      setColumnSizing(next);
      prefs.set(`${tableId}-col-sizing`, next);
    },
    onColumnOrderChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnOrder) : updater;
      setColumnOrder(next);
      prefs.set(`${tableId}-col-order`, next);
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const newSettings = {};
      for (const [k, v] of Object.entries(allSettings)) {
        newSettings[k] = v?.sort ? { ...v, sort: null } : v;
      }
      const active = next.length > 0 ? next[next.length - 1] : null;
      if (active) {
        newSettings[active.id] = { ...newSettings[active.id], sort: active.desc ? "desc" : "asc" };
      }
      updateSettings(newSettings);
      if (onSortChange) {
        onSortChange(active?.id ?? null, active ? active.desc ? "desc" : "asc" : null);
      }
    },
    getCoreRowModel: reactTable.getCoreRowModel(),
    getSortedRowModel: reactTable.getSortedRowModel(),
    getFilteredRowModel: reactTable.getFilteredRowModel(),
    getPaginationRowModel: enablePagination && !manualPagination ? reactTable.getPaginationRowModel() : void 0,
    manualPagination,
    manualSorting: !!manualPagination,
    manualFiltering: !!manualPagination,
    enableMultiSort: true,
    isMultiSortEvent: () => true,
    // tous les onSortingChange acceptent le multi — c'est nous qui contrôlons via Shift+click dans handleHeaderClick.
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    sortingFns: {
      /** Nulls/empty always last regardless of sort direction */
      nullsLast: (rowA, rowB, columnId) => {
        const a = rowA.getValue(columnId);
        const b = rowB.getValue(columnId);
        const aEmpty = a == null || a === "" || a === "\u2014";
        const bEmpty = b == null || b === "" || b === "\u2014";
        if (aEmpty && bEmpty) return 0;
        if (!aEmpty && !bEmpty) {
          if (typeof a === "number" && typeof b === "number") return a - b;
          return String(a).localeCompare(String(b), "fr");
        }
        const isDesc = rowA.getAllCells().find((c) => c.column.id === columnId)?.column.getIsSorted() === "desc";
        if (aEmpty) return isDesc ? -1 : 1;
        return isDesc ? 1 : -1;
      }
    }
  });
  react.useEffect(() => {
    if (scrollMode === "infinite" && !manualPagination) {
      table.setPageSize(filteredData.length || 1e3);
    }
  }, [scrollMode, filteredData.length]);
  react.useEffect(() => {
    if (manualPagination) {
      table.getAllColumns().forEach((col) => {
        if (col.getFilterValue() !== void 0) col.setFilterValue(void 0);
      });
      return;
    }
    Object.entries(allSettings).forEach(([colId, settings]) => {
      const col = table.getColumn(colId);
      if (!col) return;
      const hasOpOnly = settings.filterTextOp === "empty" || settings.filterTextOp === "notEmpty" || (settings.filterNumberOp === "empty" || settings.filterNumberOp === "notEmpty");
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
          filterTimeTo: settings.filterTimeTo
        });
      } else {
        col.setFilterValue(void 0);
      }
    });
    table.getAllColumns().forEach((col) => {
      if (!allSettings[col.id] && col.getFilterValue() !== void 0) {
        col.setFilterValue(void 0);
      }
    });
  }, [allSettings, table, manualPagination]);
  const hasLocalFilters = manualPagination && filteredData.length !== globalFiltered.length;
  const totalRows = manualPagination ? hasLocalFilters ? filteredData.length : total ?? 0 : table.getFilteredRowModel().rows.length;
  react.useEffect(() => {
    if (!tableStateRef?.current) return;
    if (tableStateRef.current.filteredRowCount !== totalRows) {
      tableStateRef.current = { ...tableStateRef.current, filteredRowCount: totalRows };
      onTableStateChange?.(tableStateRef.current);
    }
  }, [totalRows]);
  const selection = useSelection(resolvedGetRowId, totalRows);
  const pageRows = react.useMemo(() => table.getRowModel().rows.map((r) => r.original), [table.getRowModel().rows]);
  const resolvedEmptyTitle = emptyTitle ?? t("noResults");
  const resolvedAddLabel = addLabel ?? t("addLabel");
  const popupSmartColumn = activePopup ? allSmartColumns.find((c) => c.id === activePopup) : null;
  const [filterPopupRect, setFilterPopupRect] = react.useState(null);
  const selectionActive = enableSelection && selection.state.count > 0;
  const allSelectedAcrossPages = selection.state.mode === "all" && selection.state.excludedIds.size === 0;
  const aggregations = react.useMemo(
    () => computeAggregations(filteredData, allSmartColumns, allSettings),
    [filteredData, allSmartColumns, allSettings]
  );
  const selectedData = react.useMemo(() => {
    if (!enableSelection || selection.state.count === 0) return [];
    return filteredData.filter((row) => selection.isSelected(resolvedGetRowId(row)));
  }, [enableSelection, selection.state, filteredData, resolvedGetRowId, selection.isSelected]);
  return /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntime.jsx("div", { className: "flex items-center gap-2", children: enableSelection && selectionActive ? /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center gap-2 flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntime.jsx(lucideReact.CheckSquare, { className: "h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" }),
        /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-sm font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap", children: t("selection.selected", { count: selection.state.count }) }),
        !allSelectedAcrossPages && selection.state.count === pageRows.length && totalRows > pageRows.length && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
          /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-slate-300 dark:text-slate-600", children: "|" }),
          /* @__PURE__ */ jsxRuntime.jsx(
            "button",
            {
              onClick: selection.selectAll,
              className: "text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 underline whitespace-nowrap",
              children: t("selection.selectAllCount", { count: totalRows })
            }
          )
        ] }),
        allSelectedAcrossPages && totalRows > pageRows.length && /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-xs text-primary-500 dark:text-primary-400 whitespace-nowrap", children: t("selection.allPages") }),
        /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-slate-300 dark:text-slate-600", children: "|" }),
        /* @__PURE__ */ jsxRuntime.jsxs(
          "button",
          {
            onClick: selection.clear,
            className: "flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 whitespace-nowrap",
            children: [
              /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-3.5 w-3.5" }),
              t("selection.deselect")
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntime.jsx(
        ExportDropdown,
        {
          onCSV: () => exportCSV(selectedData, allSmartColumns, hiddenColumns, `${tableId}-selection`, { columnOrder, columnSizing }),
          onExcel: () => exportExcel(selectedData, allSmartColumns, hiddenColumns, `${tableId}-selection`, { columnOrder, columnSizing })
        }
      ),
      selectionActions?.(selection.state)
    ] }) : /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "relative flex-1 group/search", children: [
        searchPending ? /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Loader2, { className: "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-500 animate-spin" }) : /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Search, { className: "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "input",
          {
            type: "text",
            value: globalSearch,
            onChange: (e) => setGlobalSearch(e.target.value),
            placeholder: searchPlaceholder ?? t("search"),
            className: "w-full rounded-lg border bg-white py-2 pl-9 pr-8 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600"
          }
        ),
        globalSearch && /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setGlobalSearch("");
              if (onGlobalSearch) {
                setSearchPending(true);
                onGlobalSearch("");
              }
            },
            className: "absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300 transition-colors",
            title: t("clearSearch"),
            children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-3.5 w-3.5" })
          }
        ),
        activeFilterCount > 0 && /* @__PURE__ */ jsxRuntime.jsx("div", { className: "absolute right-2 top-1/2 -translate-y-1/2", children: /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            ref: (el) => {
              if (el) el.__rect = el.getBoundingClientRect();
            },
            onClick: (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setFilterPopupRect(rect);
              setActivePopup(activePopup === "__filters" ? null : "__filters");
            },
            className: "flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-[10px] font-bold text-white hover:bg-primary-700 transition-colors",
            title: t("activeFiltersTitle"),
            children: activeFilterCount
          }
        ) })
      ] }),
      actions,
      /* @__PURE__ */ jsxRuntime.jsx(
        ExportDropdown,
        {
          onCSV: () => exportCSV(filteredData, allSmartColumns, hiddenColumns, tableId, { columnOrder, columnSizing }),
          onExcel: () => exportExcel(filteredData, allSmartColumns, hiddenColumns, tableId, { columnOrder, columnSizing })
        }
      ),
      onAdd && /* @__PURE__ */ jsxRuntime.jsxs(
        "button",
        {
          onClick: onAdd,
          className: "flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700",
          children: [
            /* @__PURE__ */ jsxRuntime.jsx(lucideReact.Plus, { className: "h-4 w-4" }),
            " ",
            resolvedAddLabel
          ]
        }
      )
    ] }) }),
    Object.values(allSettings).some((s) => s.sort || s.filterText || s.filterValues?.length || s.filterDateFrom || s.filterDateTo || s.filterNumberFrom != null || s.filterNumberTo != null) && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntime.jsx("span", { className: "text-xs font-medium text-slate-500 dark:text-slate-400", children: t("activeFilters") }),
      Object.entries(allSettings).map(([colId, s]) => {
        const col = allSmartColumns.find((c) => c.id === colId);
        if (!col) return null;
        const parts = [];
        if (s.sort) parts.push(`${t("sort.label")} ${s.sort === "asc" ? "\u2191" : "\u2193"}`);
        if (s.filterText) parts.push(`"${s.filterText}"`);
        if (s.filterValues && s.filterValues.length > 0) parts.push(t("filterCount", { count: s.filterValues.length }));
        if (s.filterDateFrom && s.filterDateTo) parts.push(t("filterRange", { from: s.filterDateFrom, to: s.filterDateTo }));
        else if (s.filterDateFrom) parts.push(t("filterFrom", { date: s.filterDateFrom }));
        else if (s.filterDateTo) parts.push(t("filterUntil", { date: s.filterDateTo }));
        if (s.filterNumberFrom != null && s.filterNumberTo != null) parts.push(t("filterRange", { from: s.filterNumberFrom, to: s.filterNumberTo }));
        else if (s.filterNumberFrom != null) parts.push(t("filterGreaterEqual", { value: s.filterNumberFrom }));
        else if (s.filterNumberTo != null) parts.push(t("filterLessEqual", { value: s.filterNumberTo }));
        if (parts.length === 0) return null;
        return /* @__PURE__ */ jsxRuntime.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300", children: [
          col.header,
          ": ",
          parts.join(", "),
          /* @__PURE__ */ jsxRuntime.jsx("button", { onClick: () => {
            const next = { ...allSettings };
            delete next[colId];
            updateSettings(next);
          }, className: "hover:text-primary-900 dark:hover:text-primary-100", children: /* @__PURE__ */ jsxRuntime.jsx(lucideReact.X, { className: "h-3 w-3" }) })
        ] }, colId);
      }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "button",
        {
          onClick: () => {
            updateSettings({});
          },
          className: "text-xs text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300",
          children: t("clearAll")
        }
      )
    ] }),
    viewMode === "table" && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsx(
        TableView,
        {
          table,
          tableId,
          prefs,
          allSettings,
          cellStyleMap,
          smartColumns: allSmartColumns,
          hiddenColumns,
          toggleColumn,
          loading,
          onRowClick,
          hasIndicator,
          handleHeaderClick,
          openHeaderPopup,
          activePopupId: activePopup,
          closeHeaderPopup: () => setActivePopup(null),
          emptyTitle: resolvedEmptyTitle,
          emptyAction,
          enableSelection,
          getRowId: resolvedGetRowId,
          isSelected: selection.isSelected,
          isPageFullySelected: selection.isPageFullySelected(pageRows),
          isPagePartiallySelected: selection.isPagePartiallySelected(pageRows),
          onToggleRow: selection.toggle,
          onTogglePage: () => {
            if (selection.isPageFullySelected(pageRows)) {
              selection.deselectPage(pageRows);
            } else {
              selection.selectPage(pageRows);
            }
          },
          aggregations,
          aggregatedRowCount: filteredData.length,
          aggregatedTotalRows: totalRows
        }
      ),
      enablePagination && totalRows > 0 && scrollMode === "pagination" && /* @__PURE__ */ jsxRuntime.jsx(
        SmartPagination,
        {
          page: manualPagination ? page : table.getState().pagination.pageIndex + 1,
          pageSize: internalPageSize,
          total: totalRows,
          onPageChange: (p) => {
            if (manualPagination) {
              onPageChange?.(p);
            } else {
              table.setPageIndex(p - 1);
            }
          },
          onPageSizeChange: (s) => {
            changePageSize(s);
            table.setPageSize(s);
            if (manualPagination) {
              onPageSizeChangeProp?.(s);
              onPageChange?.(1);
            }
          },
          showScrollToggle: true,
          onScrollModeChange: (mode) => {
            changeScrollMode(mode);
            if (mode === "infinite" && !manualPagination) {
              table.setPageSize(filteredData.length || 1e3);
            }
          }
        }
      ),
      scrollMode === "infinite" && totalRows > 0 && /* @__PURE__ */ jsxRuntime.jsxs("div", { className: "flex items-center justify-between text-xs text-slate-400 dark:text-slate-400 pt-2", children: [
        /* @__PURE__ */ jsxRuntime.jsxs("span", { children: [
          totalRows,
          " ",
          t("items")
        ] }),
        /* @__PURE__ */ jsxRuntime.jsx(
          "button",
          {
            onClick: () => {
              changeScrollMode("pagination");
              localStorage.setItem("smartdt-scroll-mode", "pagination");
              table.setPageSize(internalPageSize);
            },
            className: "flex items-center gap-1 px-2 py-1 text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-lg transition-colors",
            children: t("switchBackToPagination")
          }
        )
      ] })
    ] }),
    activePopup && popupSmartColumn && /* @__PURE__ */ jsxRuntime.jsx(
      ColumnPopup,
      {
        column: popupSmartColumn,
        data,
        currentSettings: allSettings[activePopup] ?? {},
        anchorRect: popupAnchor,
        entityConfig: popupSmartColumn.entityType ? entityConfigs[popupSmartColumn.entityType] : void 0,
        sampleEntity: popupSmartColumn.entityType && popupSmartColumn.entityAccessor && filteredData[0] ? popupSmartColumn.entityAccessor(filteredData[0]) : void 0,
        onEntityConfigSave: (entityType, cfg) => {
          prefs.set(`entity-template-${entityType}`, cfg);
          setEntityConfigs((prev) => ({ ...prev, [entityType]: cfg }));
        },
        onApply: (settings) => {
          const next = { ...allSettings };
          if (settings.sort) {
            for (const k of Object.keys(next)) {
              if (k !== activePopup && next[k]?.sort) next[k] = { ...next[k], sort: null };
            }
          }
          next[activePopup] = settings;
          if (!settings.sort && !settings.filterText && !settings.filterValues && !settings.filterDateFrom && !settings.filterDateTo && !settings.filterTimeFrom && !settings.filterTimeTo && settings.filterNumberFrom == null && settings.filterNumberTo == null && !settings.style && !settings.aggFn) {
            delete next[activePopup];
          }
          updateSettings(next);
        },
        onClear: () => {
          const next = { ...allSettings };
          delete next[activePopup];
          updateSettings(next);
        },
        onHide: () => {
          toggleColumn(activePopup);
        },
        hiddenColumnsList: allSmartColumns.filter((c) => hiddenColumns.has(c.id)).map((c) => ({ id: c.id, header: c.header })),
        onAddHiddenColumn: (addId) => {
          toggleColumn(addId);
          setColumnOrder((prev) => {
            const next = prev.filter((id) => id !== addId);
            const anchorIdx = next.indexOf(activePopup);
            if (anchorIdx === -1) {
              next.push(addId);
              return next;
            }
            next.splice(anchorIdx + 1, 0, addId);
            return next;
          });
        },
        onClose: () => setActivePopup(null)
      }
    ),
    activePopup === "__filters" && filterPopupRect && /* @__PURE__ */ jsxRuntime.jsxs(jsxRuntime.Fragment, { children: [
      /* @__PURE__ */ jsxRuntime.jsx("div", { className: "fixed inset-0 z-[9998]", onClick: () => setActivePopup(null) }),
      /* @__PURE__ */ jsxRuntime.jsx(
        "div",
        {
          className: "fixed z-[9999] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 min-w-[280px] max-w-[400px]",
          style: { top: filterPopupRect.bottom + 8, right: Math.max(8, window.innerWidth - filterPopupRect.right) },
          children: /* @__PURE__ */ jsxRuntime.jsx(
            FilterPills,
            {
              allSettings,
              smartColumns: allSmartColumns,
              updateSettings: (next) => {
                updateSettings(next);
                if (Object.keys(next).length === 0) setActivePopup(null);
              }
            }
          )
        }
      )
    ] })
  ] });
}

exports.AGG_LABELS = AGG_LABELS;
exports.SWATCH_COLORS = SWATCH_COLORS;
exports.SmartDataTable = SmartDataTable;
exports.allowedAggFns = allowedAggFns;
exports.computeAggregations = computeAggregations;
exports.createLocalStoragePrefs = createLocalStoragePrefs;
exports.default = SmartDataTable;
exports.exportCSV = exportCSV;
exports.exportExcel = exportExcel;
exports.extractImageUrl = extractImageUrl;
exports.formatFieldValue = formatFieldValue;
exports.formatValue = formatValue;
exports.getAggLabel = getAggLabel;
exports.getCellStyle = getCellStyle;
exports.getTypoStyle = getTypoStyle;
exports.resolveTemplate = resolveTemplate;
exports.smartFilterFn = smartFilterFn;
exports.templateHasImageVar = templateHasImageVar;
exports.useSelection = useSelection;
exports.useTableState = useTableState;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map