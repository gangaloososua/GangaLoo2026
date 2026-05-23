// Round 26a — seller cash reconcile page (owner/admin only).

import { requireOwner } from '@/lib/auth/guard'
import { listMoneyAccounts } from '@/lib/sales'
import { listHeldSellerCash } from '@/lib/seller-cash'
import { ReconcileView } from './reconcile-view'

export const dynamic = 'force-dynamic'

export default async function SellerCashPage() {
  await requireOwner()

  const [groups, moneyAccounts] = await Promise.all([
    listHeldSellerCash(),
    listMoneyAccounts(),
  ])

  const sellerCount = groups.length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seller Cash</h1>
        <p className="text-sm text-muted-foreground">
          Cash sellers have collected in the field but not yet handed in.{' '}
          {sellerCount === 0
            ? 'Nothing held right now.'
            : `${sellerCount} ${sellerCount === 1 ? 'seller' : 'sellers'} holding cash.`}{' '}
          Handing in records the real payment on the order.
        </p>
      </div>
      <ReconcileView groups={groups} moneyAccounts={moneyAccounts} />
    </div>
  )
}
