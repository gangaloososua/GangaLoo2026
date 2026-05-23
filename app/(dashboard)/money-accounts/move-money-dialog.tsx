'use client'

// Round 26e — Move money between accounts dialog.
//
// Same-currency: one amount field (out === in). Cross-currency: a second
// "amount received" field appears so the user records the real pesos/euros
// they actually got at the exchange. Posts via transferMoney.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TransferAccountOption } from '@/lib/account-transfers'
import { transferMoney } from './transfer-actions'

type Scope = 'business' | 'private' | 'mixed'

export function MoveMoneyDialog({ accounts }: { accounts: TransferAccountOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [amountOut, setAmountOut] = useState<string>('')
  const [amountIn, setAmountIn] = useState<string>('')
  const [scope, setScope] = useState<Scope>('business')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState<string>('')

  const from = accounts.find((a) => a.id === fromId) ?? null
  const to = accounts.find((a) => a.id === toId) ?? null
  const crossCurrency = !!from && !!to && from.currency !== to.currency

  // Destination options exclude the chosen source.
  const toOptions = useMemo(
    () => accounts.filter((a) => a.id !== fromId),
    [accounts, fromId],
  )

  function reset() {
    setFromId(''); setToId(''); setAmountOut(''); setAmountIn('')
    setScope('business'); setDate(new Date().toISOString().slice(0, 10)); setNote('')
  }

  function handleOpenChange(next: boolean) {
    if (next) reset()
    setOpen(next)
  }

  function doSubmit() {
    if (!fromId || !toId) { toast.error('Pick both accounts.'); return }
    if (fromId === toId) { toast.error('Accounts must be different.'); return }
    const out = Number(amountOut)
    if (!Number.isFinite(out) || out <= 0) { toast.error('Enter an amount to send.'); return }
    // Same currency: in mirrors out. Cross: use the typed received amount.
    const inAmt = crossCurrency ? Number(amountIn) : out
    if (!Number.isFinite(inAmt) || inAmt <= 0) {
      toast.error('Enter the amount received.'); return
    }

    setPending(true)
    transferMoney({
      fromAccountId: fromId,
      toAccountId: toId,
      amountOutCents: Math.round(out * 100),
      amountInCents: Math.round(inAmt * 100),
      scope,
      occurredAt: date,
      description: note.trim() || undefined,
    }).then((res) => {
      if (res.ok) {
        toast.success('Transfer recorded.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
      setPending(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="mr-1 size-4" />
          Move money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move money between accounts</DialogTitle>
          <DialogDescription>
            Records money leaving one account and arriving in another. It doesn&apos;t
            count as income or expense.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From <span className="text-rose-600">*</span></Label>
              <Select value={fromId} onValueChange={(v) => { setFromId(v); if (v === toId) setToId('') }}>
                <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
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
              <Label className="text-xs">To <span className="text-rose-600">*</span></Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                <SelectContent>
                  {toOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={crossCurrency ? 'grid grid-cols-2 gap-3' : ''}>
            <div className="space-y-1">
              <Label className="text-xs">
                {crossCurrency ? `Amount sent${from ? ` (${from.currency})` : ''}` : 'Amount'}{' '}
                <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={amountOut}
                onChange={(e) => setAmountOut(e.target.value)}
                placeholder="0.00"
                disabled={pending}
              />
            </div>
            {crossCurrency && (
              <div className="space-y-1">
                <Label className="text-xs">
                  Amount received{to ? ` (${to.currency})` : ''} <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0.00"
                  disabled={pending}
                />
              </div>
            )}
          </div>

          {crossCurrency && (
            <p className="text-xs text-muted-foreground">
              Different currencies — enter the actual amount that landed in the destination
              (the rate you really got, fees and all).
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Reason / reference…"
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={doSubmit} disabled={pending}>
            {pending ? 'Recording…' : 'Move money'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
