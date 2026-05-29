'use client'

// Round 41a - Partial supplier payments: the on-screen list of part-payments
// recorded against a pending order, each with a confirm-guarded remove button.
// Rendered inside the order page's Money panel (see page.tsx).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { removeSupplierPayment } from '../actions'

export type SupplierPaymentListItem = {
  id: string
  account_name: string | null
  dop_amount: number
  paid_at: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDop(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function SupplierPaymentsList({
  orderId,
  payments,
}: {
  orderId: string
  payments: SupplierPaymentListItem[]
}) {
  const router = useRouter()
  const [removingId, setRemovingId] = useState<string | null>(null)

  if (payments.length === 0) return null

  async function handleRemove(paymentId: string) {
    setRemovingId(paymentId)
    const res = await removeSupplierPayment(paymentId, orderId)
    if (!res.ok) {
      toast.error(res.error)
      setRemovingId(null)
      return
    }
    toast.success('Payment removed. The money was put back.')
    setRemovingId(null)
    router.refresh()
  }

  return (
    <div className="mt-3 rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-2 py-2 font-medium">Paid</th>
            <th className="px-2 py-2 font-medium">From</th>
            <th className="px-2 py-2 text-right font-medium">DOP</th>
            <th className="w-10 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b last:border-b-0">
              <td className="px-2 py-2 text-xs tabular-nums">{fmtDate(p.paid_at)}</td>
              <td className="px-2 py-2 text-xs">{p.account_name ?? '—'}</td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">{fmtDop(p.dop_amount)}</td>
              <td className="px-2 py-2 text-right">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      disabled={removingId === p.id}
                      aria-label="Remove this payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                          <div>
                            This removes the {fmtDop(p.dop_amount)} DOP payment from{' '}
                            {p.account_name ?? 'this account'} on {fmtDate(p.paid_at)} and puts
                            that money back into the account.
                          </div>
                          <div className="text-muted-foreground">
                            Use this if you entered a payment by mistake.
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={removingId === p.id}>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={removingId === p.id}
                        onClick={(e) => {
                          e.preventDefault()
                          void handleRemove(p.id)
                        }}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {removingId === p.id ? 'Removing...' : 'Remove payment'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
