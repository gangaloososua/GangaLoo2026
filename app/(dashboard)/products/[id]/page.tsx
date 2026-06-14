import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProductForm } from '../_form/product-form'
import type { PurchaseCostSummary } from '../_form/calculator-tab'
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
  // Non-owners never see cost_calc - leave it out of the SELECT entirely.
  const selectFields = canSeeCosts
    ? 'id, sku, name, slug, description, video_url, is_active, visible_in_store, is_inventory, price_cents, club_price_cents, sale_price_cents, sale_discount_pct, commission_percent, target_payback_percent, cost_calc, supplier_url, base_cost_usd, us_enabled, us_markup_percent, us_price_override_usd'
    : 'id, sku, name, slug, description, video_url, is_active, visible_in_store, is_inventory, price_cents, club_price_cents, sale_price_cents, sale_discount_pct, commission_percent, target_payback_percent'
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
    sale_price_cents: number | null
    sale_discount_pct: number | string | null
    commission_percent: number | string
    target_payback_percent: number | string | null
    cost_calc?: unknown
    supplier_url?: string | null
    base_cost_usd?: number | string | null
    us_enabled?: boolean
    us_markup_percent?: number | string | null
    us_price_override_usd?: number | string | null
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
    purchaseCostSummary,
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
    // Owner-only: real weighted-average purchase cost. Read through the
    // service-role admin client because the SQL function is granted only to
    // service_role (never anon/authenticated), so costs can't leak to staff.
    canSeeCosts
      ? createAdminClient()
          .rpc('get_product_purchase_cost_summary', {
            p_product_id: productTyped.id,
          })
          .then(({ data }) => (data as PurchaseCostSummary | null) ?? null)
      : Promise.resolve(null),
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
        supplier_url: canSeeCosts ? (productTyped.supplier_url ?? '') : '',
        is_active: productTyped.is_active,
        visible_in_store: productTyped.visible_in_store,
        is_inventory: productTyped.is_inventory,
        price_cents: productTyped.price_cents,
        club_price_cents: productTyped.club_price_cents,
        sale_price_cents: productTyped.sale_price_cents ?? null,
        sale_discount_pct:
          productTyped.sale_discount_pct != null
            ? Number(productTyped.sale_discount_pct)
            : null,
        commission_percent: Number(productTyped.commission_percent),
        target_payback_percent:
          productTyped.target_payback_percent != null
            ? Number(productTyped.target_payback_percent)
            : null,
        base_cost_usd: (() => {
          // US price is based on the cost you TYPE on the Calculator tab,
          // i.e. cost_calc.base_cost_usd — NOT the products.base_cost_usd
          // column (which can hold a different, separately-sourced number).
          if (!canSeeCosts) return null
          const cc = productTyped.cost_calc as
            | { base_cost_usd?: number | string | null }
            | null
            | undefined
          const v = cc?.base_cost_usd
          return v != null && Number(v) > 0 ? Number(v) : null
        })(),
        us_enabled: productTyped.us_enabled ?? false,
        us_markup_percent:
          productTyped.us_markup_percent != null
            ? Number(productTyped.us_markup_percent)
            : 5,
        us_price_override_usd:
          productTyped.us_price_override_usd != null
            ? Number(productTyped.us_price_override_usd)
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
      purchaseCostSummary={purchaseCostSummary}
      movements={movements}
      allAttributes={allAttributes}
      productAttributeValueIds={productAttributeValueIds}
      justCreated={sp.created === '1'}
    />
  )
}
