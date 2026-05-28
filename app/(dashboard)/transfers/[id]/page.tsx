import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import { localeForRole, plural, type Locale } from '@/lib/i18n/dictionary'
import { tt } from '@/lib/i18n/transfers-i18n'
import { getTransfer, listWarehousesForDistributor } from '@/lib/stock-transfers'
import { ReceiveTransferButton } from '../receive-transfer-button'

export const dynamic = 'force-dynamic'

function statusBadge(status: string, locale: Locale) {
  const label = tt(locale, `tr.status.${status}`)
  switch (status) {
    case 'requested':
      return <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100">{label}</Badge>
    case 'in_transit':
      return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{label}</Badge>
    case 'received':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{label}</Badge>
    case 'rejected':
      return <Badge variant="outline" className="border-rose-400 text-rose-700">{label}</Badge>
    case 'cancelled':
      return <Badge variant="outline" className="text-muted-foreground">{label}</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function fmtDop(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)
  const locale = localeForRole(caller.role)

  const t = await getTransfer(id)
  if (!t) notFound()

  // Distributor guard: must own one of the warehouses involved.
  let myWhIds = new Set<string>()
  if (!isOwnerEquivalent(caller.role)) {
    const mine = await listWarehousesForDistributor(caller.id)
    myWhIds = new Set(mine.map((w) => w.id))
    if (!myWhIds.has(t.from_warehouse_id) && !myWhIds.has(t.to_warehouse_id)) {
      notFound()
    }
  }

  const showCost = isOwnerEquivalent(caller.role)
  const canReceive =
    t.status === 'in_transit' &&
    (isOwnerEquivalent(caller.role) || myWhIds.has(t.to_warehouse_id))
  const totalQty = t.items.reduce((s, it) => s + it.qty, 0)
  const grandTotal = t.items.reduce(
    (s, it) => s + (it.unit_cost_dop ?? 0) * it.qty,
    0,
  )

  const L = {
    back: locale === 'es' ? 'Volver a Transferencias' : 'Back to Transfers',
    summary: locale === 'es' ? 'Resumen' : 'Summary',
    items: locale === 'es' ? 'Artículos' : 'Items',
    product: locale === 'es' ? 'Producto' : 'Product',
    sku: 'SKU',
    qty: locale === 'es' ? 'Cantidad' : 'Quantity',
    unitCost: locale === 'es' ? 'Costo unitario' : 'Unit cost',
    lineTotal: locale === 'es' ? 'Total línea' : 'Line total',
    total: 'Total',
    initiated: locale === 'es' ? 'Iniciado' : 'Initiated',
    received: tt(locale, 'tr.meta.received'),
    requested: tt(locale, 'tr.meta.requested'),
    notes: locale === 'es' ? 'Notas' : 'Notes',
    statusNote: locale === 'es' ? 'Nota de estado' : 'Status note',
    empty: locale === 'es' ? 'Sin artículos.' : 'No items.',
    units: (n: number) => `${n} ${plural(locale, n, 'unit.one', 'unit.other')}`,
    products: (n: number) => `${n} ${plural(locale, n, 'product.one', 'product.other')}`,
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/transfers">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {L.back}
        </Link>
      </Button>

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(t.status, locale)}
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {t.from_warehouse_name}
              <ArrowRight className="mx-2 inline h-5 w-5 text-muted-foreground" />
              {t.to_warehouse_name}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {L.products(t.item_count)} · {L.units(totalQty)}
          </p>
        </div>
        {canReceive && (
          <ReceiveTransferButton
            transferId={t.id}
            toWarehouseName={t.to_warehouse_name}
            locale={locale}
          />
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{L.summary}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {t.requested_at ? (
            <div>
              <span className="text-muted-foreground">{L.requested}: </span>
              {formatDateTime(t.requested_at)}
              {t.requested_by_name
                ? ` · ${tt(locale, 'tr.meta.by')} ${t.requested_by_name}`
                : ''}
            </div>
          ) : null}
          {t.initiated_at ? (
            <div>
              <span className="text-muted-foreground">{L.initiated}: </span>
              {formatDateTime(t.initiated_at)}
            </div>
          ) : null}
          {t.received_at ? (
            <div>
              <span className="text-muted-foreground">{L.received}: </span>
              {formatDateTime(t.received_at)}
            </div>
          ) : null}
          {t.notes ? (
            <div>
              <span className="text-muted-foreground">{L.notes}: </span>
              {t.notes}
            </div>
          ) : null}
          {t.status_note ? (
            <div>
              <span className="text-muted-foreground">{L.statusNote}: </span>
              {t.status_note}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{L.items}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {t.items.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">{L.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-6 py-2 font-medium">{L.product}</th>
                    <th className="px-3 py-2 font-medium">{L.sku}</th>
                    <th className="px-3 py-2 text-right font-medium">{L.qty}</th>
                    {showCost ? (
                      <>
                        <th className="px-3 py-2 text-right font-medium">{L.unitCost}</th>
                        <th className="px-6 py-2 text-right font-medium">{L.lineTotal}</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {t.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-6 py-2">{it.product_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {it.product_sku ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right">{it.qty}</td>
                      {showCost ? (
                        <>
                          <td className="px-3 py-2 text-right">
                            {it.unit_cost_dop == null ? '—' : fmtDop(it.unit_cost_dop)}
                          </td>
                          <td className="px-6 py-2 text-right">
                            {it.unit_cost_dop == null
                              ? '—'
                              : fmtDop(it.unit_cost_dop * it.qty)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                {showCost ? (
                  <tfoot className="border-t font-medium">
                    <tr>
                      <td className="px-6 py-2" colSpan={2}>
                        {L.total}
                      </td>
                      <td className="px-3 py-2 text-right">{totalQty}</td>
                      <td className="px-3 py-2" />
                      <td className="px-6 py-2 text-right">{fmtDop(grandTotal)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
