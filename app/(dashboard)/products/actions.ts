'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import {
  computeFinalPrice,
  parseCostCalcState,
  type CostCalcState,
} from './_form/calc-utils'

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
  await requireOwner()
  const supabase = await createClient()

  const sku = String(formData.get('sku') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  let slug = String(formData.get('slug') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const visibleInStore = formData.get('visible_in_store') === 'on'
  // Round 39: track-inventory flag. Defaults true if unchecked AND no other
  // signal, but the form always sends 'on' when checked, so missing == false.
  const isInventory = formData.get('is_inventory') === 'on'
  const videoUrl = String(formData.get('video_url') ?? '').trim()
  const supplierUrl = String(formData.get('supplier_url') ?? '').trim()
  const saleMode = String(formData.get('sale_mode') ?? 'none')
  const salePctRaw = String(formData.get('sale_pct') ?? '').trim()
  const salePriceDopRaw = String(formData.get('sale_price_dop') ?? '').trim()

  const priceDopRaw = String(formData.get('price_dop') ?? '').trim()
  const priceDop = priceDopRaw ? parseFloat(priceDopRaw) : 0
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

  // Optional calculator state (create-mode).
  let costCalcState: CostCalcState | null = null
  let calcPriceCents: number | null = null
  const costCalcRaw = String(formData.get('cost_calc_json') ?? '').trim()
  if (costCalcRaw) {
    try {
      const parsed = parseCostCalcState(JSON.parse(costCalcRaw))
      if (parsed) {
        costCalcState = parsed
        const c = computeFinalPrice(parsed)
        if (c.priceRounded != null && c.priceRounded > 0) {
          calcPriceCents = Math.round(c.priceRounded * 100)
        }
      }
    } catch {
      // Malformed JSON: ignore the calc submission silently.
    }
  }

  const manualPriceCents = Math.round(priceDop * 100)
  const priceCents = calcPriceCents ?? manualPriceCents

  // Direct discount: percent or exact sale price -> final sale price in cents.
  let salePriceCents: number | null = null
  let saleDiscountPct: number | null = null
  if (saleMode === 'pct') {
    const pct = salePctRaw ? parseFloat(salePctRaw) : NaN
    if (!Number.isNaN(pct) && pct > 0 && pct < 100) {
      saleDiscountPct = pct
      salePriceCents = Math.round(priceCents * (1 - pct / 100))
    }
  } else if (saleMode === 'price') {
    const sp = salePriceDopRaw ? parseFloat(salePriceDopRaw) : NaN
    if (!Number.isNaN(sp) && sp > 0) {
      salePriceCents = Math.round(sp * 100)
    }
  }
  if (salePriceCents != null && salePriceCents >= priceCents) {
    salePriceCents = null
    saleDiscountPct = null
  }

  const clubPriceCents =
    clubPriceDop != null && !Number.isNaN(clubPriceDop)
      ? Math.round(clubPriceDop * 100)
      : null

  if (!slug) slug = slugify(name)
  if (!slug) slug = slugify(sku) || `product-${Date.now()}`

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

  const insertPayload: Record<string, unknown> = {
    sku,
    name,
    slug,
    description: description || null,
    video_url: videoUrl || null,
    supplier_url: supplierUrl || null,
    is_active: isActive,
    visible_in_store: visibleInStore,
    is_inventory: isInventory,
    price_cents: priceCents,
    club_price_cents: clubPriceCents,
    commission_percent: commissionPercent,
    target_payback_percent: targetPaybackPercent,
  }
  if (costCalcState) insertPayload.cost_calc = costCalcState

  const { data, error } = await supabase
    .from('products')
    .insert(insertPayload)
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
  await requireOwner()
  const supabase = await createClient()

  const productId = String(formData.get('product_id') ?? '').trim()
  if (!productId) return { ok: false, error: 'Missing product ID.' }

  const sku = String(formData.get('sku') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  let slug = String(formData.get('slug') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'
  const visibleInStore = formData.get('visible_in_store') === 'on'
  const isInventory = formData.get('is_inventory') === 'on'
  const videoUrl = String(formData.get('video_url') ?? '').trim()
  const supplierUrl = String(formData.get('supplier_url') ?? '').trim()
  const saleMode = String(formData.get('sale_mode') ?? 'none')
  const salePctRaw = String(formData.get('sale_pct') ?? '').trim()
  const salePriceDopRaw = String(formData.get('sale_price_dop') ?? '').trim()

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

  // Direct discount: percent or exact sale price -> final sale price in cents.
  let salePriceCents: number | null = null
  let saleDiscountPct: number | null = null
  if (saleMode === 'pct') {
    const pct = salePctRaw ? parseFloat(salePctRaw) : NaN
    if (!Number.isNaN(pct) && pct > 0 && pct < 100) {
      saleDiscountPct = pct
      salePriceCents = Math.round(priceCents * (1 - pct / 100))
    }
  } else if (saleMode === 'price') {
    const sp = salePriceDopRaw ? parseFloat(salePriceDopRaw) : NaN
    if (!Number.isNaN(sp) && sp > 0) {
      salePriceCents = Math.round(sp * 100)
    }
  }
  if (salePriceCents != null && salePriceCents >= priceCents) {
    salePriceCents = null
    saleDiscountPct = null
  }
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
      video_url: videoUrl || null,
      supplier_url: supplierUrl || null,
      is_active: isActive,
      visible_in_store: visibleInStore,
      is_inventory: isInventory,
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
  await requireOwner()
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
  await requireOwner()
  const supabase = await createClient()

  const primaryCount = rows.filter((r) => r.is_primary).length
  if (rows.length > 0 && primaryCount !== 1) {
    return { ok: false, error: 'Exactly one category must be marked as primary.' }
  }

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

const BUCKET = 'product-images'

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export async function uploadProductImage(
  formData: FormData
): Promise<{ ok: boolean; error?: string; image?: { id: string; url: string } }> {
  await requireOwner()
  const supabase = await createClient()
  const productId = String(formData.get('product_id') ?? '')
  const file = formData.get('file') as File | null
  if (!productId || !file) return { ok: false, error: 'Missing product or file.' }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'File exceeds 5 MB limit.' }
  }

  const ext = extOf(file.name) || '.jpg'
  const path = `products/${productId}/${crypto.randomUUID()}${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const { data: existing, error: countErr } = await supabase
    .from('product_images')
    .select('id, display_order')
    .eq('product_id', productId)
    .order('display_order', { ascending: false })
    .limit(1)
  if (countErr) return { ok: false, error: countErr.message }
  const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 0
  const isPrimary = !existing || existing.length === 0

  const { data: inserted, error: insErr } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      url: publicUrl,
      alt_text: null,
      display_order: nextOrder,
      is_primary: isPrimary,
    })
    .select('id, url')
    .single()
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, error: insErr.message }
  }

  if (isPrimary) {
    await supabase.from('products').update({ primary_image_url: publicUrl }).eq('id', productId)
  }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true, image: inserted }
}

export async function saveProductImagesMetadata(
  productId: string,
  rows: Array<{
    id: string
    alt_text: string | null
    is_primary: boolean
    display_order: number
  }>
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  const supabase = await createClient()

  if (rows.length > 0) {
    const primaryCount = rows.filter((r) => r.is_primary).length
    if (primaryCount !== 1) {
      return { ok: false, error: 'Exactly one image must be marked as primary.' }
    }
  }

  for (const r of rows) {
    const { error } = await supabase
      .from('product_images')
      .update({
        alt_text: r.alt_text,
        is_primary: r.is_primary,
        display_order: r.display_order,
      })
      .eq('id', r.id)
      .eq('product_id', productId)
    if (error) return { ok: false, error: error.message }
  }

  const primary = rows.find((r) => r.is_primary)
  if (primary) {
    const { data: primaryRow, error: fetchErr } = await supabase
      .from('product_images')
      .select('url')
      .eq('id', primary.id)
      .maybeSingle()
    if (fetchErr) return { ok: false, error: fetchErr.message }
    if (primaryRow) {
      const { error: updErr } = await supabase
        .from('products')
        .update({ primary_image_url: primaryRow.url })
        .eq('id', productId)
      if (updErr) return { ok: false, error: updErr.message }
    }
  } else if (rows.length === 0) {
    await supabase.from('products').update({ primary_image_url: null }).eq('id', productId)
  }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

export async function deleteProductImage(
  productId: string,
  imageId: string
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  const supabase = await createClient()

  const { data: img, error: fetchErr } = await supabase
    .from('product_images')
    .select('id, url, is_primary')
    .eq('id', imageId)
    .eq('product_id', productId)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!img) return { ok: false, error: 'Image not found.' }

  const { error: delErr } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId)
    .eq('product_id', productId)
  if (delErr) return { ok: false, error: delErr.message }

  const path = storagePathFromPublicUrl(img.url)
  if (path) {
    await supabase.storage.from(BUCKET).remove([path])
  }

  if (img.is_primary) {
    const { data: next, error: nextErr } = await supabase
      .from('product_images')
      .select('id, url')
      .eq('product_id', productId)
      .order('display_order', { ascending: true })
      .limit(1)
    if (nextErr) return { ok: false, error: nextErr.message }
    if (next && next.length > 0) {
      await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', next[0].id)
      await supabase
        .from('products')
        .update({ primary_image_url: next[0].url })
        .eq('id', productId)
    } else {
      await supabase
        .from('products')
        .update({ primary_image_url: null })
        .eq('id', productId)
    }
  }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}

export async function saveProductWarehouseSettings(
  productId: string,
  rows: Array<{
    warehouse_id: string
    is_visible: boolean
    price_override_cents: number | null
    display_order: number
  }>
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  const supabase = await createClient()

  for (const r of rows) {
    if (r.price_override_cents !== null && r.price_override_cents < 0) {
      return { ok: false, error: 'Price override cannot be negative.' }
    }
  }

  const { error: delError } = await supabase
    .from('product_warehouse_settings')
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
    warehouse_id: r.warehouse_id,
    is_visible: r.is_visible,
    price_override_cents: r.price_override_cents,
    display_order: r.display_order,
  }))

  const { error: insError } = await supabase
    .from('product_warehouse_settings')
    .insert(payload)
  if (insError) return { ok: false, error: insError.message }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}

export async function saveProductCostCalc(
  productId: string,
  state: Record<string, number | null>
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ cost_calc: state })
    .eq('id', productId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/products/${productId}`)
  return { ok: true }
}

export async function applyCalculatorPrice(
  productId: string,
  priceCents: number
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return { ok: false, error: 'Invalid price.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ price_cents: Math.round(priceCents) })
    .eq('id', productId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}
