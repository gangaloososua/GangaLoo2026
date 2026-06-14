'use server'

// app/(dashboard)/us-products/actions.ts
//
// Server actions for the US dropship shop's products. Phase 1.
// See US-DROPSHIP-PLAN.md.
//
// us_products is RLS-locked with no policies, so CRUD goes through the
// service-role admin client (createAdminClient), like the payroll_* tables.
// Every action is gated by requireOwner() first. USD money is stored as
// numeric dollars (not cents) on this table.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth/guard'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

// Turn a product name into a URL-safe slug base.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics -> dash
    .replace(/^-+|-+$/g, '') // trim dashes
    .slice(0, 60)
}

// Find a slug not already used in us_products. Adds -2, -3, ... on collision.
async function uniqueSlug(
  supabase: ReturnType<typeof createAdminClient>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = base || 'product'
  let candidate = root
  let n = 1
  // Loop until a free slug is found. In practice 1-2 tries.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from('us_products').select('id').eq('slug', candidate)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q.maybeSingle()
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows; anything else is a real error
      throw error
    }
    if (!data) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
}

// Shared field parsing/validation for create + update.
type ParsedFields = {
  name: string
  sku: string | null
  description: string | null
  supplierCostUsd: number
  supplierShippingUsd: number
  markupPercent: number
  priceOverrideUsd: number | null
  supplierUrl: string | null
  primaryImageUrl: string | null
  category: string | null
  isActive: boolean
  visibleInStore: boolean
}

export type UsProductInput = {
  name: string
  sku?: string | null
  description?: string | null
  supplierCostUsd: number
  supplierShippingUsd: number
  markupPercent: number
  priceOverrideUsd?: number | null
  supplierUrl?: string | null
  primaryImageUrl?: string | null
  category?: string | null
  isActive: boolean
  visibleInStore: boolean
}

function parseFields(
  input: UsProductInput,
): { ok: true; fields: ParsedFields } | { ok: false; error: string } {
  const name = (input.name || '').trim()
  if (!name) return { ok: false, error: 'A product name is required.' }

  const cost = Number(input.supplierCostUsd)
  if (!Number.isFinite(cost) || cost < 0)
    return { ok: false, error: 'Supplier cost must be zero or more.' }

  const shipping = Number(input.supplierShippingUsd)
  if (!Number.isFinite(shipping) || shipping < 0)
    return { ok: false, error: 'Supplier shipping must be zero or more.' }

  const markup = Number(input.markupPercent)
  if (!Number.isFinite(markup) || markup < 0)
    return { ok: false, error: 'Markup % must be zero or more.' }

  let override: number | null = null
  if (input.priceOverrideUsd != null && `${input.priceOverrideUsd}` !== '') {
    const o = Number(input.priceOverrideUsd)
    if (!Number.isFinite(o) || o <= 0)
      return { ok: false, error: 'Price override must be greater than zero (or leave it blank).' }
    override = o
  }

  return {
    ok: true,
    fields: {
      name,
      sku: (input.sku || '').trim() || null,
      description: (input.description || '').trim() || null,
      supplierCostUsd: cost,
      supplierShippingUsd: shipping,
      markupPercent: markup,
      priceOverrideUsd: override,
      supplierUrl: (input.supplierUrl || '').trim() || null,
      primaryImageUrl: (input.primaryImageUrl || '').trim() || null,
      category: (input.category || '').trim() || null,
      isActive: !!input.isActive,
      visibleInStore: !!input.visibleInStore,
    },
  }
}

export async function createUsProduct(
  input: UsProductInput,
): Promise<CreateResult> {
  await requireOwner()
  const parsed = parseFields(input)
  if (!parsed.ok) return parsed
  const f = parsed.fields

  const supabase = createAdminClient()
  const slug = await uniqueSlug(supabase, slugify(f.name))

  const { data, error } = await supabase
    .from('us_products')
    .insert({
      name: f.name,
      slug,
      sku: f.sku,
      description: f.description,
      supplier_cost_usd: f.supplierCostUsd,
      supplier_shipping_usd: f.supplierShippingUsd,
      markup_percent: f.markupPercent,
      price_override_usd: f.priceOverrideUsd,
      supplier_url: f.supplierUrl,
      primary_image_url: f.primaryImageUrl,
      category: f.category,
      is_active: f.isActive,
      visible_in_store: f.visibleInStore,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/us-products')
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateUsProduct(
  id: string,
  input: UsProductInput,
): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Missing product id.' }
  const parsed = parseFields(input)
  if (!parsed.ok) return parsed
  const f = parsed.fields

  const supabase = createAdminClient()
  // Keep the slug stable unless the name changed enough that the slug base
  // differs; regenerate only then, and keep it unique (excluding self).
  const slugBase = slugify(f.name)
  const slug = await uniqueSlug(supabase, slugBase, id)

  const { error } = await supabase
    .from('us_products')
    .update({
      name: f.name,
      slug,
      sku: f.sku,
      description: f.description,
      supplier_cost_usd: f.supplierCostUsd,
      supplier_shipping_usd: f.supplierShippingUsd,
      markup_percent: f.markupPercent,
      price_override_usd: f.priceOverrideUsd,
      supplier_url: f.supplierUrl,
      primary_image_url: f.primaryImageUrl,
      category: f.category,
      is_active: f.isActive,
      visible_in_store: f.visibleInStore,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/us-products')
  revalidatePath(`/us-products/${id}`)
  return { ok: true }
}

export async function deleteUsProduct(id: string): Promise<ActionResult> {
  await requireOwner()
  if (!id) return { ok: false, error: 'Missing product id.' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('us_products').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/us-products')
  return { ok: true }
}
