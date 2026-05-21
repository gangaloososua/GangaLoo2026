'use client'
import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDate } from '@/lib/format'
import type {
  TransactionRow,
  AccountOption,
  AccountCategoryOption,
  AccountType,
} from '@/lib/transactions'
import { TransactionForm } from './transaction-form'
import { deleteTransaction } from './actions'

const ALL = '__all__'

const TYPE_LABEL: Record<AccountType, string> = {
  income: 'Income',
  expense: 'Expense',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
}
const TYPE_ORDER: AccountType[] = ['income', 'expense', 'asset', 'liability', 'equity']

// Same grouping as the add/edit form: parent-with-children -> heading + items;
// childless top-levels collected into a per-type "(general)" block. Parents
// with children are headings only (not selectable).
type CatBlock = { key: string; heading: string; items: AccountCategoryOption[] }
function buildBlocks(categories: AccountCategoryOption[]): CatBlock[] {
  const childrenOf = new Map<string, AccountCategoryOption[]>()
  for (const c of categories) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? []
      list.push(c)
      childrenOf.set(c.parentId, list)
    }
  }
  const blocks: CatBlock[] = []
  for (const t of TYPE_ORDER) {
    const tops = categories.filter((c) => c.type === t && c.parentId === null)
    if (tops.length === 0) continue
    const standalone: AccountCategoryOption[] = []
    for (const top of tops) {
      const kids = childrenOf.get(top.id)
      if (kids && kids.length > 0) {
        blocks.push({ key: top.id, heading: top.name, items: kids })
      } else {
        standalone.push(top)
      }
    }
    if (standalone.length > 0) {
      blocks.push({ key: 'general-' + t, heading: TYPE_LABEL[t] + ' (general)', items: standalone })
    }
  }
  return blocks
}

type Current = {
  account: string
  category: string
  type: string
  from: string
  to: string
  search: string
}

type Props = {
  rows: TransactionRow[]
  accounts: AccountOption[]
  categories: AccountCategoryOption[]
  current: Current
}

export function TransactionsTable({ rows, accounts, categories, current }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [search, setSearch] = React.useState(current.search)
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<TransactionRow | null>(null)
  const [deleting, setDeleting] = React.useState<TransactionRow | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [delError, setDelError] = React.useState<string | null>(null)

  const catBlocks = React.useMemo(() => buildBlocks(categories), [categories])

  function applyFilters(next: Partial<Current>) {
    const merged: Current = { ...current, ...next }
    const params = new URLSearchParams()
    if (merged.account) params.set('account', merged.account)
    if (merged.category) params.set('category', merged.category)
    if (merged.type) params.set('type', merged.type)
    if (merged.from) params.set('from', merged.from)
    if (merged.to) params.set('to', merged.to)
    if (merged.search) params.set('q', merged.search)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function clearFilters() {
    setSearch('')
    router.push(pathname)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDelError(null)
    setBusy(true)
    const res = await deleteTransaction(deleting.id)
    setBusy(false)
    if ('error' in res) { setDelError(res.error); return }
    setDeleting(null)
    router.refresh()
  }

  const hasFilters =
    !!current.account || !!current.category || !!current.type ||
    !!current.from || !!current.to || !!current.search

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <Label>Account</Label>
            <Select
              value={current.account || ALL}
              onValueChange={(v) => applyFilters({ account: v === ALL ? '' : v })}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select
              value={current.category || ALL}
              onValueChange={(v) => applyFilters({ category: v === ALL ? '' : v })}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={ALL}>All categories</SelectItem>
                {catBlocks.map((b) => (
                  <SelectGroup key={b.key}>
                    <SelectLabel>{b.heading}</SelectLabel>
                    {b.items.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="pl-6">{c.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={current.type || ALL}
              onValueChange={(v) => applyFilters({ type: v === ALL ? '' : v })}
            >
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="f-from">From</Label>
            <Input
              id="f-from" type="date" lang="en-GB" className="w-40"
              value={current.from}
              onChange={(e) => applyFilters({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-to">To</Label>
            <Input
              id="f-to" type="date" lang="en-GB" className="w-40"
              value={current.to}
              onChange={(e) => applyFilters({ to: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="f-search">Search</Label>
            <Input
              id="f-search" className="w-48" placeholder="description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters({ search }) }}
              onBlur={() => { if (search !== current.search) applyFilters({ search }) }}
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
          )}

          <div className="ml-auto">
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add transaction
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No transactions match these filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const positive = r.amountCents >= 0
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.occurredAt)}</TableCell>
                      <TableCell>{r.accountName}</TableCell>
                      <TableCell>
                        <span>{r.categoryName}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({TYPE_LABEL[r.categoryType]})</span>
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate text-muted-foreground">
                        {r.description ?? '—'}
                        {!r.isManual && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">auto</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={
                          'text-right tabular-nums ' +
                          (positive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')
                        }
                      >
                        {positive ? '+' : '−'}{formatDOP(Math.abs(r.amountCents))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon" variant="ghost" aria-label="Edit"
                            onClick={() => setEditing(r)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" aria-label="Delete"
                            onClick={() => { setDelError(null); setDeleting(r) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rows.length >= 500 && (
        <p className="text-xs text-muted-foreground">
          Showing the most recent 500. Narrow with filters to see older entries.
        </p>
      )}

      {(adding || editing) && (
        <TransactionForm
          accounts={accounts}
          categories={categories}
          editing={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); router.refresh() }}
        />
      )}

      {deleting && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleting(null) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this transaction?</DialogTitle>
              <DialogDescription>
                This removes the entry and adjusts the account balance back. It cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span>{deleting.accountName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{deleting.categoryName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="tabular-nums">{deleting.amountCents >= 0 ? '+' : '−'}{formatDOP(Math.abs(deleting.amountCents))}</span></div>
            </div>
            {delError && <p className="text-sm text-destructive">{delError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
