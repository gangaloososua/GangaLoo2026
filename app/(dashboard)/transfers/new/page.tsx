import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { listActiveWarehouses } from '@/lib/stock-transfers'
import { listCategoriesForSale } from '@/lib/sales'
import { NewTransferForm } from './new-transfer-form'

export const dynamic = 'force-dynamic'

export default async function NewTransferPage() {
  await requireOwner()
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
