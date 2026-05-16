'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { createProduct, type ProductFormState } from '../actions'
import { BasicsTab } from './basics-tab'

type Mode = 'create' | 'edit'

type InitialValues = {
  sku?: string
  name?: string
  slug?: string
  description?: string
  is_active?: boolean
  visible_in_store?: boolean
}

type Props = {
  mode: Mode
  productId?: string
  initial?: InitialValues
}

const INITIAL: ProductFormState = { ok: false }

export function ProductForm({ mode, initial = {} }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createProduct, INITIAL)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Products
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {mode === 'create' ? 'New product' : 'Edit product'}
          </h1>
        </div>
        <div className="flex gap-2">
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
          <TabsTrigger value="pricing" disabled>
            Pricing
          </TabsTrigger>
          <TabsTrigger value="categories" disabled>
            Categories
          </TabsTrigger>
          <TabsTrigger value="images" disabled>
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
      </Tabs>
    </form>
  )
}
