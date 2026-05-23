'use client'

// Round 26a — seller cash reconcile view (owner/admin).
//
// Grouped by seller: each seller is a row showing their total held cash;
// expand to see the individual collections. Each collection has a "Hand in"
// button → dialog (account + date + optional reference) → handInSellerCash,
// which records the real payment and clears the entry.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Banknote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDOP, formatDateTime } from '@/lib/format'
import type { MoneyAccount } from '@/lib/sales'
import type { SellerHeldGroup, HeldCollection } from '@/lib/seller-cash'
import { handInSellerCash } from './actions'

const ACCOUNT_KIND_LABEL: Record<MoneyAccount['kind'], string> = {
  bank: 'Bank',
  cash: 'Cash',
  card: 'Card',
  digital: 'Digital',
  credit_line: 'Credit line',
}

type HandInTarget = {
  collection: HeldCollection
  sellerName: string
}

export function ReconcileView({
  groups,
  moneyAccounts,
}: {
  groups: SellerHeldGroup[]
  moneyAccounts: MoneyAccount[]
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.seller_id)), // start expanded
  )
  const [handInTarget, setHandInTarget] = useState<HandInTarget | null>(null)

  function toggle(sellerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sellerId)) next.delete(sellerId)
      else next.add(sellerId)
      return next
    })
  }

  const grandTotal = groups.reduce((s, g) => s + g.total_cents, 0)

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No cash is currently held by sellers. When a seller logs cash collected
          on one of their orders, it shows up here to hand in.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-muted-foreground">
            Total held by all sellers
          </span>
          <span className="text-xl font-semibold tabular-nums">
            {formatDOP(grandTotal)}
          </span>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {groups.map((g) => {
          const open = expanded.has(g.seller_id)
          return (
            <Card key={g.seller_id}>
              <button
                type="button"
                onClick={() => toggle(g.seller_id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{g.seller_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.collections.length}{' '}
                    {g.collections.length === 1 ? 'collection' : 'collections'}
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatDOP(g.total_cents)}
                </span>
              </button>

              {open && (
                <div className="border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Order</th>
                        <th className="px-4 py-2 font-medium">Collected</th>
                        <th className="px-4 py-2 font-medium">Note</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.collections.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="px-4 py-2 font-mono">
                            {c.invoice_number ?? c.sale_id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {formatDateTime(c.collected_at)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {c.note ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatDOP(c.amount_cents)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setHandInTarget({ collection: c, sellerName: g.seller_name })
                              }
                            >
                              <Banknote className="mr-1 h-3.5 w-3.5" />
                              Hand in
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <HandInDialog
        target={handInTarget}
        onClose={() => setHandInTarget(null)}
        moneyAccounts={moneyAccounts}
      />
    </div>
  )
}

function HandInDialog({
  target,
  onClose,
  moneyAccounts,
}: {
  target: HandInTarget | null
  onClose: () => void
  moneyAccounts: MoneyAccount[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [accountId, setAccountId] = useState<string>('')
  const [receivedAt, setReceivedAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [reference, setReference] = useState<string>('')

  // Reset fields whenever a new target opens the dialog.
  const open = target !== null
  function handleOpenChange(next: boolean) {
    if (next) {
      setAccountId('')
      setReceivedAt(new Date().toISOString().slice(0, 10))
      setReference('')
    }
    if (!next) onClose()
  }

  // Group accounts by kind for the picker (mirrors AddPaymentDialog).
  const grouped = moneyAccounts.reduce<Record<string, MoneyAccount[]>>((acc, a) => {
    ;(acc[a.kind] ||= []).push(a)
    return acc
  }, {})
  const kindOrder: Array<MoneyAccount['kind']> = ['bank', 'cash', 'card', 'digital', 'credit_line']

  function doSubmit() {
    if (!target) return
    if (!accountId) {
      toast.error('Pick a money account.')
      return
    }
    startTransition(async () => {
      const res = await handInSellerCash({
        collectionId: target.collection.id,
        moneyAccountId: accountId,
        receivedAt,
        reference: reference.trim() || undefined,
      })
      if (res.ok) {
        toast.success('Cash handed in and payment recorded.')
        onClose()
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand in cash</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                Receiving {formatDOP(target.collection.amount_cents)} from{' '}
                {target.sellerName} for order{' '}
                {target.collection.invoice_number ?? target.collection.sale_id.slice(0, 8)}.
                This records the real payment on that order into the account you pick.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="handin-account" className="text-xs">
              Into account <span className="text-rose-600">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="handin-account">
                <SelectValue placeholder="Pick an account…" />
              </SelectTrigger>
              <SelectContent>
                {kindOrder
                  .filter((k) => grouped[k]?.length)
                  .map((k) => (
                    <SelectGroup key={k}>
                      <SelectLabel>{ACCOUNT_KIND_LABEL[k]}</SelectLabel>
                      {grouped[k].map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="handin-date" className="text-xs">
                Received date
              </Label>
              <Input
                id="handin-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="handin-ref" className="text-xs">
                Reference
              </Label>
              <Input
                id="handin-ref"
                placeholder="(optional)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? 'Recording…' : 'Hand in & record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
