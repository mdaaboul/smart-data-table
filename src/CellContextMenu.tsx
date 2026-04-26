import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Copy, ClipboardCopy, ExternalLink, EyeOff } from 'lucide-react'
import { clsx } from 'clsx'
import type { SmartColumn } from './types'

// Menu contextuel au clic droit sur une cellule. Pattern Airtable/Ninox :
// offre les raccourcis les plus frequents sans avoir a chercher dans la
// toolbar. Positionne a l'endroit exact du curseur (pas ancre sur l'element)
// pour un feel desktop-app.

interface Action {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  shortcut?: string
}

export interface CellContextTarget<T> {
  x: number
  y: number
  row: T
  column: SmartColumn<T>
  cellValue: unknown
}

interface CellContextMenuProps<T> {
  target: CellContextTarget<T> | null
  onClose: () => void
  onOpenRow?: (row: T) => void
  onHideColumn?: (colId: string) => void
  onCopyCell?: (value: string) => void
  onCopyRow?: (row: T) => void
}

function extractCellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

export function CellContextMenu<T>({
  target,
  onClose,
  onOpenRow,
  onHideColumn,
  onCopyCell,
  onCopyRow,
}: CellContextMenuProps<T>) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Clic hors du menu ou Esc = fermer
  useEffect(() => {
    if (!target) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // setTimeout pour laisser l'event de right-click se propager avant d'attacher
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [target, onClose])

  if (!target) return null

  const cellText = extractCellText(target.cellValue)

  const actions: Action[] = [
    {
      label: 'Copier la cellule',
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: () => {
        navigator.clipboard.writeText(cellText).catch(() => {})
        onCopyCell?.(cellText)
        onClose()
      },
      shortcut: '⌘C',
    },
    {
      label: 'Copier la ligne',
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      onClick: () => {
        // Copie en TSV pour que le coller dans Excel/Sheets garde la
        // separation par colonne. Ordre = ordre actuel des columns.
        onCopyRow?.(target.row)
        onClose()
      },
    },
    ...(onOpenRow ? [{
      label: 'Ouvrir la ligne',
      icon: <ExternalLink className="h-3.5 w-3.5" />,
      onClick: () => { onOpenRow(target.row); onClose() },
      shortcut: '↵',
    }] : []),
    ...(onHideColumn && !target.column.fixed ? [{
      label: `Masquer "${target.column.header}"`,
      icon: <EyeOff className="h-3.5 w-3.5" />,
      onClick: () => { onHideColumn(target.column.id); onClose() },
    }] : []),
  ]

  // Clamp position au viewport pour ne pas deborder
  const MENU_W = 240
  const MENU_H = actions.length * 32 + 8
  const left = Math.min(target.x, window.innerWidth - MENU_W - 8)
  const top = Math.min(target.y, window.innerHeight - MENU_H - 8)

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top, left, zIndex: 10000, width: MENU_W }}
      className="rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 py-1 animate-fade-in"
    >
      {/* Hint sur la cellule survolee */}
      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{target.column.header}</p>
        <p className="text-xs text-slate-700 dark:text-slate-300 truncate" title={cellText}>
          {cellText || <span className="italic text-slate-400">vide</span>}
        </p>
      </div>
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={a.onClick}
          className={clsx(
            'flex w-full items-center justify-between px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300',
            'hover:bg-slate-100 dark:hover:bg-slate-800',
            a.danger && 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30',
          )}
        >
          <span className="flex items-center gap-2">
            {a.icon}
            <span>{a.label}</span>
          </span>
          {a.shortcut && <span className="text-[10px] text-slate-400">{a.shortcut}</span>}
        </button>
      ))}
    </div>,
    document.body,
  )
}
