'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner, requireAdminCaller } from '@/lib/auth/guard'

// An attribute type (e.g. "Color", "Length") plus a count of its values.
export type Attribute = {
  id: string
  name: string
  slug: string
  display_order: number
  is_active: boolean
  single_value_only: boolean
  created_at: string
  value_count: number
}

// A single value belonging to an attribute (e.g. "Black" under "Color").
export type AttributeValue = {
  id: string
  attribute_id: string
  value: string
  slug: string
  display_order: number
  is_active: boolean
  created_at: string
  product_count: number
}

// Reused verbatim from categories/actions.ts so slugs are generated the same
// way everywhere (slug columns are NOT NULL).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Postgres unique-violation -> friendly message for the non-technical owner.
function friendlyError(message: string, kind: 'attribute' | 'value'): string {
  if (/duplicate key|23505|unique/i.test(message)) {
    return kind === 'attribute'
      ? 'An attribute with that name already exists.'
      : 'That value already exists for this attribute.'
  }
  return message
}

// ---------------------------------------------------------------------------
// READS (admin-caller gated, like listCategories)
// ---------------------------------------------------------------------------

export async function listAttributes(): Promise<Attribute[]> {
  await requireAdminCaller()
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('attributes')
    .select('id, name, slug, display_order, is_active, single_value_only, created_at')
    .order('display_order')
    .order('name')

  if (error) throw new Error(error.message)
  if (!rows) return []

  // Count values per attribute (mirrors the product_count pattern).
  const { data: valRows, error: valErr } = await supabase
    .from('attribute_values')
    .select('attribute_id')

  if (valErr) throw new Error(valErr.message)

  const counts = new Map<string, number>()
  for (const r of valRows ?? []) {
    counts.set(r.attribute_id, (counts.get(r.attribute_id) ?? 0) + 1)
  }

  return rows.map((r) => ({
    ...r,
    value_count: counts.get(r.id) ?? 0,
  }))
}

