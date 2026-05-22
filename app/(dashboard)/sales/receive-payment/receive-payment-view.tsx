'use client'

// Recibir Pago - client screen.
//
// One deposit allocated across one or more open invoices. The operator enters
// the deposit AMOUNT (what actually arrived), then types how much of it goes
// onto each invoice. A live tally shows allocated-of-deposit and the remainder.
// Confirm is enabled only when the allocations sum EXACTLY to the deposit - the
// safety cross-check that you placed every peso you received and no more. One
// save -> receivePayment -> receipt + posted payments + status updates,
// atomically in the RPC.
//
// Money entry is in DECIMAL pesos (open-invoice balances carry cents, e.g.
// 7257.11), unlike the whole-peso POS inputs. We parse to integer cents.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { OpenInvoice } from '@/lib/receive-payment'
import {
  receivePayment,
  type PaymentMethod,
} from './receive-payment-actions'

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'transfer', label: 'Transferencia' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'credit', label: 'Crédito de tienda' },
]

/** Parse a decimal-peso string into integer cents. "" -> 0; invalid -> 0. */
function dopToCents(s: string): number {
  const t = s.trim()
  if (t === '') return 0
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function todayYmd(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pickDefaultAccountId(
  accounts: MoneyAccount[],
  method: PaymentMethod,
): string {
  const byKind = accounts.find((a) => a.kind === method)
  if (byKind) return byKind.id
  return accounts[0]?.id ?? ''
}

type Props = {
  openInvoices: OpenInvoice[]
  moneyAccounts: MoneyAccount[]
}

export function ReceivePaymentView({ openInvoices, moneyAccounts }: Props) {
  const router = useRouter()

  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [moneyAccountId, setMoneyAccountId] = useState<string>(
    pickDefaultAccountId(moneyAccounts, 'transfer'),
  )
  const [receivedAt, setReceivedAt] = useState<string>(todayYmd())
  const [reference, setReference] = useState<string>('')
  const [depositInput, setDepositInput] = useState<string>('')

  // Per-invoice allocation inputs, keyed by sale id (decimal-peso strings).
  const [alloc, setAlloc] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function setMethodAndAccount(m: PaymentMethod) {
    setMethod(m)
    setMoneyAccountId(pickDefaultAccountId(moneyAccounts, m))
  }

  function setInvoiceAmount(saleId: string, value: string) {
    setAlloc((prev) => ({ ...prev, [saleId]: value }))
  }

  function fillOutstanding(inv: OpenInvoice) {
    setInvoiceAmount(inv.id, (inv.outstanding_cents / 100).toString())
  }

  const depositCents = useMemo(() => dopToCents(depositInput), [depositInput])

  // Allocations in cents, only the ones with a positive amount.
  const allocations = useMemo(() => {
    const out: Array<{ sale_id: string; amount_cents: number; inv: OpenInvoice }> = []
    for (const inv of openInvoices) {
      const cents = dopToCents(alloc[inv.id] ?? '')
      if (cents > 0) out.push({ sale_id: inv.id, amount_cents: cents, inv })
    }
    return out
  }, [alloc, openInvoices])

  const allocatedCents = useMemo(
    () => allocations.reduce((s, a) => s + a.amount_cents, 0),
    [allocations],
  )
  const remainingCents = depositCents - allocatedCents
  const matched = depositCents > 0 && remainingCents === 0

  // Any allocation exceeding its invoice's outstanding (a soft warning).
  const overpaidLines = useMemo(
    () => allocations.filter((a) => a.amount_cents > a.inv.outstanding_cents),
    [allocations],
  )

  const canSubmit =
    !submitting && !!moneyAccountId && matched && allocations.length > 0

  async function handleConfirm() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await receivePayment({
        moneyAccountId,
        method,
        receivedAt,
        reference: reference || undefined,
        allocations: allocations.map((a) => ({
          sale_id: a.sale_id,
          amount_cents: a.amount_cents,
        })),
      })
      if (res.ok) {
        toast.success(
          `Pago de ${formatDOP(res.depositCents)} registrado en ${res.invoicesPaid} ${
            res.invoicesPaid === 1 ? 'factura' : 'facturas'
          }.`,
        )
        router.push('/sales')
        router.refresh()
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falló el registro del pago.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {moneyAccounts.length === 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No hay cuentas de dinero activas. Crea una antes de recibir pagos.
        </div>
      )}

      {/* Deposit header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">El depósito</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">Monto recibido (DOP)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                placeholder="0.00"
                className="font-medium"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Cuenta (dónde entró)</Label>
              <Select value={moneyAccountId || undefined} onValueChange={setMoneyAccountId}>
                <SelectTrigger><SelectValue placeholder="Escoge…" /></SelectTrigger>
                <SelectContent>
                  {moneyAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{' '}
                      <span className="text-xs text-muted-foreground">({a.kind})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Método</Label>
              <Select value={method} onValueChange={(v) => setMethodAndAccount(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Referencia (opcional)</Label>
              <Input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ref. banco / nota"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open invoices + allocation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facturas abiertas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay facturas abiertas. Todo está cobrado. 🎉
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Factura</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Vendedor</th>
                    <th className="px-3 py-2 text-right font-medium">Pendiente</th>
                    <th className="px-3 py-2 text-right font-medium">Asignar</th>
                  </tr>
                </thead>
                <tbody>
                  {openInvoices.map((inv) => {
                    const cents = dopToCents(alloc[inv.id] ?? '')
                    const over = cents > inv.outstanding_cents
                    return (
                      <tr key={inv.id} className="border-b align-middle">
                        <td className="px-3 py-2 font-medium">{inv.invoice_number ?? '—'}</td>
                        <td className="px-3 py-2">{inv.customer_name ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{inv.seller_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatDOP(inv.outstanding_cents)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={alloc[inv.id] ?? ''}
                              onChange={(e) => setInvoiceAmount(inv.id, e.target.value)}
                              placeholder="0.00"
                              className={`w-32 text-right ${over ? 'border-amber-500' : ''}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => fillOutstanding(inv)}
                            >
                              Todo
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Live tally vs the deposit */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <div className="text-muted-foreground">
              {allocations.length}{' '}
              {allocations.length === 1 ? 'factura seleccionada' : 'facturas seleccionadas'}
            </div>
            <div className="tabular-nums">
              <span className="text-muted-foreground">Asignado:</span>{' '}
              <span className="font-medium">{formatDOP(allocatedCents)}</span>
              <span className="mx-2 text-muted-foreground">de</span>
              <span className="font-medium">{formatDOP(depositCents)}</span>
              {depositCents > 0 && remainingCents !== 0 && (
                <span className={`ml-3 ${remainingCents > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {remainingCents > 0
                    ? `Restante: ${formatDOP(remainingCents)}`
                    : `Excedido: ${formatDOP(-remainingCents)}`}
                </span>
              )}
              {matched && <span className="ml-3 text-emerald-600">✓ Cuadra</span>}
            </div>
          </div>

          {overpaidLines.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Una o más asignaciones superan el saldo pendiente de su factura
              (quedará sobrepagada). Revisa los montos marcados.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/sales')}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          title={
            !matched
              ? 'Lo asignado debe cuadrar exactamente con el monto recibido'
              : 'Registrar pago'
          }
          onClick={() => setConfirmOpen(true)}
        >
          {submitting ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Registrar este pago?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Depósito de <span className="font-medium">{formatDOP(depositCents)}</span>{' '}
                  repartido en {allocations.length}{' '}
                  {allocations.length === 1 ? 'factura' : 'facturas'}, abonado a la cuenta
                  seleccionada.
                </div>
                <div className="rounded-md border p-2">
                  {allocations.map((a) => (
                    <div key={a.sale_id} className="flex justify-between tabular-nums">
                      <span className="text-muted-foreground">{a.inv.invoice_number ?? '—'}</span>
                      <span>{formatDOP(a.amount_cents)}</span>
                    </div>
                  ))}
                </div>
                {overpaidLines.length > 0 && (
                  <div className="text-amber-700">
                    Atención: alguna factura quedará sobrepagada.
                  </div>
                )}
                <div className="text-muted-foreground">
                  Esto crea el recibo, registra el pago en cada factura y abona la cuenta —
                  todo a la vez.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleConfirm()
              }}
            >
              Registrar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
