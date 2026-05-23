import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSale, listMoneyAccounts } from '@/lib/sales'
import { SaleDetail } from './sale-detail'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const caller = await requireAdminCaller()
  const canSeeAllSales = isOwnerEquivalent(caller.role)

  const { id } = await params
  const [sale, moneyAccounts] = await Promise.all([
    getSale(id),
    listMoneyAccounts(),
  ])

  if (!sale) notFound()

  // Non-owners can only view their own sales. Treat someone else's sale
  // as not-found (don't leak its existence).
  if (!canSeeAllSales && sale.seller_id !== caller.id) {
    notFound()
  }

  // Round 9 is POS-only. Online sales redirect back to list until
  // the Online Orders module is built.
  if (sale.source !== 'pos') {
    redirect('/sales')
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/sales"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to sales
        </Link>
      </div>
      <SaleDetail sale={sale} moneyAccounts={moneyAccounts} role={caller.role} />
    </div>
  )
}
