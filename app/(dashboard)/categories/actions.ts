'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type Category = {
  id: string
  parent_id: string | null
  name: string
  slug: string
  display_order: number
  is_active: boolean
  created_at: string
  parent_name: string | null
  product_count: number
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('categories')
    .select('id, parent_id, name, slug, display_order, is_active, created_at')
    .order('display_order')
    .order('name')

  if (error) throw new Error(error.message)
  if (!rows) return []

  const nameById = new Map(rows.map((r) => [r.id, r.name]))

  const { data: pcRows, error: pcErr } = await supabase
    .from('product_categories')
    .select('category_id')

  if (pcErr) throw new Error(pcErr.message)

  const counts = new Map<string, number>()
  for (const row of pcRows ?? []) {
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
  }

  return rows.map((r) => ({
    ...r,
    parent_name: r.parent_id ? nameById.get(r.parent_id) ?? null : null,
    product_count: counts.get(r.id) ?? 0,
  }))
}

export async function createCategory(formData: FormData) {
  await requireOwner()
  const name = (formData.get('name') as string)?.trim()
  const parentId = (formData.get('parent_id') as string) || null
  const displayOrder = Number(formData.get('display_order') ?? 0)

  if (!name) {
    return { error: 'Name is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('categories').insert({
    name,
    slug: slugify(name) || 'category',
    parent_id: parentId === '__root__' ? null : parentId,
    display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
  })

  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { success: true }
}

export async function updateCategory(id: string, formData: FormData) {
  await requireOwner()
  const name = (formData.get('name') as string)?.trim()
  const parentId = (formData.get('parent_id') as string) || null
  const displayOrder = Number(formData.get('display_order') ?? 0)

  if (!name) {
    return { error: 'Name is required.' }
  }

  if (parentId && parentId !== '__root__' && parentId === id) {
    return { error: 'A category cannot be its own parent.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({
      name,
      slug: slugify(name) || 'category',
      parent_id: parentId === '__root__' ? null : parentId,
      display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { success: true }
}

export async function deleteCategory(id: string) {
  await requireOwner()
  const supabase = await createClient()

  const { count: childCount, error: childErr } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)

  if (childErr) return { error: childErr.message }
  if ((childCount ?? 0) > 0) {
    return { error: 'This category has subcategories. Remove or reassign them first.' }
  }

  const { count: productCount, error: prodErr } = await supabase
    .from('product_categories')
    .select('product_id', { count: 'exact', head: true })
    .eq('category_id', id)

  if (prodErr) return { error: prodErr.message }
  if ((productCount ?? 0) > 0) {
    return { error: `This category has ${productCount} product(s) assigned. Remove the products first.` }
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/categories')
  return { success: true }
}