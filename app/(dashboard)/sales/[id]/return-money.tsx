'use client'

// Round 68f — "Return money" button + dialog on the sale page (owner/admin).
//
// Opens, loads the returnable info (collected / already returned / returnable),
// prefills the amount to the full returnable and the account to where the money
// came in, and lets the owner adjust for a PARTIAL return. Caps client-side at
// the returnable; the Round 68e function is the real authority. Posts the
// cash-out via returnSaleMoneyAction, then refreshes.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatDOP } from '@/lib/format'
import type { MoneyAccount } from '@/lib/sales'
import type { Locale } from '@/lib/i18n/dictionary'
import {
  getSaleReturnInfoAction,
  returnSaleMoneyAction,
  type SaleReturnInfo,
} from './return-money-actions'

export function ReturnMoney({
  saleId,
  moneyAccounts,
  canReturn,
  locale,
}: {
  saleId: string
  moneyAccounts: MoneyAccount[]
  canReturn: boolean
  locale: Locale
}) {
  const es = locale === 'es'
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [info, setInfo] = useState<SaleReturnInfo | null>(null)
  const [amount, setAmount] = useState('') // pesos
  const [accountId, setAccountId] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setInfo(null)
    getSaleReturnInfoAction(saleId)
      .then((res) => {
        if (cancelled) return
        setLoading(false)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        setInfo(res.info)
        setAmount((res.info.returnableCents / 100).toString())
        setAccountId(res.info.suggestedAccountId ?? moneyAccounts[0]?.id ?? '')
      })
      .catch((e) => {
        if (cancelled) return
        setLoading(false)
        toast.error(e instanceof Error ? e.message : es ? 'Error al cargar.' : 'Failed to load.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saleId])

  if (!canReturn) return null

  const returnableCents = info?.returnableCents ?? 0
  const amountCents = Math.round((parseFloat(amount) || 0) * 100)
  const amountValid = amountCents > 0 && amountCents <= returnableCents
  const nothingToReturn = !loading && info != null && returnableCents <= 0

  async function doReturn() {
    if (!amountValid || !accountId) return
    setSubmitting(true)
    try {
      const res = await returnSaleMoneyAction(saleId, amountCents, accountId, note.trim() || null)
      if (res.ok) {
        toast.success(es ? 'Dinero devuelto.' : 'Money returned.')
        setOpen(false)
        setNote('')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : es ? 'Falló la devolución.' : 'Return failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {es ? 'Devolver dinero' : 'Return money'}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{es ? 'Devolver dinero' : 'Return money'}</AlertDialogTitle>
            <AlertDialogDescription>
              {es
                ? 'Devuelve dinero al cliente. Sale de la cuenta que elijas y queda registrado.'
                : 'Return cash to the customer. It leaves the account you choose and is logged in your books.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {es ? 'Cargando…' : 'Loading…'}
            </div>
          ) : nothingToReturn ? (
            <p className="py-2 text-sm text-muted-foreground">
              {es
                ? 'No queda nada por devolver en esta venta.'
                : 'There is nothing left to return on this sale.'}
            </p>
          ) : info ? (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {es ? 'Cobrado' : 'Collected'}: {formatDOP(info.collectedCents)}
                {' · '}
                {es ? 'Ya devuelto' : 'Returned'}: {formatDOP(info.returnedCents)}
                {' · '}
                <span className="font-medium text-foreground">
                  {es ? 'Disponible' : 'Returnable'}: {formatDOP(info.returnableCents)}
                </span>
              </div>

              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rm-amount">
                  {es ? 'Monto (RD$)' : 'Amount (RD$)'}
                </Label>
                <Input
                  id="rm-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {!amountValid && amount !== '' ? (
                  <p className="text-xs text-rose-600">
                    {es
                      ? `Debe ser entre 0 y ${formatDOP(returnableCents)}.`
                      : `Must be between 0 and ${formatDOP(returnableCents)}.`}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{es ? 'Cuenta' : 'Account'}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={es ? 'Escoge una cuenta' : 'Choose an account'} />
                  </SelectTrigger>
                  <SelectContent>
                    {moneyAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs" htmlFor="rm-note">
                  {es ? 'Nota (opcional)' : 'Note (optional)'}
                </Label>
                <Input
                  id="rm-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={es ? 'Motivo de la devolución' : 'Reason for the return'}
                  autoComplete="off"
                />
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              {es ? 'Cancelar' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || loading || nothingToReturn || !amountValid || !accountId}
              onClick={(e) => {
                e.preventDefault()
                void doReturn()
              }}
            >
              {submitting
                ? es
                  ? 'Devolviendo…'
                  : 'Returning…'
                : es
                  ? 'Devolver dinero'
                  : 'Return money'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
