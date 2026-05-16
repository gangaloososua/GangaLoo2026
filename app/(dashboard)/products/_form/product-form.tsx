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
import { ImagesTab } from './images-tab'
import { DeleteDialog } from './delete-dialog'
import type { ProductCategory, ProductImage } from '@/lib/products'

type Mode = 'create' | 'edit'

type InitialValues = {
  sku?: string
  name?: string
  slug?: string
  description?: string
  is_active?: boolean
  visible_in_store?: boolean
  price_cents?: number
  club_price_cents?: number | null
  commission_percent?: number
  target_payback_percent?: number | null
}

type FlatCategory = { id: string; name: string; parent_id: string | null }

type Props = {
  mode: Mode
  productId?: string
  initial?: InitialValues
  productCategories?: ProductCategory[]
  allCategories?: FlatCategory[]
  productImages?: ProductImage[]
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
  justCreated,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const action = mode === 'create' ? createProduct : updateProduct
  const [state, formAction, pending] = useActionState(action, INITIAL)
  const createdToastShown = useRef(false)

  // One-time toast after redirect from create
  useEffect(() => {
    if (justCreated && !createdToastShown.current) {
      createdToastShown.current = true
      toast.success('Product created')
      router.replace(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justCreated])

  // Edit-mode save feedback
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
          <TabsTrigger value="images" disabled={mode === 'create'}>
            Images
          </TabsTrigger>
          <TabsTrigger value="warehouses" disabled>
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="calculator" disabled>
            Calculator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basics" forceMount className="pt-6">
          <BasicsTab
            initialSku={initial.sku}
            initialName={initial.name}
            initialSlug={initial.slug}
            initialDescription={initial.description}
            initialIsActive={initial.is_active ?? true}
            initialVisibleInStore={initial.visible_in_store ?? true}
          />
        </TabsContent>

        <TabsContent value="pricing" forceMount className="pt-6">
          <PricingTab
            initialPriceCents={initial.price_cents}
            initialClubPriceCents={initial.club_price_cents}
            initialCommissionPercent={initial.commission_percent}
            initialTargetPaybackPercent={initial.target_payback_percent}
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
          <TabsContent value="images" forceMount className="pt-6">
            <ImagesTab productId={productId} initialRows={productImages} />
          </TabsContent>
        )}
      </Tabs>
    </form>
  )
}
