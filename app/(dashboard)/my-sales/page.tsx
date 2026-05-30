import { requireAdminCaller } from '@/lib/auth/guard'
import { fetchMySellerFinancials } from '@/lib/my-seller-financials'
import { MySalesView } from './my-sales-view'

export const dynamic = 'force-dynamic'

export default async function MySalesPage() {
  // Any dashboard user may open this. The RPC self-scopes to the signed-in
  // person via auth.uid(), so owners/admins (who have no seller sales of their
  // own) simply get a "sellers only" note from the view — never another
  // seller's data. Real data shows when a seller/distributor is signed in.
  await requireAdminCaller()
  const data = await fetchMySellerFinancials()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My sales</h1>
        <p className="text-sm text-muted-foreground">
          Your invoices and the payments collected on them.
        </p>
      </div>

      <MySalesView data={data} />
    </div>
  )
}
