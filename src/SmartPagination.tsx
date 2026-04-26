import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownToLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const SCROLL_MODE_KEY = 'smartdt-scroll-mode'

export function getScrollMode(): 'pagination' | 'infinite' {
  try { return (localStorage.getItem(SCROLL_MODE_KEY) as 'infinite') || 'pagination' } catch { return 'pagination' }
}

function setScrollMode(mode: 'pagination' | 'infinite') {
  try { localStorage.setItem(SCROLL_MODE_KEY, mode) } catch {}
}

interface SmartPaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** When true, show the infinite scroll toggle */
  showScrollToggle?: boolean
  /** Callback when scroll mode changes */
  onScrollModeChange?: (mode: 'pagination' | 'infinite') => void
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export function SmartPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  showScrollToggle,
  onScrollModeChange,
}: SmartPaginationProps) {
  const { t } = useTranslation('common', { keyPrefix: 'smartTable' })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = []
    const delta = 2
    const start = Math.max(2, page - delta)
    const end = Math.min(totalPages - 1, page + delta)

    pages.push(1)
    if (start > 2) pages.push('ellipsis')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages - 1) pages.push('ellipsis')
    if (totalPages > 1) pages.push(totalPages)

    return pages
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      {/* Range + page size */}
      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
        <span>
          {t('pagination.rangeOf', { from, to, total })}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white pl-3 pr-7 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t('pagination.perPage', { count: s })}
            </option>
          ))}
        </select>
        {showScrollToggle && (
          <button
            onClick={() => { setScrollMode('infinite'); onScrollModeChange?.('infinite') }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title={t('pagination.infiniteScrollHint')}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('pagination.infiniteScroll')}</span>
          </button>
        )}
      </div>

      {/* Page buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            label={t('pagination.firstPage')}
          >
            <ChevronsLeft className="h-4 w-4" />
          </NavButton>
          <NavButton
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            label={t('pagination.previousPage')}
          >
            <ChevronLeft className="h-4 w-4" />
          </NavButton>

          {getPageNumbers().map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`e${i}`} className="px-1.5 text-slate-400">
                ...
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={clsx(
                  'flex h-8 min-w-[2rem] items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  p === page
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700',
                )}
              >
                {p}
              </button>
            ),
          )}

          <NavButton
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            label={t('pagination.nextPage')}
          >
            <ChevronRight className="h-4 w-4" />
          </NavButton>
          <NavButton
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            label={t('pagination.lastPage')}
          >
            <ChevronsRight className="h-4 w-4" />
          </NavButton>
        </div>
      )}
    </div>
  )
}

function NavButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
    >
      {children}
    </button>
  )
}
