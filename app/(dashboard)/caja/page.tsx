// Round 37c — Caja (register) page (/caja). [v3: + seller picker for owner/admin]
//
// The register takes the whole viewport (fixed inset-0) so the dashboard
// sidebar + top bar are covered — a clean POS surface, especially on phones.
// A small "Salir / Exit" link returns to the sales list.
//
// 2026-06-24: owner/admin can now attribute a register sale to ANY staff member
// (seller). We load the staff list from `profiles` (via the SERVER client — the
// admin/service client cannot read `profiles`) and pass it down with a
// `canChooseSeller` flag (owner/admin only). A regular seller stays locked to
// themselves exactly as before. No DB change: confirm_pos_sale already trusts
// the seller_id the cart sends.
import Link from 'next/link'
import { X } from 'lucide-react'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import {
  listWarehousesForFilter,
  listMoneyAccounts,
  listCustomersForPicker,
} from '@/lib/sales'
import { listDiscountRules } from '@/lib/discount-rules'
import { listProductsForRegister } from '@/lib/pos-register'
import { localeForRole } from '@/lib/i18n/dictionary'
import { tc } from '@/lib/i18n/register-i18n'
import { Register } from './register'
export const dynamic = 'force-dynamic'
export default async function CajaPage() {
  const caller = await requireAdminCaller()
  const locale = localeForRole(caller.role)
  const [warehouses, moneyAccounts, activeDiscountRules] =
    await Promise.all([
      listWarehousesForFilter(),
      listMoneyAccounts(),
      listDiscountRules({ activeOnly: true }),
    ])
  const customers = await listCustomersForPicker().catch(() => [])

  // Staff who can be credited as the seller. Read via the server client (the
  // admin client has no profiles grant). Defensive: on any error -> empty list
  // (the picker only shows for owner/admin anyway).
  const canChooseSeller = isOwnerEquivalent(caller.role)
  let sellers: { id: string; full_name: string; role: string }[] = []
  try {
    const supabase = await createClient()
    const { data: sellerRows } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['owner', 'admin', 'seller', 'distributor'])
      .order('full_name', { ascending: true })
    sellers = (sellerRows ?? []).map((r) => ({
      id: r.id as string,
      full_name: (r.full_name as string | null) ?? '',
      role: r.role as string,
    }))
  } catch {
    sellers = []
  }

  const initialWarehouseId = warehouses[0]?.id ?? ''
  const initialProducts = initialWarehouseId
    ? await listProductsForRegister({ warehouseId: initialWarehouseId })
    : []
  const canTakePayment =
    caller.role === 'owner' || caller.role === 'admin'
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">{tc(locale, 'rg.title')}</h1>
        <Link
          href="/sales"
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          {locale === 'es' ? 'Salir' : 'Exit'}
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <Register
          warehouses={warehouses}
          initialWarehouseId={initialWarehouseId}
          initialProducts={initialProducts}
          moneyAccounts={moneyAccounts}
          activeDiscountRules={activeDiscountRules}
          customers={customers}
          sellerId={caller.id}
          sellers={sellers}
          canChooseSeller={canChooseSeller}
          canTakePayment={canTakePayment}
          locale={locale}
        />
      </div>
    </div>
  )
}
