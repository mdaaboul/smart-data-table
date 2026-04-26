import { useState, useCallback, useMemo } from 'react'
import type { SelectionState } from './types'

/**
 * Manages row selection with cross-pagination support.
 *
 * Two modes:
 *  - 'include': only IDs in `selectedIds` are selected (default)
 *  - 'all':     everything is selected *except* IDs in `excludedIds`
 */
export function useSelection<T>(
  getRowId: (row: T) => string,
  total: number,
) {
  const [mode, setMode] = useState<'include' | 'all'>('include')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set())

  const count = mode === 'include' ? selectedIds.size : total - excludedIds.size

  const isSelected = useCallback(
    (id: string) => (mode === 'include' ? selectedIds.has(id) : !excludedIds.has(id)),
    [mode, selectedIds, excludedIds],
  )

  const clear = useCallback(() => {
    setMode('include')
    setSelectedIds(new Set())
    setExcludedIds(new Set())
  }, [])

  /** Toggle a single row */
  const toggle = useCallback(
    (id: string) => {
      if (mode === 'include') {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      } else {
        setExcludedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }
    },
    [mode],
  )

  /** Select all rows on the current page */
  const selectPage = useCallback(
    (pageRows: T[]) => {
      if (mode === 'include') {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          pageRows.forEach((r) => next.add(getRowId(r)))
          return next
        })
      } else {
        // In 'all' mode, remove these from exclusions
        setExcludedIds((prev) => {
          const next = new Set(prev)
          pageRows.forEach((r) => next.delete(getRowId(r)))
          return next
        })
      }
    },
    [mode, getRowId],
  )

  /** Deselect all rows on the current page */
  const deselectPage = useCallback(
    (pageRows: T[]) => {
      if (mode === 'include') {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          pageRows.forEach((r) => next.delete(getRowId(r)))
          return next
        })
      } else {
        setExcludedIds((prev) => {
          const next = new Set(prev)
          pageRows.forEach((r) => next.add(getRowId(r)))
          return next
        })
      }
    },
    [mode, getRowId],
  )

  /** Select all items across all pages */
  const selectAll = useCallback(() => {
    setMode('all')
    setExcludedIds(new Set())
    setSelectedIds(new Set())
  }, [])

  /** Check if every row on the current page is selected */
  const isPageFullySelected = useCallback(
    (pageRows: T[]) => {
      if (pageRows.length === 0) return false
      return pageRows.every((r) => isSelected(getRowId(r)))
    },
    [isSelected, getRowId],
  )

  /** Check if some (but not all) rows on the current page are selected */
  const isPagePartiallySelected = useCallback(
    (pageRows: T[]) => {
      if (pageRows.length === 0) return false
      const selectedCount = pageRows.filter((r) => isSelected(getRowId(r))).length
      return selectedCount > 0 && selectedCount < pageRows.length
    },
    [isSelected, getRowId],
  )

  const state: SelectionState = useMemo(
    () => ({ mode, selectedIds, excludedIds, count, isSelected, clear }),
    [mode, selectedIds, excludedIds, count, isSelected, clear],
  )

  return {
    state,
    toggle,
    selectPage,
    deselectPage,
    selectAll,
    clear,
    isSelected,
    isPageFullySelected,
    isPagePartiallySelected,
  }
}
