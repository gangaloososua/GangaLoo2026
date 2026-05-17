import { notFound } from 'next/navigation'
import { getSale } from '@/lib/sales'
import { fetchStoreInfo } from '@/lib/store-config'
import { PrintReceipt } from './print-receipt'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export default async function PrintReceiptPage({ params }: { params: Params }) {
  const { id } = await params
  const [sale, store] = await Promise.all([
    getSale(id),
    fetchStoreInfo(),
  ])

  if (!sale) notFound()

  return <PrintReceipt sale={sale} store={store} />
}
