'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdminCaller, requireOwner } from '@/lib/auth/guard'

// Shapes consumed by the product Attributes tab.
export type AttributeValueOption = { id: string; value: string }
export type ProductAttributeOption = {
  id: string
  name: string
  single_value_only: boolean
  values: AttributeValueOption[]
}

// All ACTIVE attributes with their ACTIVE values, ordered for display.
// Used to build the tab's controls (one per attribute). Read-only.
export async function listActiveAttributesWithValues(): Promise<
  ProductAttributeOption[]
> {
  await requireAdminCaller()
  const supabase = await createClient()

  const { data: attrs, error: aErr } = await supabase
    .from('attributes')
    .select('id, name, single_value_only')
    .eq('is_active', true)
    .order('display_order')
    .order('name')
  if (aErr) throw new Error(aErr.message)
  if (!attrs || attrs.length === 0) return []

  const { data: vals, error: vErr } = await supabase
    .from('attribute_values')
    .select('id, attribute_id, value')
    .eq('is_active', true)
    .order('display_order')
    .order('value')
  if (vErr) throw new Error(vErr.message)

  const byAttr = new Map<string, AttributeValueOption[]>()
  for (const v of vals ?? []) {
    if (!byAttr.has(v.attribute_id)) byAttr.set(v.attribute_id, [])
    byAttr.get(v.attribute_id)!.push({ id: v.id, value: v.value })
  }

  return attrs.map((a) => ({
    id: a.id,
    name: a.name,
    single_value_only: a.single_value_only,
    values: byAttr.get(a.id) ?? [],
  }))
}

// The attribute_value_ids currently assigned to one product. Read-only.
export async function getProductAttributeValueIds(
  productId: string,
): Promise<string[]> {
  await requireAdminCaller()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('product_attribute_values')
    .select('attribute_value_id')
    .eq('product_id', productId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.attribute_value_id)
}

// Replace a product's attribute assignments with the given set of value ids.
// Mirrors saveProductCategories: owner-gated, delete-all-then-insert, returns { ok }.
export async function saveProductAttributes(
  productId: string,
  valueIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  await requireOwner()
  const supabase = await createClient()

  // De-dupe defensively.
  const ids = Array.from(new Set(valueIds))

  // Server-side single-value enforcement: never trust the client. Look up the
  // attribute each chosen value belongs to, and reject if any single-value-only
  // attribute has more than one chosen value.
  if (ids.length > 0) {
    const { data: valRows, error: vErr } = await supabase
      .from('attribute_values')
      .select('id, attribute_id')
      .in('id', ids)
    if (vErr) return { ok: false, error: vErr.message }

    const attrIds = Array.from(new Set((valRows ?? []).map((v) => v.attribute_id)))
    const { data: attrRows, error: aErr } = await supabase
      .from('attributes')
      .select('id, name, single_value_only')
      .in('id', attrIds)
    if (aErr) return { ok: false, error: aErr.message }

    const singleOnly = new Map(
      (attrRows ?? []).map((a) => [a.id, { name: a.name, single: a.single_value_only }]),
    )
    const countByAttr = new Map<string, number>()
    for (const v of valRows ?? []) {
      countByAttr.set(v.attribute_id, (countByAttr.get(v.attribute_id) ?? 0) + 1)
    }
    for (const [attrId, count] of countByAttr) {
      const meta = singleOnly.get(attrId)
      if (meta?.single && count > 1) {
        return {
          ok: false,
          error: `“${meta.name}” allows only one value per product.`,
        }
      }
    }
  }

  // Replace strategy (same as saveProductCategories): delete all, then insert.
  const { error: delErr } = await supabase
    .from('product_attribute_values')
    .delete()
    .eq('product_id', productId)
  if (delErr) return { ok: false, error: delErr.message }

  if (ids.length === 0) {
    revalidatePath(`/products/${productId}`)
    revalidatePath('/products')
    return { ok: true }
  }

  const payload = ids.map((attribute_value_id) => ({
    product_id: productId,
    attribute_value_id,
  }))
  const { error: insErr } = await supabase
    .from('product_attribute_values')
    .insert(payload)
  if (insErr) return { ok: false, error: insErr.message }

  revalidatePath(`/products/${productId}`)
  revalidatePath('/products')
  return { ok: true }
}
