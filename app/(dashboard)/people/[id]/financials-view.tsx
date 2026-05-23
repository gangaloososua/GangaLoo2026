import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDOP, formatDate } from '@/lib/format'
import type { PersonFinancials } from '@/lib/person-financials'

const SALE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  partially_paid: 'bg-amber-100 text-amber-900',
  refunded: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-rose-100 text-rose-800',
}
const SALE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className="mt-1 text-2xl font-semibold tabular-nums"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export function PersonFinancialsView({
  financials,
  role,
}: {
  financials: PersonFinancials
  role: string
}) {
  const c = financials.customer
  const s = financials.seller
  const showCustomer = role === 'customer' || c.sales_count > 0
  const showSeller = role === 'seller' || role === 'distributor' || s.count > 0

  if (!showCustomer && !showSeller) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          No sales, payments, or commissions recorded for this person yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {showCustomer && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">As customer</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Owes now"
              value={formatDOP(c.owed_cents)}
              sub={`${c.open_count} open ${c.open_count === 1 ? 'invoice' : 'invoices'}`}
              accent={c.owed_cents > 0 ? '#e11d48' : undefined}
            />
            <StatCard
              label="Lifetime purchases"
              value={formatDOP(c.lifetime_sales_cents)}
              sub={`${c.sales_count} ${c.sales_count === 1 ? 'sale' : 'sales'}`}
            />
            <StatCard
              label="Total paid"
              value={formatDOP(c.paid_cents)}
              sub="across all invoices"
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {c.sales.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No invoices.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.sales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono text-xs">
                          {sale.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(sale.sold_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={SALE_STATUS_STYLES[sale.status] ?? ''}
                          >
                            {SALE_STATUS_LABEL[sale.status] ?? sale.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDOP(sale.total_cents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatDOP(sale.paid_cents)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {sale.outstanding_cents > 0 ? (
                            <span className="text-rose-700">
                              {formatDOP(sale.outstanding_cents)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {c.payments.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No payments recorded.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground">
                          {formatDate(p.paid_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="capitalize">{p.method}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.reference ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDOP(p.amount_cents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showSeller && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">As seller</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Commissions earned"
              value={formatDOP(s.earned_cents)}
              sub={`${s.count} ${s.count === 1 ? 'commission' : 'commissions'}`}
            />
            <StatCard label="Paid out" value={formatDOP(s.paid_cents)} />
            <StatCard
              label="Still owed"
              value={formatDOP(s.owed_cents)}
              accent={s.owed_cents > 0 ? '#d97706' : undefined}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Commissions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {s.commissions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No commissions.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.commissions.map((cm) => (
                      <TableRow key={cm.id}>
                        <TableCell className="font-mono text-xs">
                          {cm.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(cm.sold_at)}
                        </TableCell>
                        <TableCell className="capitalize">{cm.earner_role}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {cm.percent}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatDOP(cm.amount_cents)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              cm.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }
                          >
                            {cm.status === 'paid' ? 'Paid' : 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
