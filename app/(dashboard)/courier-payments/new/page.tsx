import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { listCouriersForPicker } from '@/lib/purchases'
import { listMoneyAccounts } from '@/lib/sales'
import { listPurchaseOrdersForPicker } from '@/lib/courier-payments'
 import { listAccountCategories } from '@/lib/transactions'
import { NewCourierPaymentForm } from './new-courier-payment-form'

export const dynamic = 'force-dynamic'

type SearchParams = {
  prefill_po?: string
}

export default async function NewCourierPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireOwner()
  const sp = await searchParams
  const prefillPoId = sp.prefill_po?.trim() || null
  const [couriers, moneyAccounts, purchaseOrders, categories] = await Promise.all([
    listCouriersForPicker(),
    listMoneyAccounts(),
    listPurchaseOrdersForPicker(),
    listAccountCategories(),
  ])
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/courier-payments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to courier payments
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New courier payment
        </h1>
        <p className="text-sm text-muted-foreground">
          Record a transport invoice and allocate it across one or more
          purchase orders.
        </p>
      </div>
      <NewCourierPaymentForm
        couriers={couriers}
        moneyAccounts={moneyAccounts}
        purchaseOrders={purchaseOrders}
        prefillPurchaseOrderId={prefillPoId}
        categories={expenseCategories}
      />
    </div>
  )
}
