import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '../_form/product-form'
import {
  fetchProductCategories,
  fetchAllCategoriesFlat,
  fetchProductImages,
  fetchAllWarehouses,
  fetchProductWarehouseSettings,
  fetchProductStockByWarehouse
} from '@/lib/products'
import { fetchCurrentExchangeRate } from '@/lib/exchange-rates'
import { fetchStockMovements } from '@/lib/inventory'
import {
  listActiveAttributesWithValues,
  getProductAttributeValueIds,
} from '../_form/attributes-tab-actions'
import { requireAdminCaller } from '@/lib/auth/guard'
import { isOwnerEquivalent } from '@/lib/auth/roles'
export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const caller = await requireAdminCaller()
  const canSeeCosts = isOwnerEquivalent(caller.role)
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  // Non-owners never see cost_calc — leave it out of the SELECT entirely.
  const selectFields = canSeeCosts
    ? 'id, sku, name, slug, description, video_url, is_active, visible_in_store, is_inventory, price_cents, club_price_cents, commission_percent, target_payback_percent, cost_calc'
    : 'id, sku, name, slug, description, video_url, is_active, visible_in_store, is_inventory, price_cents, club_price_cents, commission_percent, target_payback_percent'
  const { data: product, error } = await supabase
    .from('products')
    .select(selectFields)
    .eq('id', id)
    .maybeSingle()
  if (error || !product) notFound()
  const productTyped = product as unknown as {
    id: string
    sku: string
    name: string
    slug: string
    description: string | null
    video_url: string | null
    is_active: boolean
    visible_in_store: boolean
    is_inventory: boolean
    price_cents: number
    club_price_cents: number | null
    commission_percent: number | string
    target_payback_percent: number | string | null
    cost_calc?: unknown
  }
  const [
    productCategories,
    allCategories,
    productImages,
    allWarehouses,
    productWarehouseSettings,
    stockByWarehouse,
    currentRate,
    movements,
    allAttributes,
    productAttributeValueIds,
  ] = await Promise.all([
    fetchProductCategories(productTyped.id),
    fetchAllCategoriesFlat(),
    fetchProductImages(productTyped.id),
    fetchAllWarehouses(),
    fetchProductWarehouseSettings(productTyped.id),
    fetchProductStockByWarehouse(productTyped.id),
    canSeeCosts ? fetchCurrentExchangeRate('USD') : Promise.resolve(null),
    canSeeCosts
      ? fetchStockMovements({ productId: productTyped.id })
      : Promise.resolve([]),
    listActiveAttributesWithValues(),
    getProductAttributeValueIds(productTyped.id),
  ])
  return (
    <ProductForm
      mode="edit"
      productId={productTyped.id}
      canSeeCosts={canSeeCosts}
      initial={{
        sku: productTyped.sku,
        name: productTyped.name,
        slug: productTyped.slug,
        description: productTyped.description ?? '',
        video_url: productTyped.video_url ?? '',
        is_active: productTyped.is_active,
        visible_in_store: productTyped.visible_in_store,
        is_inventory: productTyped.is_inventory,
        price_cents: productTyped.price_cents,
        club_price_cents: productTyped.club_price_cents,
        commission_percent: Number(productTyped.commission_percent),
        target_payback_percent:
          productTyped.target_payback_percent != null
            ? Number(productTyped.target_payback_percent)
            : null,
      }}
      productCategories={productCategories}
      allCategories={allCategories}
      productImages={productImages}
      allWarehouses={allWarehouses}
      productWarehouseSettings={productWarehouseSettings}
      stockByWarehouse={stockByWarehouse}
      costCalc={canSeeCosts ? (productTyped.cost_calc as never) ?? null : null}
      currentRate={currentRate}
      movements={movements}
      allAttributes={allAttributes}
      productAttributeValueIds={productAttributeValueIds}
      justCreated={sp.created === '1'}
    />
  )
}
