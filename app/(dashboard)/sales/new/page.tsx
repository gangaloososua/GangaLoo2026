import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  listCustomersForPicker,
  listSellers,
  getCurrentSeller,
  listWarehousesForFilter,
  listMoneyAccounts,
  listCategoriesForSale,
} from '@/lib/sales'
import { listDiscountRules } from '@/lib/discount-rules'
import { NewSaleForm } from './new-sale-form'
import { localeForRole, t } from '@/lib/i18n/dictionary'
import { requireAdminCaller } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export default async function NewSalePage() {
  const [
    customers,
    sellers,
    currentSeller,
    warehouses,
    moneyAccounts,
    activeDiscountRules,
    categories,
  ] = await Promise.all([
    listCustomersForPicker(),
    listSellers(),
    getCurrentSeller(),
    listWarehousesForFilter(),
    listMoneyAccounts(),
    listDiscountRules({ activeOnly: true }),
    listCategoriesForSale(),
  ])

  // Language is chosen from the signed-in caller's role (auth_user_id-based,
  // reliable). Kept separate from getCurrentSeller so sale behaviour is untouched.
  const caller = await requireAdminCaller()
  const locale = localeForRole(caller.role)

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t(locale, 'ns.backToSales')}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'sales.newPosSale')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'ns.pageSubtitle')}
        </p>
      </div>
      <NewSaleForm
        customers={customers}
        sellers={sellers}
        defaultSellerId={currentSeller?.id ?? null}
        warehouses={warehouses}
        moneyAccounts={moneyAccounts}
        activeDiscountRules={activeDiscountRules}
        categories={categories}
        canTakePayment={currentSeller?.role === 'owner' || currentSeller?.role === 'admin'}
        locale={locale}
      />
    </div>
  )
}
