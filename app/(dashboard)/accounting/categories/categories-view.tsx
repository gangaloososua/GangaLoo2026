'use client'

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import {
  Plus,
  Pencil,
  ChevronRight,
  ChevronDown,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  AccountCategoryRow,
  AccountScope,
  AccountType,
  ParentOption,
} from '@/lib/account-categories'
import { createAccountCategory, updateAccountCategory } from './actions'

const ALL_TYPES: AccountType[] = ['income', 'expense', 'asset', 'liability', 'equity']

const TYPE_LABELS: Record<AccountType, string> = {
  income: 'Income',
  expense: 'Expense',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
}

type ParentOptionsByType = Partial<Record<AccountType, ParentOption[]>>

function scopeBadge(scope: AccountScope) {
  switch (scope) {
    case 'business':
      return <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">Business</Badge>
    case 'private':
      return (
        <Badge className="bg-purple-100 text-purple-900 hover:bg-purple-100">Private</Badge>
      )
    case 'mixed':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Mixed
        </Badge>
      )
  }
}

export function CategoriesView({
  rows,
  parentOptionsByType,
  initialEditRow,
}: {
  rows: AccountCategoryRow[]
  parentOptionsByType: ParentOptionsByType
  initialEditRow: AccountCategoryRow | null
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState<AccountCategoryRow | null>(initialEditRow)

  // If we arrived with ?edit=<id>, strip it from the URL so a reload doesn't
  // re-open the dialog. Silent — no re-render.
  useEffect(() => {
    if (initialEditRow && typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/accounting/categories')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the parent/child tree once per render of rows.
  const grouped = useMemo(() => {
    const tops: Record<AccountType, AccountCategoryRow[]> = {
      income: [],
      expense: [],
      asset: [],
      liability: [],
      equity: [],
    }
    const childrenOf: Record<string, AccountCategoryRow[]> = {}
    const topIds = new Set<string>()
    for (const r of rows) {
      if (!r.parent_id) {
        tops[r.type].push(r)
        topIds.add(r.id)
      }
    }
    for (const r of rows) {
      if (r.parent_id && topIds.has(r.parent_id)) {
        const list = childrenOf[r.parent_id] ?? []
        list.push(r)
        childrenOf[r.parent_id] = list
      }
    }
    return { tops, childrenOf }
  }, [rows])

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounting Categories</h1>
          <p className="text-sm text-muted-foreground">
            Tap a category to expand its sub-categories. Use the arrow to view its
            movement statement, or the pencil to edit.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add category
        </Button>
      </div>

      {ALL_TYPES.map((type) => {
        const totalOfType = rows.filter((r) => r.type === type).length
        if (totalOfType === 0) return null
        const tops = grouped.tops[type]
        return (
          <Card key={type}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {TYPE_LABELS[type]}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({totalOfType})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {tops.map((top) => (
                  <TopLevelRow
                    key={top.id}
                    row={top}
                    childRows={grouped.childrenOf[top.id] ?? []}
                    onEdit={setEditRow}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {addOpen && (
        <AddCategoryDialog
          parentOptionsByType={parentOptionsByType}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editRow && (
        <EditCategoryDialog
          row={editRow}
          parentOptions={parentOptionsByType[editRow.type] ?? []}
          onClose={() => setEditRow(null)}
        />
      )}
    </div>
  )
}

function RowMeta({
  row,
  childCount,
}: {
  row: AccountCategoryRow
  childCount?: number
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        className={`truncate text-sm font-medium ${
          row.is_active ? '' : 'text-muted-foreground line-through'
        }`}
      >
        {row.name}
      </span>
      {scopeBadge(row.scope)}
      {typeof childCount === 'number' && childCount > 0 && (
        <span className="text-xs text-muted-foreground">{childCount} sub</span>
      )}
      {row.is_system && (
        <Badge variant="outline" className="text-xs">
          System
        </Badge>
      )}
      {row.supplier_id && (
        <Badge variant="outline" className="text-xs">
          Supplier
        </Badge>
      )}
      {!row.is_active && (
        <Badge variant="outline" className="text-xs">
          Inactive
        </Badge>
      )}
    </div>
  )
}

function RowActions({
  row,
  onEdit,
}: {
  row: AccountCategoryRow
  onEdit: (r: AccountCategoryRow) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onEdit(row)
        }}
        aria-label="Edit"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button asChild variant="ghost" size="sm" aria-label="Movements">
        <Link href={`/accounting/categories/${row.id}`}>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}

function TopLevelRow({
  row,
  childRows,
  onEdit,
}: {
  row: AccountCategoryRow
  childRows: AccountCategoryRow[]
  onEdit: (r: AccountCategoryRow) => void
}) {
  const [open, setOpen] = useState(false)
  const hasChildren = childRows.length > 0

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-6 py-2.5 hover:bg-muted/40">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <RowMeta row={row} childCount={childRows.length} />
          </button>
        ) : (
          <Link
            href={`/accounting/categories/${row.id}`}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <span className="w-4 shrink-0" />
            <RowMeta row={row} />
          </Link>
        )}
        <RowActions row={row} onEdit={onEdit} />
      </div>
      {open && hasChildren && (
        <div className="divide-y border-t bg-muted/20">
          {childRows.map((c) => (
            <ChildRow key={c.id} row={c} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChildRow({
  row,
  onEdit,
}: {
  row: AccountCategoryRow
  onEdit: (r: AccountCategoryRow) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-2 pl-14 hover:bg-muted/40">
      <Link href={`/accounting/categories/${row.id}`} className="min-w-0 flex-1">
        <RowMeta row={row} />
      </Link>
      <RowActions row={row} onEdit={onEdit} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-md border px-3 py-2 text-sm'
const selectCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm'

function AddCategoryDialog({
  parentOptionsByType,
  onClose,
}: {
  parentOptionsByType: ParentOptionsByType
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('expense')
  const [scope, setScope] = useState<AccountScope>('business')
  const [parentId, setParentId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const parents = parentOptionsByType[type] ?? []

  const handleType = (next: AccountType) => {
    setType(next)
    setParentId('')
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await createAccountCategory({
        name,
        type,
        scope,
        parentId: parentId || null,
      })
      if (!res.ok) setError(res.error)
      else onClose()
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Marketing, Salary, Gifts"
            />
          </Field>

          <Field label="Type">
            <select
              value={type}
              onChange={(e) => handleType(e.target.value as AccountType)}
              className={selectCls}
            >
              {ALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Scope">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AccountScope)}
              className={selectCls}
            >
              <option value="business">Business</option>
              <option value="private">Private</option>
              <option value="mixed">Mixed</option>
            </select>
          </Field>

          <Field label="Parent (optional)">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={selectCls}
            >
              <option value="">— Top level —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCategoryDialog({
  row,
  parentOptions,
  onClose,
}: {
  row: AccountCategoryRow
  parentOptions: ParentOption[]
  onClose: () => void
}) {
  const [name, setName] = useState(row.name)
  const [scope, setScope] = useState<AccountScope>(row.scope)
  const [parentId, setParentId] = useState<string>(row.parent_id ?? '')
  const [isActive, setIsActive] = useState<boolean>(row.is_active)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const validParents = parentOptions.filter((p) => p.id !== row.id)

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await updateAccountCategory(row.id, {
        name,
        scope,
        parentId: parentId || null,
        isActive,
      })
      if (!res.ok) setError(res.error)
      else onClose()
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Type">
            <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
              {TYPE_LABELS[row.type]}{' '}
              <span className="text-xs">(locked — protects linked transactions)</span>
            </div>
          </Field>

          <Field label="Scope">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AccountScope)}
              className={selectCls}
            >
              <option value="business">Business</option>
              <option value="private">Private</option>
              <option value="mixed">Mixed</option>
            </select>
          </Field>

          <Field label="Parent">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={selectCls}
            >
              <option value="">— Top level —</option>
              {validParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>

          {(row.is_system || row.supplier_id) && (
            <p className="text-xs text-muted-foreground">
              {row.is_system ? 'System category. ' : ''}
              {row.supplier_id ? 'Linked to a supplier. ' : ''}
              Changes here affect every linked transaction.
            </p>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
