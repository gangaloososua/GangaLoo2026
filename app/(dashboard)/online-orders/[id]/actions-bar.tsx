'use client'

// Round 15.6 — online order actions bar (Round 28: + Confirm for storefront drafts)
//
// A storefront order arrives as a DRAFT (no stock pulled). It must be CONFIRMED
// (deducts stock + books commissions) before it can be dispatched or delivered.
// Confirm requires choosing the salesperson to credit; the warehouse's
// distributor is credited automatically by the engine.

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  confirmStorefrontOrder,
  getSellersForConfirm,
  markOnlineOrderDispatched,
  markOnlineOrderDelivered,
  cancelOnlineOrder,
  type ConfirmSellerOption,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  saleId: string
  trackingStatus: string | null
  saleStatus: string
  fulfillmentMethod: string
}

export function OnlineOrderActionsBar({
  saleId,
  trackingStatus,
  saleStatus,
  fulfillmentMethod,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [openAction, setOpenAction] = React.useState<
    'confirm' | 'dispatch' | 'cancel' | null
  >(null)
  const [trackingNumber, setTrackingNumber] = React.useState('')
  const [cancelReason, setCancelReason] = React.useState('')
  const [sellers, setSellers] = React.useState<ConfirmSellerOption[]>([])
  const [sellerId, setSellerId] = React.useState('')
  const [loadingSellers, setLoadingSellers] = React.useState(false)

  const isCancelled = saleStatus === 'cancelled'
  const isRefunded = saleStatus === 'refunded'
  const isDraft = saleStatus === 'draft'
  const isDelivered = trackingStatus === 'delivered'
  const isPaymentFinalised = isCancelled || isRefunded

  // A draft must be confirmed first — block fulfilment until then.
  const canConfirm = isDraft && !isCancelled

  const canDispatch =
    !isPaymentFinalised &&
    !isDraft &&
    !isDelivered &&
    trackingStatus === 'received' &&
    fulfillmentMethod === 'delivery'

  const canMarkDelivered =
    !isPaymentFinalised &&
    !isDraft &&
    !isDelivered &&
    (trackingStatus === 'received' || trackingStatus === 'dispatched')

  const canCancel = !isCancelled && !isDelivered

  const nothingAvailable =
    !canConfirm && !canDispatch && !canMarkDelivered && !canCancel

  // Load sellers when the confirm form opens.
  React.useEffect(() => {
    if (openAction !== 'confirm' || sellers.length > 0 || loadingSellers) return
    setLoadingSellers(true)
    getSellersForConfirm()
      .then((rows) => setSellers(rows))
      .catch(() => setSellers([]))
      .finally(() => setLoadingSellers(false))
  }, [openAction, sellers.length, loadingSellers])

  function handleConfirm() {
    setError(null)
    if (!sellerId) {
      setError('Please choose a salesperson to credit')
      return
    }
    startTransition(async () => {
      const result = await confirmStorefrontOrder({ saleId, sellerId })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Order confirmed — stock deducted and commissions booked.')
        setOpenAction(null)
      }
    })
  }

  function handleDispatch() {
    setError(null)
    startTransition(async () => {
      const result = await markOnlineOrderDispatched({
        saleId,
        trackingNumber: trackingNumber.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Order marked dispatched.')
        setOpenAction(null)
        setTrackingNumber('')
      }
    })
  }

  function handleDeliver() {
    setError(null)
    startTransition(async () => {
      const result = await markOnlineOrderDelivered({ saleId })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Order marked delivered.')
      }
    })
  }

  function handleCancel() {
    setError(null)
    if (!cancelReason.trim()) {
      setError('Please provide a cancellation reason')
      return
    }
    startTransition(async () => {
      const result = await cancelOnlineOrder({ saleId, reason: cancelReason })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
      } else {
        toast.success('Order cancelled.')
        setOpenAction(null)
        setCancelReason('')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {nothingAvailable ? (
          <div className="text-sm text-muted-foreground">
            No actions available — this order is{' '}
            {isCancelled
              ? 'cancelled'
              : isDelivered
                ? 'delivered'
                : 'in a terminal state'}
            .
          </div>
        ) : null}

        {/* Inline form: confirm draft */}
        {openAction === 'confirm' ? (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <Label htmlFor="seller-select" className="text-xs">
              Credit this sale to (salesperson)
            </Label>
            <select
              id="seller-select"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              disabled={isPending || loadingSellers}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              <option value="">
                {loadingSellers ? 'Loading…' : 'Choose a salesperson…'}
              </option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-emerald-900 dark:text-emerald-200">
              This deducts stock from the warehouse and books commissions for the
              chosen salesperson and the warehouse&apos;s distributor. It does not
              record a payment.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Confirming…' : 'Confirm order'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenAction(null)
                  setError(null)
                }}
                disabled={isPending}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {/* Inline form: dispatch */}
        {openAction === 'dispatch' ? (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <Label htmlFor="tracking-input" className="text-xs">
              Tracking number (optional)
            </Label>
            <Input
              id="tracking-input"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. TRACK-12345"
              disabled={isPending}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleDispatch} disabled={isPending}>
                {isPending ? 'Marking…' : 'Confirm dispatch'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenAction(null)
                  setError(null)
                }}
                disabled={isPending}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {/* Inline form: cancel */}
        {openAction === 'cancel' ? (
          <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
            <Label htmlFor="cancel-reason" className="text-xs">
              Cancellation reason (required)
            </Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer changed mind"
              disabled={isPending}
              autoFocus
            />
            <p className="text-xs text-rose-900 dark:text-rose-200">
              This will return stock, reverse payments (if any), and void
              commissions. Action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancel}
                disabled={isPending}
              >
                {isPending ? 'Cancelling…' : 'Confirm cancellation'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenAction(null)
                  setError(null)
                }}
                disabled={isPending}
              >
                Keep order
              </Button>
            </div>
          </div>
        ) : null}

        {/* Action buttons (hidden while a form is open) */}
        {openAction === null && !nothingAvailable ? (
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <Button onClick={() => setOpenAction('confirm')} disabled={isPending}>
                Confirm order
              </Button>
            ) : null}
            {canDispatch ? (
              <Button
                onClick={() => setOpenAction('dispatch')}
                disabled={isPending}
              >
                Mark dispatched
              </Button>
            ) : null}
            {canMarkDelivered ? (
              <Button onClick={handleDeliver} disabled={isPending}>
                {isPending ? 'Marking…' : 'Mark delivered'}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                onClick={() => setOpenAction('cancel')}
                disabled={isPending}
              >
                Cancel order
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
