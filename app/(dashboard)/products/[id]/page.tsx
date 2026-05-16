import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '../_form/product-form'

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: product, error } = await supabase
    .from('products')
    .select(
      'id, sku, name, slug, description, is_active, visible_in_store, price_cents, club_price_cents, commission_percent, target_payback_percent',
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !product) notFound()

  return (
    <ProductForm
      mode="edit"
      productId={product.id}
      initial={{
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        description: product.description ?? '',
        is_active: product.is_active,
        visible_in_store: product.visible_in_store,
        price_cents: product.price_cents,
        club_price_cents: product.club_price_cents,
        commission_percent: Number(product.commission_percent),
        target_payback_percent:
          product.target_payback_percent != null
            ? Number(product.target_payback_percent)
            : null,
      }}
      justCreated={sp.created === '1'}
    />
  )
}
