// Round 26e — past account transfers list (rendered on Money Accounts page).

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import type { AccountTransferRow } from '@/lib/account-transfers'

const CURRENCY_SYMBOLS: Record<string, string> = { DOP: 'RD$', USD: '$', EUR: '€' }

function fmt(cents: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? ''
  const n = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
  return `${sym}${n}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function TransfersList({ transfers }: { transfers: AccountTransferRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Transfers
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            (money moved between accounts)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {transfers.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            No transfers yet. Use “Move money” above to record one.
          </p>
        ) : (
          <div className="divide-y">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate">{t.from_account_name}</span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t.to_account_name}</span>
                    {t.is_cross_currency && (
                      <Badge variant="outline" className="text-xs">
                        {t.from_currency}→{t.to_currency}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(t.occurred_at)} · {t.scope}
                    {t.description ? ` · ${t.description}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  {t.is_cross_currency ? (
                    <>
                      <div className="text-rose-600">−{fmt(t.amount_out_cents, t.from_currency)}</div>
                      <div className="text-emerald-700">+{fmt(t.amount_in_cents, t.to_currency)}</div>
                    </>
                  ) : (
                    <div>{fmt(t.amount_out_cents, t.from_currency)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
