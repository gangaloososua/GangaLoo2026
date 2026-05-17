import { notFound } from 'next/navigation'
import { getSale } from '@/lib/sales'
import { fetchStoreInfo } from '@/lib/store-config'
import { PrintReceipt } from './print-receipt'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export default async function PrintReceiptPage({ params }: { params: Params }) {
  const caller = await requireAdminCaller()
  const canSeeAllSales = isOwnerEquivalent(caller.role)

  const { id } = await params
  const [sale, store] = await Promise.all([
    getSale(id),
    fetchStoreInfo(),
  ])
  if (!sale) notFound()

  if (!canSeeAllSales && sale.seller_id !== caller.id) {
    notFound()
  }

  return <PrintReceipt sale={sale} store={store} />
}
