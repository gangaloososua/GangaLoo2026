import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSale } from '@/lib/sales'
import { SaleDetail } from './sale-detail'

export const dynamic = 'force-dynamic'

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sale = await getSale(id)

  if (!sale) notFound()

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

      <SaleDetail sale={sale} />
    </div>
  )
}
