import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
import { localeForRole } from '@/lib/i18n/dictionary'
import { tt } from '@/lib/i18n/transfers-i18n'
import {
  listActiveWarehouses,
  listWarehousesForDistributor,
} from '@/lib/stock-transfers'
import { listCategoriesForSale } from '@/lib/sales'
import { NewTransferForm } from './new-transfer-form'
import { RequestTransferForm } from './request-transfer-form'

export const dynamic = 'force-dynamic'

export default async function NewTransferPage() {
  // Owner/admin (ship now) and distributors (request) reach this page.
  // Sellers/customers get a 404 via requireRole.
  const caller = await requireRole(['owner', 'admin', 'distributor'] as const)

  // Owner / admin: the existing ship-now form, unchanged (English).
  if (isOwnerEquivalent(caller.role)) {
    const [warehouses, categories] = await Promise.all([
      listActiveWarehouses(),
      listCategoriesForSale(),
    ])
    return (
      <div className="space-y-4">
        <div>
          <Link
            href="/transfers"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to transfers
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New stock transfer</h1>
          <p className="text-sm text-muted-foreground">
            Move stock from one warehouse to another. It leaves the source now and
            waits in transit until it&apos;s received at the destination.
          </p>
        </div>
        <NewTransferForm warehouses={warehouses} categories={categories} />
      </div>
    )
  }

  // Distributor: request form (Spanish) with their own warehouse locked in.
  const locale = localeForRole(caller.role)
  const [mine, allWarehouses, categories] = await Promise.all([
    listWarehousesForDistributor(caller.id),
    listActiveWarehouses(),
    listCategoriesForSale(),
  ])
  const myWarehouse = mine[0] ?? null
  const otherWarehouses = allWarehouses.filter((w) => w.id !== myWarehouse?.id)

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/transfers"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {tt(locale, 'tr.req.back')}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tt(locale, 'tr.req.title')}</h1>
        <p className="text-sm text-muted-foreground">{tt(locale, 'tr.req.blurb')}</p>
      </div>
      {myWarehouse ? (
        <RequestTransferForm
          myWarehouse={myWarehouse}
          otherWarehouses={otherWarehouses}
          categories={categories}
          locale={locale}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{tt(locale, 'tr.list.noWh')}</p>
      )}
    </div>
  )
}
