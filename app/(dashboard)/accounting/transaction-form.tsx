'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type {
  AccountCategoryOption,
  AccountOption,
  AccountType,
  AccountScope,
  TransactionRow,
} from '@/lib/transactions'
import { addTransaction, editTransaction, type ManualTxnInput } from './actions'

const TYPE_LABEL: Record<AccountType, string> = {
  income: 'Income',
  expense: 'Expense',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
}
const TYPE_ORDER: AccountType[] = ['income', 'expense', 'asset', 'liability', 'equity']

const SCOPES: AccountScope[] = ['business', 'private', 'mixed']

type Props = {
  accounts: AccountOption[]
  categories: AccountCategoryOption[]
  editing: TransactionRow | null
  onClose: () => void
  onSaved: () => void
}

function toDateInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

// A renderable block in the category dropdown: a heading and its pickable items.
type CatBlock = { key: string; heading: string; items: AccountCategoryOption[] }

// Build the grouped structure: for each type, one block per parent-with-children
// (parent = heading, children = pickable), plus a "(general)" block holding any
// top-level categories that have no children (e.g. Sales, Refunds) so they stay
// selectable. Parents that have children are NEVER selectable.
function buildBlocks(categories: AccountCategoryOption[]): CatBlock[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenOf = new Map<string, AccountCategoryOption[]>()
  for (const c of categories) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) ?? []
      list.push(c)
      childrenOf.set(c.parentId, list)
    }
  }
  const hasChildren = (id: string) => (childrenOf.get(id)?.length ?? 0) > 0

  const blocks: CatBlock[] = []
  for (const t of TYPE_ORDER) {
    const tops = categories.filter((c) => c.type === t && c.parentId === null)
    if (tops.length === 0) continue

    // Standalone tops (no children) collected into one "(general)" block.
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
  // Keep byId referenced (lint) - used implicitly by callers via categories.
  void byId
  return blocks
}

export function TransactionForm({ accounts, categories, editing, onClose, onSaved }: Props) {
  const [accountId, setAccountId] = React.useState(editing?.moneyAccountId ?? '')
  const [categoryId, setCategoryId] = React.useState(editing?.categoryId ?? '')
  const [scope, setScope] = React.useState<AccountScope>(editing?.scope ?? 'business')
  const [date, setDate] = React.useState(toDateInput(editing?.occurredAt ?? null))
  const [description, setDescription] = React.useState(editing?.description ?? '')
  const [amount, setAmount] = React.useState(
    editing ? (Math.abs(editing.amountCents) / 100).toString() : '',
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const blocks = React.useMemo(() => buildBlocks(categories), [categories])
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null

  async function save() {
    setError(null)
    if (!accountId) { setError('Pick an account.'); return }
    if (!selectedCategory) { setError('Pick a category.'); return }
    const pesos = Number(amount)
    if (!Number.isFinite(pesos) || pesos <= 0) { setError('Enter an amount greater than zero.'); return }

    const input: ManualTxnInput = {
      moneyAccountId: accountId,
      categoryId: selectedCategory.id,
      categoryType: selectedCategory.type,
      amountCents: Math.round(pesos * 100),
      scope,
      occurredAt: date || null,
      description: description.trim() ? description.trim() : null,
    }

    setBusy(true)
    const res = editing
      ? await editTransaction(editing.id, input)
      : await addTransaction(input)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onSaved()
  }

  const outflow = selectedCategory
    ? selectedCategory.type === 'expense' || selectedCategory.type === 'liability'
    : false

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changing this updates the account balance to match.'
              : 'This posts to the ledger and moves the account balance automatically.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {blocks.map((b) => (
                  <SelectGroup key={b.key}>
                    <SelectLabel>{b.heading}</SelectLabel>
                    {b.items.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="pl-6">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="txn-amount">Amount (RD$)</Label>
              <Input
                id="txn-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {selectedCategory && (
                <p className="text-xs text-muted-foreground">
                  {outflow ? 'Will lower the balance' : 'Will raise the balance'}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="txn-date">Date</Label>
              <Input
                id="txn-date"
                type="date"
                lang="en-GB"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as AccountScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="txn-desc">Description (optional)</Label>
            <Input
              id="txn-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. office rent for May"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
