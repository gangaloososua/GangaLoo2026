'use client'

// Round 36a — review controls for parked transfer requests.
//
// RequestReviewButtons: owner/admin only (English — owner-facing). Approve
// (trim per-line qty, drop a line with 0) or decline with a reason.
// WithdrawRequestButton: the requesting distributor pulls back their own
// pending request (locale-aware — Spanish for distributors).
//
// Round 67a (mobile fix): the approve dialog now caps at 90dvh with an
// internal scroll and a pinned footer, so "Approve & send" is always reachable
// even with many line items. The button group also wraps to full width on
// phones (it stacks under the request details — see transfers/page.tsx).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { approveTransfer, declineTransfer } from './actions'
import { tt } from '@/lib/i18n/transfers-i18n'
import type { Locale } from '@/lib/i18n/dictionary'
import type { PendingRequest } from '@/lib/stock-transfers'

export function RequestReviewButtons({ request }: { request: PendingRequest }) {
  const router = useRouter()
  const [approveOpen, setApproveOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(request.items.map((it) => [it.id, it.qty])),
  )

  function setQty(itemId: string, max: number, raw: string) {
    const n = parseInt(raw, 10)
    const v = Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
    setQtys((p) => ({ ...p, [itemId]: v }))
  }

  const approvedItems = request.items
    .map((it) => ({ productId: it.product_id, qty: qtys[it.id] ?? it.qty }))
    .filter((x) => x.qty > 0)
  const canApprove = approvedItems.length > 0 && !submitting

  async function doApprove() {
    if (!canApprove) return
    setSubmitting(true)
    try {
      const res = await approveTransfer({
        transferId: request.id,
        items: approvedItems,
        note: note.trim() || null,
      })
      if (res.ok) {
        toast.success('Approved — stock is now in transit.')
        setApproveOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve.')
      setSubmitting(false)
    }
  }

  async function doDecline() {
    setSubmitting(true)
    try {
      const res = await declineTransfer(request.id, reason.trim() || null)
      if (res.ok) {
        toast.success('Request declined.')
        setDeclineOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
      <Button
        type="button"
        size="sm"
        className="flex-1 sm:flex-none"
        onClick={() => setApproveOpen(true)}
      >
        Review &amp; approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="flex-1 sm:flex-none"
        onClick={() => setDeclineOpen(true)}
      >
        Decline
      </Button>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>Approve transfer request</AlertDialogTitle>
            <AlertDialogDescription>
              Set how much of each product to send from {request.from_warehouse_name}{' '}
              to {request.to_warehouse_name}. Set a line to 0 to leave it out. The
              stock leaves {request.from_warehouse_name} as soon as you approve.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Requested</th>
                    <th className="py-2 font-medium">Send</th>
                  </tr>
                </thead>
                <tbody>
                  {request.items.map((it) => (
                    <tr key={it.id} className="border-b align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{it.product_name}</div>
                        {it.product_sku ? (
                          <div className="text-xs text-muted-foreground">{it.product_sku}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{it.qty}</td>
                      <td className="py-2">
                        <Input
                          type="number"
                          min={0}
                          max={it.qty}
                          step={1}
                          value={qtys[it.id] ?? it.qty}
                          onChange={(e) => setQty(it.id, it.qty, e.target.value)}
                          className="w-24"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything to record about this approval."
              />
            </div>
          </div>

          <AlertDialogFooter className="shrink-0 border-t pt-4">
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canApprove}
              onClick={(e) => {
                e.preventDefault()
                void doApprove()
              }}
            >
              {submitting ? 'Approving…' : 'Approve & send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this request?</AlertDialogTitle>
            <AlertDialogDescription>
              No stock moves. The distributor will see the request was declined. You
              can add a short reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why you're declining (optional)."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                void doDecline()
              }}
            >
              {submitting ? 'Declining…' : 'Decline request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function WithdrawRequestButton({
  transferId,
  locale = 'en',
}: {
  transferId: string
  locale?: Locale
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function doWithdraw() {
    setSubmitting(true)
    try {
      const res = await declineTransfer(transferId, null)
      if (res.ok) {
        toast.success(tt(locale, 'tr.withdraw.toastDone'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt(locale, 'tr.withdraw.toastFailed'))
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {tt(locale, 'tr.withdraw.button')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt(locale, 'tr.withdraw.title')}</AlertDialogTitle>
            <AlertDialogDescription>{tt(locale, 'tr.withdraw.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{tt(locale, 'tr.withdraw.keep')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                void doWithdraw()
              }}
            >
              {submitting ? tt(locale, 'tr.withdraw.doing') : tt(locale, 'tr.withdraw.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
