'use client'

// Online-order "Add payment" dialog.
//
// Reuses the shared, ledger-posting recordPayment action (which routes
// through the receive_payment RPC -> post_sale_payment_to_ledger). Same
// engine as POS "Add payment" and Recibir Pago. Owner-gated in the action.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
import type { MoneyAccount } from '@/lib/sales'
import { recordPayment } from '../../sales/actions'

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'credit', label: 'Store credit' },
  { value: 'mixed', label: 'Mixed' },
]

const ACCOUNT_KIND_LABEL: Record<MoneyAccount['kind'], string> = {
  bank: 'Bank',
  cash: 'Cash',
  card: 'Card',
  digital: 'Digital',
  credit_line: 'Credit line',
}

export function AddPaymentDialog({
  open,
  onOpenChange,
  saleId,
  suggestedAmountCents,
  moneyAccounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  suggestedAmountCents: number
  moneyAccounts: MoneyAccount[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const [method, setMethod] = useState<string>('cash')
  const [amountStr, setAmountStr] = useState<string>(
    (Math.max(0, suggestedAmountCents) / 100).toFixed(2),
  )
  const [accountId, setAccountId] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>(today)
  const [reference, setReference] = useState<string>('')

  function handleOpenChange(next: boolean) {
    if (next) {
      setMethod('cash')
      setAmountStr((Math.max(0, suggestedAmountCents) / 100).toFixed(2))
      setAccountId('')
      setPaidAt(new Date().toISOString().slice(0, 10))
      setReference('')
    }
    onOpenChange(next)
  }

  const grouped = moneyAccounts.reduce<Record<string, MoneyAccount[]>>(
    (acc, a) => {
      ;(acc[a.kind] ??= []).push(a)
      return acc
    },
    {},
  )
  const kindOrder: Array<MoneyAccount['kind']> = [
    'bank',
    'cash',
    'card',
    'digital',
    'credit_line',
  ]

  function doSubmit() {
    const amount = Number(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be greater than zero.')
      return
    }
    if (!accountId) {
      toast.error('Pick a money account.')
      return
    }
    const amountCents = Math.round(amount * 100)

    startTransition(async () => {
      const res = await recordPayment({
        saleId,
        method: method as
          | 'cash'
          | 'card'
          | 'transfer'
          | 'paypal'
          | 'stripe'
          | 'credit'
          | 'mixed',
        amountCents,
        moneyAccountId: accountId,
        paidAt,
        reference: reference.trim() || undefined,
      })
      if (res.ok) {
        toast.success('Payment recorded.')
        handleOpenChange(false)
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
          <DialogTitle>Add payment</DialogTitle>
          <DialogDescription>
            Record a payment against this online order. Posts to the chosen
            account and updates the order balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="oo-pay-method" className="text-xs">
                Method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="oo-pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="oo-pay-amount" className="text-xs">
                Amount (DOP) <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="oo-pay-amount"
                type="number"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="oo-pay-account" className="text-xs">
              Account <span className="text-rose-600">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="oo-pay-account">
                <SelectValue placeholder="Pick an account" />
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
              <Label htmlFor="oo-pay-date" className="text-xs">
                Date
              </Label>
              <Input
                id="oo-pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oo-pay-ref" className="text-xs">
                Reference
              </Label>
              <Input
                id="oo-pay-ref"
                placeholder="Bank ref / note"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? 'Recording…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
