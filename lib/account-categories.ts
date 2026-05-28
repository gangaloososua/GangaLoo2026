// Accounting categories data layer (UI side).
//
// Read-only fetchers for the /accounting/categories admin screen.
// Mutations live in app/(dashboard)/accounting/categories/actions.ts.
//
// account_categories is a 2-level tree: top-level rows have parent_id null,
// children point at a top-level row of the SAME type. Supplier sub-accounts
// are auto-created with supplier_id set; we still let the user re-scope them.

import { createClient } from '@/lib/supabase/server'

export type AccountType = 'income' | 'expense' | 'asset' | 'liability' | 'equity'
export type AccountScope = 'business' | 'private' | 'mixed'

export type AccountCategoryRow = {
  id: string
  name: string
  type: AccountType
  scope: AccountScope
  parent_id: string | null
  parent_name: string | null
  supplier_id: string | null
  is_system: boolean
  is_active: boolean
  display_order: number
}

export type ParentOption = {
  id: string
  name: string
}

export async function listAccountCategories(): Promise<AccountCategoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_categories')
    .select(
      `
      id, name, type, scope, parent_id, supplier_id,
      is_system, is_active, display_order,
      parent:parent_id ( id, name )
    `,
    )
    .order('type')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name')
  if (error) throw new Error(`listAccountCategories: ${error.message}`)
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    scope: row.scope,
    parent_id: row.parent_id,
    parent_name: row.parent?.name ?? null,
    supplier_id: row.supplier_id,
    is_system: !!row.is_system,
    is_active: !!row.is_active,
    display_order: Number(row.display_order) || 0,
  }))
}

// Top-level (no parent) ACTIVE categories of a given type, for the
// parent picker in the edit dialog. The dialog filters out the
// category being edited client-side so a row can't self-parent.
export async function listParentOptions(
  type: AccountType,
): Promise<ParentOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_categories')
    .select('id, name')
    .eq('type', type)
    .is('parent_id', null)
    .eq('is_active', true)
    .order('name')
  if (error) throw new Error(`listParentOptions: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
  }))
}

export async function getAccountCategory(
  id: string,
): Promise<AccountCategoryRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('account_categories')
    .select(
      `
      id, name, type, scope, parent_id, supplier_id,
      is_system, is_active, display_order,
      parent:parent_id ( id, name )
    `,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getAccountCategory: ${error.message}`)
  if (!data) return null
  const row = data as any
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    scope: row.scope,
    parent_id: row.parent_id,
    parent_name: row.parent?.name ?? null,
    supplier_id: row.supplier_id,
    is_system: !!row.is_system,
    is_active: !!row.is_active,
    display_order: Number(row.display_order) || 0,
  }
}