export async function listAttributeValues(): Promise<AttributeValue[]> {
  await requireAdminCaller()
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('attribute_values')
    .select('id, attribute_id, value, slug, display_order, is_active, created_at')
    .order('display_order')
    .order('value')

  if (error) throw new Error(error.message)
  if (!rows) return []

  // How many products carry each value (powers the delete guard + a count badge).
  const { data: pavRows, error: pavErr } = await supabase
    .from('product_attribute_values')
    .select('attribute_value_id')

  if (pavErr) throw new Error(pavErr.message)

  const counts = new Map<string, number>()
  for (const r of pavRows ?? []) {
    counts.set(r.attribute_value_id, (counts.get(r.attribute_value_id) ?? 0) + 1)
  }

  return rows.map((r) => ({
    ...r,
    product_count: counts.get(r.id) ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// ATTRIBUTE WRITES (owner gated)
// ---------------------------------------------------------------------------

export async function createAttribute(formData: FormData) {
  await requireOwner()
  const name = (formData.get('name') as string)?.trim()
  const singleValueOnly = formData.get('single_value_only') === 'on'

  if (!name) return { error: 'Name is required.' }

  const supabase = await createClient()

  // Drop new attribute at the bottom; order is then managed by drag-and-drop.
  let nextOrder = 0
  {
    const { data: top, error: topErr } = await supabase
      .from('attributes')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
    if (topErr) return { error: topErr.message }
    if (top && top.length) nextOrder = Number(top[0].display_order ?? 0) + 1
  }

  const { error } = await supabase.from('attributes').insert({
    name,
    slug: slugify(name) || 'attribute',
    single_value_only: singleValueOnly,
    display_order: nextOrder,
  })

  if (error) return { error: friendlyError(error.message, 'attribute') }

  revalidatePath('/attributes')
  return { success: true }
}

export async function updateAttribute(id: string, formData: FormData) {
  await requireOwner()
  const name = (formData.get('name') as string)?.trim()
  const singleValueOnly = formData.get('single_value_only') === 'on'

  if (!name) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('attributes')
    .update({
      name,
      slug: slugify(name) || 'attribute',
      single_value_only: singleValueOnly,
      updated_at: new Date().toISOString(),
      // display_order managed by drag-and-drop, not changed here.
    })
    .eq('id', id)

  if (error) return { error: friendlyError(error.message, 'attribute') }

  revalidatePath('/attributes')
  return { success: true }
}

export async function reorderAttributes(
  updates: Array<{ id: string; display_order: number }>,
) {
  await requireOwner()
  if (!updates.length) return { success: true }

  const supabase = await createClient()
  for (const u of updates) {
    const { error } = await supabase
      .from('attributes')
      .update({
        display_order: u.display_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
    if (error) return { error: error.message }
  }

  revalidatePath('/attributes')
  return { success: true }
}

export async function deleteAttribute(id: string) {
  await requireOwner()
  const supabase = await createClient()

  // Guard: refuse if the attribute still has values (cascade is only a backstop).
  const { count: valueCount, error: valErr } = await supabase
    .from('attribute_values')
    .select('id', { count: 'exact', head: true })
    .eq('attribute_id', id)

  if (valErr) return { error: valErr.message }
  if ((valueCount ?? 0) > 0) {
    return {
      error: 'This attribute still has values. Delete its values first.',
    }
  }

  const { error } = await supabase.from('attributes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/attributes')
  return { success: true }
}

// ---------------------------------------------------------------------------
// ATTRIBUTE-VALUE WRITES (owner gated)
// Note: a value's attribute_id is fixed at creation - values are NOT
// re-parented (unlike category parents). "Black" belonging to "Color" is fixed.
// ---------------------------------------------------------------------------

export async function createAttributeValue(formData: FormData) {
  await requireOwner()
  const value = (formData.get('value') as string)?.trim()
  const attributeId = (formData.get('attribute_id') as string) || null

  if (!attributeId) return { error: 'Missing attribute.' }
  if (!value) return { error: 'Value is required.' }

  const supabase = await createClient()

  // Drop at bottom of this attribute's value list.
  let nextOrder = 0
  {
    const { data: top, error: topErr } = await supabase
      .from('attribute_values')
      .select('display_order')
      .eq('attribute_id', attributeId)
      .order('display_order', { ascending: false })
      .limit(1)
    if (topErr) return { error: topErr.message }
    if (top && top.length) nextOrder = Number(top[0].display_order ?? 0) + 1
  }

  const { error } = await supabase.from('attribute_values').insert({
    attribute_id: attributeId,
    value,
    slug: slugify(value) || 'value',
    display_order: nextOrder,
  })

  if (error) return { error: friendlyError(error.message, 'value') }

  revalidatePath('/attributes')
  return { success: true }
}

export async function updateAttributeValue(id: string, formData: FormData) {
  await requireOwner()
  const value = (formData.get('value') as string)?.trim()

  if (!value) return { error: 'Value is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('attribute_values')
    .update({
      value,
      slug: slugify(value) || 'value',
      updated_at: new Date().toISOString(),
      // attribute_id intentionally NOT updated - values don't move attributes.
      // display_order managed by drag-and-drop.
    })
    .eq('id', id)

  if (error) return { error: friendlyError(error.message, 'value') }

  revalidatePath('/attributes')
  return { success: true }
}

export async function reorderAttributeValues(
  updates: Array<{ id: string; display_order: number }>,
) {
  await requireOwner()
  if (!updates.length) return { success: true }

  const supabase = await createClient()
  for (const u of updates) {
    const { error } = await supabase
      .from('attribute_values')
      .update({
        display_order: u.display_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
    if (error) return { error: error.message }
  }

  revalidatePath('/attributes')
  return { success: true }
}

export async function deleteAttributeValue(id: string) {
  await requireOwner()
  const supabase = await createClient()

  // Guard: refuse if this value is assigned to any product.
  const { count: productCount, error: prodErr } = await supabase
    .from('product_attribute_values')
    .select('product_id', { count: 'exact', head: true })
    .eq('attribute_value_id', id)

  if (prodErr) return { error: prodErr.message }
  if ((productCount ?? 0) > 0) {
    return {
      error: `This value is assigned to ${productCount} product(s). Remove it from those products first.`,
    }
  }

  const { error } = await supabase.from('attribute_values').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/attributes')
  return { success: true }
}
