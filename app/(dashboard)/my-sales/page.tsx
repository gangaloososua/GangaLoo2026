import { requireRole } from '@/lib/auth/guard'
import { fetchMySellerFinancials } from '@/lib/my-seller-financials'
import { MySalesView } from './my-sales-view'

export const dynamic = 'force-dynamic'

export default async function MySalesPage() {
  // Sellers and distributors only; everyone else gets a 404 (no surface leak).
  await requireRole(['seller', 'distributor'])
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
