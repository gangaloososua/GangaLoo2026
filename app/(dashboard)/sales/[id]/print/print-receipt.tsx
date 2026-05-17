'use client'

import { useEffect } from 'react'
import { formatDOP, formatDate, formatDateTime } from '@/lib/format'
import type { SaleDetail } from '@/lib/sales'
import type { StoreInfo } from '@/lib/store-config'

type Props = {
  sale: SaleDetail
  store: StoreInfo
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  paypal: 'PayPal',
  stripe: 'Stripe',
  credit: 'Crédito',
  mixed: 'Mixto',
}

const FULFILLMENT_LABEL: Record<string, string> = {
  in_store: 'En tienda',
  pickup: 'Recoger',
  delivery: 'Envío',
}

export function PrintReceipt({ sale, store }: Props) {
  // Auto-trigger the browser print dialog on load. The setTimeout lets
  // the layout settle first; calling print() in useEffect with no delay
  // sometimes prints before fonts are ready.
  useEffect(() => {
    const t = setTimeout(() => {
      window.print()
    }, 250)
    return () => clearTimeout(t)
  }, [])

  const isRefunded = sale.status === 'refunded'
  const subtotalBeforeDiscount = sale.subtotal_cents
  const saleDiscount = sale.discount_cents
  const total = sale.total_cents

  return (
    <>
      {/* Print-only CSS. Hides everything but the receipt, removes margins,
          sets a tight body font. */}
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-receipt {
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            max-width: none !important;
          }
        }
        @page { margin: 10mm; }
      `}</style>

      <div className="no-print mb-4 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border px-3 py-1 hover:bg-muted/40"
        >
          Imprimir
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md border px-3 py-1 hover:bg-muted/40"
        >
          Cerrar
        </button>
        <span className="text-muted-foreground">
          Sugerencia: el navegador puede pedirte un destino al imprimir.
        </span>
      </div>

      <div className="print-receipt mx-auto max-w-md bg-white p-4 text-[13px] leading-snug text-black">
        {/* Header */}
        <div className="text-center">
          <div className="text-base font-semibold uppercase tracking-wide">
            {store.name}
          </div>
          {store.address && <div>{store.address}</div>}
          {store.phone && <div>Tel: {store.phone}</div>}
          {store.rnc && <div>RNC: {store.rnc}</div>}
        </div>

        <div className="my-2 border-t border-dashed border-black/60" />

        {/* Invoice meta */}
        <div className="text-center font-semibold">
          {sale.invoice_number ?? 'Factura'}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          <div className="text-black/60">Fecha</div>
          <div className="text-right">{formatDateTime(sale.sold_at)}</div>

          <div className="text-black/60">Cliente</div>
          <div className="text-right">{sale.customer_name ?? 'Walk-in'}</div>

          <div className="text-black/60">Vendedor</div>
          <div className="text-right">{sale.seller_name ?? '—'}</div>

          <div className="text-black/60">Almacén</div>
          <div className="text-right">{sale.fulfillment_warehouse_name}</div>

          <div className="text-black/60">Entrega</div>
          <div className="text-right">
            {FULFILLMENT_LABEL[sale.fulfillment_method] ?? sale.fulfillment_method}
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-black/60" />

        {/* Items */}
        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-black/60">
              <th className="pb-1 font-medium">Producto</th>
              <th className="pb-1 pr-1 text-right font-medium">Cant</th>
              <th className="pb-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-0.5 pr-2">
                  <div>{it.product_name}</div>
                  <div className="text-[11px] text-black/60">
                    {formatDOP(it.unit_price_cents)} c/u
                    {it.discount_cents > 0 && (
                      <> · desc. {formatDOP(it.discount_cents)}</>
                    )}
                    {it.product_sku && <> · {it.product_sku}</>}
                  </div>
                </td>
                <td className="py-0.5 pr-1 text-right tabular-nums">
                  {Number(it.qty).toLocaleString('en-GB')}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {formatDOP(it.line_total_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black/60" />

        {/* Totals */}
        <div className="space-y-0.5">
          <Row label="Subtotal" value={formatDOP(subtotalBeforeDiscount)} />
          {saleDiscount > 0 && (
            <Row label="Descuento" value={`−${formatDOP(saleDiscount)}`} />
          )}
          <Row label="TOTAL" value={formatDOP(total)} bold />
          <Row label="Pagado" value={formatDOP(sale.paid_cents)} />
          {sale.paid_cents < total && (
            <Row
              label="Pendiente"
              value={formatDOP(total - sale.paid_cents)}
            />
          )}
          {sale.paid_cents > total && (
            <Row label="Vuelto" value={formatDOP(sale.paid_cents - total)} />
          )}
        </div>

        {/* Payments */}
        {sale.payments.length > 0 && (
          <>
            <div className="my-2 border-t border-dashed border-black/60" />
            <div className="text-[12px] uppercase tracking-wide text-black/60">
              Pagos
            </div>
            <div className="mt-1 space-y-0.5">
              {sale.payments.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>
                    {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    {p.reference && (
                      <span className="text-black/60"> · {p.reference}</span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {formatDOP(p.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Refunded stamp */}
        {isRefunded && (
          <>
            <div className="my-3 border-t-2 border-rose-700" />
            <div className="text-center">
              <div className="text-base font-bold uppercase tracking-widest text-rose-700">
                Devuelto
              </div>
              {sale.refunded_at && (
                <div className="text-[12px] text-rose-700/80">
                  {formatDate(sale.refunded_at)}
                </div>
              )}
              {sale.refund_reason && (
                <div className="mt-1 text-[12px] text-rose-700/80">
                  {sale.refund_reason}
                </div>
              )}
            </div>
          </>
        )}

        <div className="my-2 border-t border-dashed border-black/60" />

        <div className="text-center text-[12px] text-black/60">
          ¡Gracias por tu compra!
        </div>
      </div>
    </>
  )
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div
      className={
        'flex justify-between ' + (bold ? 'text-base font-semibold' : '')
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
