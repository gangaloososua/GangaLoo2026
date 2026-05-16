'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ProductFormState = {
  ok: boolean
  error?: string
  productId?: string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const supabase = await createClient()

  const sku = String(formData.get('sku') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  let slug = String(formData.get('slug') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const visibleInStore = formData.get('visible_in_store') === 'on'

  if (!sku) return { ok: false, error: 'SKU is required.' }
  if (!name) return { ok: false, error: 'Name is required.' }

  if (!slug) slug = slugify(name)
  if (!slug) slug = slugify(sku) || `product-${Date.now()}`

  // Enforce slug uniqueness; append suffix if needed
  let candidate = slug
  for (let i = 1; i <= 30; i++) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!existing) break
    candidate = `${slug}-${i + 1}`
  }
  slug = candidate

  const { data, error } = await supabase
    .from('products')
    .insert({
      sku,
      name,
      slug,
      description: description || null,
      is_active: isActive,
      visible_in_store: visibleInStore,
      price_cents: 0,
      commission_percent: 0,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A product with that SKU already exists.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/products')
  redirect(`/products/${data.id}?created=1`)
}
