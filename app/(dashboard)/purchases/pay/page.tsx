import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import {
  listPendingPurchaseOrders,
  listDopMoneyAccounts,
  listExpenseCategoryOptions,
} from '@/lib/pay-suppliers'
import { PaySuppliersView } from './pay-suppliers-view'

export const dynamic = 'force-dynamic'

export default async function PaySuppliersPage() {
  await requireRole(['owner', 'admin'] as const)

  const [pendingPOs, accounts, expenseCategories] = await Promise.all([
    listPendingPurchaseOrders(),
    listDopMoneyAccounts(),
    listExpenseCategoryOptions(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/purchases"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to purchases
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagar a proveedores</h1>
        <p className="text-sm text-muted-foreground">
          Record a bank withdrawal split across multiple pending purchase orders. One
          ledger entry per supplier, all linked to the same receipt.
        </p>
      </div>
      <PaySuppliersView
        pendingPOs={pendingPOs}
        accounts={accounts}
        expenseCategories={expenseCategories}
      />
    </div>
  )
}
