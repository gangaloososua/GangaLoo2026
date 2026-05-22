'use server'

// Suppliers & couriers management actions (create / update / activate-toggle).
// The `suppliers` table backs both product suppliers and couriers (kind).
// Owner-gated, consistent with the purchases ActionResult convention.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import type { SupplierKind } from '@/lib/suppliers'

export type SupplierActionResult = { ok: true } | { ok: false; error: string }

export type SupplierInput = {
  kind: SupplierKind
  name: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
}

function clean(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

function validate(input: SupplierInput): string | null {
  if (input.kind !== 'supplier' && input.kind !== 'courier')
    return 'Kind must be supplier or courier.'
  if (!input.name || input.name.trim().length === 0)
    return 'Name is required.'
  return null
}

export async function createSupplier(
  input: SupplierInput,
): Promise<SupplierActionResult> {
  await requireOwner()

  const err = validate(input)
  if (err) return { ok: false, error: err }

  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').insert({
    kind: input.kind,
    name: input.name.trim(),
    contact_name: clean(input.contactName),
    email: clean(input.email),
    phone: clean(input.phone),
    address: clean(input.address),
    notes: clean(input.notes),
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/people')
  return { ok: true }
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<SupplierActionResult> {
  await requireOwner()

  if (!id) return { ok: false, error: 'Supplier id is required.' }
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const supabase = await createClient()
  const { error } = await supabase
    .from('suppliers')
    .update({
      kind: input.kind,
      name: input.name.trim(),
      contact_name: clean(input.contactName),
      email: clean(input.email),
      phone: clean(input.phone),
      address: clean(input.address),
      notes: clean(input.notes),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/people')
  return { ok: true }
}

export async function setSupplierActive(
  id: string,
  isActive: boolean,
): Promise<SupplierActionResult> {
  await requireOwner()

  if (!id) return { ok: false, error: 'Supplier id is required.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/people')
  return { ok: true }
}
