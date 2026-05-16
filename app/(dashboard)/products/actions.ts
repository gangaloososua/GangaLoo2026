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

  const priceDop =
    parseFloat(String(formData.get('price_dop') ?? '0')) || 0
  const clubPriceDopRaw = String(
    formData.get('club_price_dop') ?? '',
  ).trim()
  const clubPriceDop = clubPriceDopRaw ? parseFloat(clubPriceDopRaw) : null
  const commissionPercent =
    parseFloat(String(formData.get('commission_percent') ?? '0')) || 0
  const paybackRaw = String(
    formData.get('target_payback_percent') ?? '',
  ).trim()
  const targetPaybackPercent = paybackRaw ? parseFloat(paybackRaw) : null

  if (!sku) return { ok: false, error: 'SKU is required.' }
  if (!name) return { ok: false, error: 'Name is required.' }
  if (priceDop < 0)
    return { ok: false, error: 'Price cannot be negative.' }

  const priceCents = Math.round(priceDop * 100)
  const clubPriceCents =
    clubPriceDop != null && !Number.isNaN(clubPriceDop)
      ? Math.round(clubPriceDop * 100)
      : null

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
      price_cents: priceCents,
      club_price_cents: clubPriceCents,
      commission_percent: commissionPercent,
      target_payback_percent: targetPaybackPercent,
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

export async function updateProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const supabase = await createClient()

  const productId = String(formData.get('product_id') ?? '').trim()
  if (!productId) return { ok: false, error: 'Missing product ID.' }

  const sku = String(formData.get('sku') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  let slug = String(formData.get('slug') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const visibleInStore = formData.get('visible_in_store') === 'on'

  const priceDop =
    parseFloat(String(formData.get('price_dop') ?? '0')) || 0
  const clubPriceDopRaw = String(
    formData.get('club_price_dop') ?? '',
  ).trim()
  const clubPriceDop = clubPriceDopRaw ? parseFloat(clubPriceDopRaw) : null
  const commissionPercent =
    parseFloat(String(formData.get('commission_percent') ?? '0')) || 0
  const paybackRaw = String(
    formData.get('target_payback_percent') ?? '',
  ).trim()
  const targetPaybackPercent = paybackRaw ? parseFloat(paybackRaw) : null

  if (!sku) return { ok: false, error: 'SKU is required.' }
  if (!name) return { ok: false, error: 'Name is required.' }
  if (priceDop < 0) return { ok: false, error: 'Price cannot be negative.' }

  if (!slug) slug = slugify(name)
  if (!slug) slug = slugify(sku) || `product-${Date.now()}`

  // Slug uniqueness, EXCLUDING this product's own row
  let candidate = slug
  for (let i = 1; i <= 30; i++) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('slug', candidate)
      .neq('id', productId)
      .maybeSingle()
    if (!existing) break
    candidate = `${slug}-${i + 1}`
  }
  slug = candidate

  const priceCents = Math.round(priceDop * 100)
  const clubPriceCents =
    clubPriceDop != null && !Number.isNaN(clubPriceDop)
      ? Math.round(clubPriceDop * 100)
      : null

  const { error } = await supabase
    .from('products')
    .update({
      sku,
      name,
      slug,
      description: description || null,
      is_active: isActive,
      visible_in_store: visibleInStore,
      price_cents: priceCents,
      club_price_cents: clubPriceCents,
      commission_percent: commissionPercent,
      target_payback_percent: targetPaybackPercent,
    })
    .eq('id', productId)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A product with that SKU already exists.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/products')
  revalidatePath(`/products/${productId}`)
  return { ok: true, productId }
}

export async function deleteProduct(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!productId) return { ok: false, error: 'Missing product ID.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        error:
          'Cannot delete: this product is referenced by sales, inventory, or purchases. Mark it inactive instead.',
      }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/products')
  return { ok: true }
}

export async function saveProductCategories(
  productId: string,
  rows: Array<{
    category_id: string
    is_visible: boolean
    is_primary: boolean
    display_order: number
  }>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  // Validate: at most one primary, and if any rows exist, exactly one must be primary
  const primaryCount = rows.filter((r) => r.is_primary).length
  if (rows.length > 0 && primaryCount !== 1) {
    return { ok: false, error: 'Exactly one category must be marked as primary.' }
  }

  // Replace strategy: delete all existing rows for this product, then insert the new set.
  // Simple and safe given the small row count per product.
  const { error: delError } = await supabase
    .from('product_categories')
    .delete()
    .eq('product_id', productId)
  if (delError) return { ok: false, error: delError.message }

  if (rows.length === 0) {
    revalidatePath(`/products/${productId}`)
    revalidatePath('/products')
    return { ok: true }
  }

  const payload = rows.map((r) => ({
    product_id: productId,
    category_id: r.category_id,
    is_visible: r.is_visible,
    is_primary: r.is_primary,
    display_order: r.display_order,
  }))

  const { error: insError } = await supabase.from('product_categories').insert(payload)
  if (insError) return { ok: false, error: insError.message }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}
