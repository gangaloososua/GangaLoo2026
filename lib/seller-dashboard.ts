// Round 26b — seller dashboard data layer.
//
// One bundle for a logged-in seller's own view, assembled from existing,
// proven sources (no new DB objects):
//   - commissions earned / paid / owed  -> person_financials (round-25n)
//   - their orders (open + recent) and lifetime count -> person_financials
//     customer.sales (a seller IS the customer-side owner of orders they
//     created? no — we filter sales by seller below) ... see note.
//   - cash they're currently holding -> seller_cash_collections (round-26a)
//   - available stock summary -> fetchStockOnHand (lib/inventory)
//
// NOTE on "their orders": person_financials returns the SELLER block
// (commissions) and the CUSTOMER block (sales where they are the customer).
// A seller's *orders* are sales where seller_id = them, which is a different
// axis, so we query those directly here (read-only, RLS lets a seller read
// their own sales).
//
// All money in CENTS.

import { createClient } from '@/lib/supabase/server'
import { fetchPersonFinancials } from '@/lib/person-financials'
import { fetchStockOnHand } from '@/lib/inventory'

export type SellerOrderRow = {
  id: string
  invoice_number: string | null
  sold_at: string
  status: string
  total_cents: number
  paid_cents: number
  outstanding_cents: number
  customer_name: string | null
}

export type SellerStockCategoryRow = {
  category_id: string | null
  category_name: string
  units: number
}

export type SellerHeldCashRow = {
  id: string
  sale_id: string
  invoice_number: string | null
  amount_cents: number
  note: string | null
  collected_at: string
}

export type SellerDashboard = {
  commissions: {
    earned_cents: number
    paid_cents: number
    owed_cents: number
    count: number
  }
  orders: {
    lifetime_count: number
    open_outstanding_cents: number
    open: SellerOrderRow[]
    recent: SellerOrderRow[]
  }
  held_cash_cents: number
  held_cash: SellerHeldCashRow[]
  stock: {
    total_units: number
    by_category: SellerStockCategoryRow[]
  }
}

const OPEN_STATUSES = ['confirmed', 'partially_paid']
const RECENT_LIMIT = 10

export async function fetchSellerDashboard(
  profileId: string,
): Promise<SellerDashboard> {
  const supabase = await createClient()

  // Run the independent reads together.
  const [financials, ordersRes, heldRes, stock] = await Promise.all([
    fetchPersonFinancials(profileId),
    supabase
      .from('sales')
      .select(
        `id, invoice_number, sold_at, status, total_cents, paid_cents,
         customer:customer_id ( full_name )`,
      )
      .eq('seller_id', profileId)
      .order('sold_at', { ascending: false })
      .limit(200),
    supabase
      .from('seller_cash_collections')
      .select(`id, sale_id, amount_cents, note, collected_at, sale:sale_id ( invoice_number )`)
      .eq('seller_id', profileId)
      .eq('status', 'held')
      .order('collected_at', { ascending: false }),
    fetchStockOnHand(),
  ])

  if (ordersRes.error) throw new Error(`fetchSellerDashboard orders: ${ordersRes.error.message}`)
  if (heldRes.error) throw new Error(`fetchSellerDashboard held: ${heldRes.error.message}`)

  const allOrders: SellerOrderRow[] = ((ordersRes.data ?? []) as any[]).map((r) => {
    const total = Number(r.total_cents) || 0
    const paid = Number(r.paid_cents) || 0
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      sold_at: r.sold_at,
      status: r.status,
      total_cents: total,
      paid_cents: paid,
      outstanding_cents: Math.max(0, total - paid),
      customer_name: r.customer?.full_name ?? null,
    }
  })

  const open = allOrders.filter((o) => OPEN_STATUSES.includes(o.status) && o.outstanding_cents > 0)
  const recent = allOrders.slice(0, RECENT_LIMIT)
  const openOutstanding = open.reduce((s, o) => s + o.outstanding_cents, 0)

  const heldCashRows: SellerHeldCashRow[] = ((heldRes.data ?? []) as any[]).map((r) => ({
    id: r.id,
    sale_id: r.sale_id,
    invoice_number: r.sale?.invoice_number ?? null,
    amount_cents: Number(r.amount_cents) || 0,
    note: r.note ?? null,
    collected_at: r.collected_at,
  }))
  const heldCash = heldCashRows.reduce((s, r) => s + r.amount_cents, 0)

  // Roll the seller-facing stock view (already top-level-category tagged) into
  // a compact per-category unit summary across all warehouses.
  const byCat = new Map<string, SellerStockCategoryRow>()
  let totalUnits = 0
  for (const row of stock) {
    totalUnits += row.qtyOnHand
    const key = row.categoryId ?? '__uncat__'
    const existing = byCat.get(key)
    if (existing) {
      existing.units += row.qtyOnHand
    } else {
      byCat.set(key, {
        category_id: row.categoryId,
        category_name: row.categoryName,
        units: row.qtyOnHand,
      })
    }
  }
  const byCategory = Array.from(byCat.values()).sort((a, b) => b.units - a.units)

  return {
    commissions: {
      earned_cents: financials.seller.earned_cents,
      paid_cents: financials.seller.paid_cents,
      owed_cents: financials.seller.owed_cents,
      count: financials.seller.count,
    },
    orders: {
      lifetime_count: allOrders.length,
      open_outstanding_cents: openOutstanding,
      open,
      recent,
    },
    held_cash_cents: heldCash,
    held_cash: heldCashRows,
    stock: {
      total_units: totalUnits,
      by_category: byCategory,
    },
  }
}
