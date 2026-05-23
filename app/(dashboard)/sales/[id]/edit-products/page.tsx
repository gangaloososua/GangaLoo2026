import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { listDiscountRules } from '@/lib/discount-rules'
import { listCategoriesForSale } from '@/lib/sales'
import { getUnpaidSaleForEdit } from '@/lib/edit-unpaid-sale'
import { EditProductsView } from './edit-products-view'

export const dynamic = 'force-dynamic'

export default async function EditProductsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Gate: only a confirmed, UNPAID sale can be edited in place. If it isn't
  // (paid, refunded, cancelled, or not found), send the user back to the
  // sale detail - that page offers the right tool (e.g. refund + re-ring).
  const result = await getUnpaidSaleForEdit(id)
  if (!result.editable) {
    redirect(`/sales/${id}`)
  }
  const sale = result.sale

  const [activeDiscountRules, categories] = await Promise.all([
    listDiscountRules({ activeOnly: true }),
    listCategoriesForSale(),
  ])

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/sales/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to sale
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit products</h1>
        <p className="text-sm text-muted-foreground">
          {sale.invoice_number ? `${sale.invoice_number} — ` : ''}
          Change quantities, prices and products on this unpaid sale. No
          payment is taken.
        </p>
      </div>
      <EditProductsView sale={sale} activeDiscountRules={activeDiscountRules} categories={categories} />
    </div>
  )
}
