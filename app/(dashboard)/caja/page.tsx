// Round 37c — Caja (register) page (/caja). [v2: full-screen, no sidebar]
//
// The register takes the whole viewport (fixed inset-0) so the dashboard
// sidebar + top bar are covered — a clean POS surface, especially on phones.
// A small "Salir / Exit" link returns to the sales list. Data loading is
// unchanged from v1; only the wrapper is full-screen now.
import Link from 'next/link'
import { X } from 'lucide-react'
import { requireAdminCaller } from '@/lib/auth/guard'
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
          canTakePayment={canTakePayment}
          locale={locale}
        />
      </div>
    </div>
  )
}
