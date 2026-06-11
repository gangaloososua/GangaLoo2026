'use client'

// Round 71b — Refund + "Net received" rows for the sale Totals card.
//
// The refund total lives in the ledger, not on the sale row, so we read it via
// the existing getSaleReturnInfoAction (owner/admin gated). Renders nothing
// until it loads and nothing at all when the sale has no refunds, so normal
// invoices are unchanged. `enabled` gates the fetch to owner-equivalent users
// (the action is owner/admin only).

import { useEffect, useState } from 'react'
import { getSaleReturnInfoAction } from './return-money-actions'
import { formatDOP } from '@/lib/format'
import type { Locale } from '@/lib/i18n/dictionary'

export function RefundSummaryRows({
  saleId,
  paidCents,
  locale,
  enabled,
}: {
  saleId: string
  paidCents: number
  locale: Locale
  enabled: boolean
}) {
  const es = locale === 'es'
  const [returnedCents, setReturnedCents] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getSaleReturnInfoAction(saleId)
      .then((res) => {
        if (!cancelled && res.ok) setReturnedCents(res.info.returnedCents)
      })
      .catch(() => {
        /* non-fatal: just don't show the refund rows */
      })
    return () => {
      cancelled = true
    }
  }, [saleId, enabled])

  if (returnedCents <= 0) return null

  return (
    <>
      <div className="flex justify-between">
        <dt className="text-rose-700">{es ? 'Reembolsos' : 'Refunds'}</dt>
        <dd className="tabular-nums text-rose-700">-{formatDOP(returnedCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="font-semibold">{es ? 'Neto recibido' : 'Net received'}</dt>
        <dd className="tabular-nums font-semibold">
          {formatDOP(paidCents - returnedCents)}
        </dd>
      </div>
    </>
  )
}