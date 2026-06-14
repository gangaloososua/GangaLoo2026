'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  createProduct,
  updateProduct,
  type ProductFormState,
} from '../actions'
import { BasicsTab } from './basics-tab'
import { PricingTab } from './pricing-tab'
import { CategoriesTab } from './categories-tab'
import { AttributesTab } from './attributes-tab'
import { ImagesTab } from './images-tab'
import { WarehousesTab } from './warehouses-tab'
import {
  CalculatorTab,
  type CostCalcState,
  type PurchaseCostSummary,
} from './calculator-tab'
import { MovementsTab } from './movements-tab'
import { DeleteDialog } from './delete-dialog'
import type {
  ProductCategory,
  ProductImage,
  Warehouse,
  ProductWarehouseSetting
} from '@/lib/products'
import type { ExchangeRate } from '@/lib/exchange-rates-types'
import type { StockMovementRow } from '@/lib/inventory'
import type { ProductAttributeOption } from './attributes-tab-actions'

type Mode = 'create' | 'edit'

type InitialValues = {
  sku?: string
  name?: string
  slug?: string
  description?: string
  video_url?: string
  supplier_url?: string
  is_active?: boolean
  visible_in_store?: boolean
  is_inventory?: boolean
  price_cents?: number
  club_price_cents?: number | null
  sale_price_cents?: number | null
  sale_discount_pct?: number | null
  commission_percent?: number
  target_payback_percent?: number | null
  // US shop (owner-only)
  base_cost_usd?: number | null
  us_enabled?: boolean
  us_markup_percent?: number | null
  us_price_override_usd?: number | null
}

type FlatCategory = { id: string; name: string; parent_id: string | null }

type Props = {
  mode: Mode
  productId?: string
  initial?: InitialValues
  productCategories?: ProductCategory[]
  allCategories?: FlatCategory[]
  productImages?: ProductImage[]
  allWarehouses?: Warehouse[]
  productWarehouseSettings?: ProductWarehouseSetting[]
  stockByWarehouse?: Record<string, number>
  costCalc?: CostCalcState | null
  canSeeCosts?: boolean
  currentRate?: ExchangeRate | null
  purchaseCostSummary?: PurchaseCostSummary | null
  movements?: StockMovementRow[]
  allAttributes?: ProductAttributeOption[]
  productAttributeValueIds?: string[]
  justCreated?: boolean
}

const INITIAL: ProductFormState = { ok: false }

export function ProductForm({
  mode,
  productId,
  initial = {},
  productCategories = [],
  allCategories = [],
  productImages = [],
  allWarehouses = [],
  productWarehouseSettings = [],
  stockByWarehouse = {},
  costCalc = null,
  canSeeCosts = false,
  currentRate = null,
  purchaseCostSummary = null,
  movements = [],
  allAttributes = [],
  productAttributeValueIds = [],
  justCreated,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const action = mode === 'create' ? createProduct : updateProduct
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const createdToastShown = useRef(false)

  useEffect(() => {
    if (justCreated && !createdToastShown.current) {
      createdToastShown.current = true
      toast.success('Product created')
      router.replace(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreated])

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.ok && mode === 'edit') {
      toast.success('Saved')
      router.refresh()
    }
  }, [state, mode, router])

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'edit' && productId && (
        <input type="hidden" name="product_id" value={productId} />
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Products
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? 'New product' : initial.name || 'Edit product'}
          </h1>
        </div>
        <div className="flex gap-2">
          {mode === 'edit' && productId && (
            <DeleteDialog
              productId={productId}
              productName={initial.name ?? 'this product'}
            />
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/products')}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="basics">
        <TabsList>
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="categories" disabled={mode === 'create'}>
            Categories
          </TabsTrigger>
          <TabsTrigger value="attributes" disabled={mode === 'create'}>
            Attributes
          </TabsTrigger>
          <TabsTrigger value="images" disabled={mode === 'create'}>
            Images
          </TabsTrigger>
          <TabsTrigger value="warehouses" disabled={mode === 'create'}>
            Warehouses
          </TabsTrigger>
          {canSeeCosts && (
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
          )}
          {canSeeCosts && (
            <TabsTrigger value="movements" disabled={mode === 'create'}>
              Movements
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="basics" forceMount className="pt-6">
          <BasicsTab
            initialSku={initial.sku}
            initialName={initial.name}
            initialSlug={initial.slug}
            initialDescription={initial.description}
            initialVideoUrl={initial.video_url}
            initialSupplierUrl={initial.supplier_url}
            canSeeCosts={canSeeCosts}
            initialIsActive={initial.is_active ?? true}
            initialVisibleInStore={initial.visible_in_store ?? true}
            initialIsInventory={initial.is_inventory ?? true}
          />
        </TabsContent>

        <TabsContent value="pricing" forceMount className="pt-6">
          <PricingTab
            initialPriceCents={initial.price_cents}
            initialClubPriceCents={initial.club_price_cents}
            initialSalePriceCents={initial.sale_price_cents}
            initialSaleDiscountPct={initial.sale_discount_pct}
            initialCommissionPercent={initial.commission_percent}
            initialTargetPaybackPercent={initial.target_payback_percent}
            canSeeCosts={canSeeCosts}
            initialBaseCostUsd={initial.base_cost_usd}
            initialUsEnabled={initial.us_enabled ?? false}
            initialUsMarkupPercent={initial.us_markup_percent}
            initialUsPriceOverrideUsd={initial.us_price_override_usd}
          />
        </TabsContent>

        {mode === 'edit' && productId && (
          <TabsContent value="categories" forceMount className="pt-6">
            <CategoriesTab
              productId={productId}
              initialRows={productCategories}
              allCategories={allCategories}
            />
          </TabsContent>
        )}

        {mode === 'edit' && productId && (
          <TabsContent value="attributes" forceMount className="pt-6">
            <AttributesTab
              productId={productId}
              attributes={allAttributes}
              initialValueIds={productAttributeValueIds}
            />
          </TabsContent>
        )}

        {mode === 'edit' && productId && (
          <TabsContent value="images" forceMount className="pt-6">
            <ImagesTab productId={productId} initialRows={productImages} />
          </TabsContent>
        )}

        {mode === 'edit' && productId && (
          <TabsContent value="warehouses" forceMount className="pt-6">
            <WarehousesTab
              productId={productId}
              warehouses={allWarehouses}
              initialSettings={productWarehouseSettings}
              stockByWarehouse={stockByWarehouse}
            />
          </TabsContent>
        )}

        {canSeeCosts && (
          <TabsContent value="calculator" forceMount className="pt-6">
            <CalculatorTab
              mode={mode}
              productId={productId}
              initialState={costCalc}
              productCommissionPercent={initial.commission_percent ?? 0}
              productTargetPaybackPercent={initial.target_payback_percent ?? null}
              currentRate={currentRate}
              purchaseCostSummary={purchaseCostSummary}
            />
          </TabsContent>
        )}

        {mode === 'edit' && productId && canSeeCosts && (
          <TabsContent value="movements" forceMount className="pt-6">
            <MovementsTab rows={movements} productName={initial.name} />
          </TabsContent>
        )}
      </Tabs>
    </form>
  )
}
