'use client'

// Reports - per-category inventory print sheet.
//
// Category dropdown (navigates via ?cat=<id>, server re-fetches), a printable
// stock-by-warehouse table with per-warehouse subtotals, and a Print / Save
// as PDF button. When printing, everything except #inv-print is hidden via a
// self-contained @media print rule, so the app chrome (sidebar etc.) doesn't
// appear on the sheet - no dependency on global print styles.

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import type {
  InvCatPickerItem,
  InventoryCategoryListing,
} from '@/lib/inventory-category-listing'

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #inv-print, #inv-print * { visibility: visible !important; }
  #inv-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  .no-print { display: none !important; }
}
`

function fmtQty(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function InventoryPrintView({
  categories,
  selectedId,
  listing,
}: {
  categories: InvCatPickerItem[]
  selectedId: string | null
  listing: InventoryCategoryListing | null
}) {
  const router = useRouter()

  function onPick(id: string) {
    router.push(`/reports/inventory/print?cat=${id}`)
  }

  const warehouses = listing?.warehouses ?? []
  const rows = listing?.rows ?? []

  // Per-warehouse subtotals + grand total.
  const whTotals: Record<string, number> = {}
  for (const w of warehouses) whTotals[w.id] = 0
  let grand = 0
  for (const r of rows) {
    for (const w of warehouses) {
      whTotals[w.id] += Number(r.by_wh?.[w.id] ?? 0)
    }
    grand += Number(r.total ?? 0)
  }

  const today = formatDate(new Date().toISOString())
  const canPrint = !!listing && rows.length > 0

  return (
    <div className="space-y-4">
      {/* Controls - hidden when printing */}
      <div className="no-print space-y-4">
        <div>
          <Link
            href="/reports/inventory"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Category
            </div>
            <Select value={selectedId ?? undefined} onValueChange={onPick}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Pick a category…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => window.print()} disabled={!canPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Printable sheet */}
      <div id="inv-print" className="rounded-md border bg-white p-6 text-black">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <div className="text-lg font-semibold">
              {listing?.category?.name ?? 'Inventory'}
            </div>
            <div className="text-xs text-gray-500">Stock by warehouse · {today}</div>
          </div>
          <div className="text-sm font-medium">GangaLoo</div>
        </div>

        {!canPrint ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {listing ? 'No products in this category.' : 'Pick a category to preview.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 pr-3 text-left font-medium">Product</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="px-3 py-2 text-right font-medium">
                    {w.name}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id} className="border-b border-gray-200">
                  <td className="py-1.5 pr-3">{r.name ?? '—'}</td>
                  {warehouses.map((w) => (
                    <td key={w.id} className="px-3 py-1.5 text-right tabular-nums">
                      {fmtQty(Number(r.by_wh?.[w.id] ?? 0))}
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-right font-medium tabular-nums">
                    {fmtQty(Number(r.total ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400 font-semibold">
                <td className="py-2 pr-3 text-left">Subtotal</td>
                {warehouses.map((w) => (
                  <td key={w.id} className="px-3 py-2 text-right tabular-nums">
                    {fmtQty(whTotals[w.id])}
                  </td>
                ))}
                <td className="py-2 pl-3 text-right tabular-nums">{fmtQty(grand)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
