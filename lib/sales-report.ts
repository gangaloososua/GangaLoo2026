// Reports - Sales analysis data layer.
//
// Period math mirrors lib/pnl.ts (This month / Last month / This year / Custom).
// Thin wrapper around the read-only sales_report(p_start, p_end) RPC. All money
// values are in CENTS.
//
// Notes:
//  - Seller/customer/trend totals come from sales.total_cents (the true money).
//  - Product/category totals come from sale_items.line_total_cents, which is
//    slightly less than revenue (shipping/tax/order-discount aren't on a product
//    line). line_items_total_cents is returned so the UI can show that gap.
//  - Margin is PRELIMINARY: cogs_cents is missing on most legacy sales, so it's
//    based only on `costed_sales` of `total_sales`. The UI flags this.

import { createClient } from '@/lib/supabase/server'

export type SalesPeriodMode = 'this-month' | 'last-month' | 'this-year'

export type SalesPeriods = {
  start: string
  end: string
  label: string
}

// --- period math -----------------------------------------------------------

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function computeSalesPeriods(
  mode: SalesPeriodMode,
  now: Date = new Date(),
): SalesPeriods {
  const y = now.getFullYear()
  const m = now.getMonth()

  if (mode === 'this-year') {
    return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y) }
  }
  if (mode === 'last-month') {
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    return { start: ymd(start), end: ymd(end), label: monthLabel(start) }
  }
  // this-month
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 1)
  return { start: ymd(start), end: ymd(end), label: monthLabel(start) }
}

/** Custom range: inclusive [startYmd, endYmd] -> half-open [start, end+1day). */
export function customSalesPeriods(startYmd: string, endYmd: string): SalesPeriods {
  const parse = (s: string) => {
    const [yy, mm, dd] = s.split('-').map(Number)
    return new Date(yy, (mm ?? 1) - 1, dd ?? 1)
  }
  const endInclusive = parse(endYmd)
  const end = new Date(
    endInclusive.getFullYear(),
    endInclusive.getMonth(),
    endInclusive.getDate() + 1,
  )
  return { start: startYmd, end: ymd(end), label: `${startYmd} \u2192 ${endYmd}` }
}

// --- bundle shape (mirrors the jsonb the RPC returns) ----------------------

export type SalesTrendRow = { bucket: string; revenue_cents: number; count: number }
export type SalesNamedRow = { name: string; revenue_cents: number; count: number }
export type SalesProductRow = {
  name: string
  sku: string | null
  units: number
  revenue_cents: number
}
export type SalesCategoryRow = { name: string; units: number; revenue_cents: number }

export type SalesReport = {
  revenue_cents: number
  sales_count: number
  avg_sale_cents: number
  costed_revenue_cents: number
  cogs_cents: number
  margin_cents: number
  costed_sales: number
  total_sales: number
  trend: SalesTrendRow[]
  by_seller: SalesNamedRow[]
  by_customer: SalesNamedRow[]
  by_product: SalesProductRow[]
  by_category: SalesCategoryRow[]
  line_items_total_cents: number
}

export async function fetchSalesReport(periods: SalesPeriods): Promise<SalesReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sales_report', {
    p_start: periods.start,
    p_end: periods.end,
  })
  if (error) throw new Error(error.message)
  return data as SalesReport
}
