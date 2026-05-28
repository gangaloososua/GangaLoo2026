'use server'

// Round 38 — accounting-categories admin actions.
// Owner/admin only. The type is locked once created (transactions are
// linked by category, so changing type would orphan reports). Scope,
// name, parent, and active are all editable on every row — including
// system rows — because the user explicitly chose "full control".

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import type { AccountScope, AccountType } from '@/lib/account-categories'

const TYPES: AccountType[] = ['income', 'expense', 'asset', 'liability', 'equity']
const SCOPES: AccountScope[] = ['business', 'private', 'mixed']

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

export type CreateInput = {
  name: string
  type: AccountType
  scope: AccountScope
  parentId: string | null
}

export type UpdateInput = {
  name: string
  scope: AccountScope
  parentId: string | null
  isActive: boolean
}

function clean(s: string): string {
  return (s ?? '').trim()
}

// Returns an error string, or null if the parent choice is valid.
async function validateParent(
  supabase: any,
  parentId: string,
  expectedType: AccountType,
  forbiddenId?: string,
): Promise<string | null> {
  if (forbiddenId && parentId === forbiddenId) {
    return 'A category cannot be its own parent.'
  }
  const { data, error } = await supabase
    .from('account_categories')
    .select('id, type, parent_id, is_active')
    .eq('id', parentId)
    .maybeSingle()
  if (error) return error.message
  if (!data) return 'Parent category not found.'
  if (data.type !== expectedType) {
    return 'Parent must be the same type (income/expense/asset/…).'
  }
  if (data.parent_id != null) {
    return 'Parent must be a top-level category (no grandchildren).'
  }
  if (!data.is_active) {
    return 'Parent category is inactive.'
  }
  return null
}

export async function createAccountCategory(
  input: CreateInput,
): Promise<ActionResult> {
  await requireRole(['owner', 'admin'] as const)

  const name = clean(input.name)
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!TYPES.includes(input.type)) return { ok: false, error: 'Invalid type.' }
  if (!SCOPES.includes(input.scope)) return { ok: false, error: 'Invalid scope.' }

  const supabase = await createClient()

  if (input.parentId) {
    const err = await validateParent(supabase, input.parentId, input.type)
    if (err) return { ok: false, error: err }
  }

  // display_order = max within the (type, parent_id) bucket + 10
  let maxQ = supabase
    .from('account_categories')
    .select('display_order')
    .eq('type', input.type)
    .order('display_order', { ascending: false })
    .limit(1)
  if (input.parentId) {
    maxQ = maxQ.eq('parent_id', input.parentId)
  } else {
    maxQ = maxQ.is('parent_id', null)
  }
  const { data: maxRow } = await maxQ.maybeSingle()
  const nextOrder = (Number(maxRow?.display_order) || 0) + 10

  const { data: row, error } = await supabase
    .from('account_categories')
    .insert({
      name,
      type: input.type,
      scope: input.scope,
      parent_id: input.parentId,
      display_order: nextOrder,
      is_system: false,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/accounting/categories')
  revalidatePath('/accounting')
  revalidatePath('/reports')
  return { ok: true, id: row.id as string }
}

export async function updateAccountCategory(
  id: string,
  input: UpdateInput,
): Promise<ActionResult> {
  await requireRole(['owner', 'admin'] as const)

  if (!id) return { ok: false, error: 'Category id is required.' }
  const name = clean(input.name)
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!SCOPES.includes(input.scope)) return { ok: false, error: 'Invalid scope.' }

  const supabase = await createClient()

  const { data: current, error: fetchErr } = await supabase
    .from('account_categories')
    .select('id, type, parent_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message }
  if (!current) return { ok: false, error: 'Category not found.' }

  if (input.parentId) {
    const pErr = await validateParent(
      supabase,
      input.parentId,
      current.type as AccountType,
      id,
    )
    if (pErr) return { ok: false, error: pErr }

    // Demotion guard: if this row has children, we can't move it under
    // another parent — that would create a 3-level tree.
    const { data: child, error: kidErr } = await supabase
      .from('account_categories')
      .select('id')
      .eq('parent_id', id)
      .limit(1)
      .maybeSingle()
    if (kidErr) return { ok: false, error: kidErr.message }
    if (child) {
      return {
        ok: false,
        error:
          'This category has sub-categories. Move them out first, or set this one to top-level.',
      }
    }
  }

  const { error: updErr } = await supabase
    .from('account_categories')
    .update({
      name,
      scope: input.scope,
      parent_id: input.parentId,
      is_active: input.isActive,
    })
    .eq('id', id)

  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath('/accounting/categories')
  revalidatePath('/accounting')
  revalidatePath('/reports')
  return { ok: true }
}
