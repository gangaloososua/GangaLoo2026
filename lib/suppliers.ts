// Suppliers & couriers management data layer.
//
// The `suppliers` table holds both product suppliers (kind='supplier') and
// couriers (kind='courier'). Existing pickers (listSuppliersForPicker /
// listCouriersForPicker in lib/purchases.ts) return only id+name of ACTIVE
// rows; this module is the management read surface - all columns, all rows,
// filterable by kind / active status / search.

import { createClient } from '@/lib/supabase/server'

export type SupplierKind = 'supplier' | 'courier'

export type SupplierRow = {
  id: string
  kind: SupplierKind
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  defaultExpenseCategoryId: string | null
  isActive: boolean
  createdAt: string
}

export type SupplierFilter = {
  kind?: SupplierKind          // undefined = both
  activeStatus?: 'active' | 'inactive' | 'all'   // default 'all'
  search?: string
}

type SupplierDbRow = {
  id: string
  kind: SupplierKind
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  default_expense_category_id: string | null
  is_active: boolean
  created_at: string
}

function mapRow(r: SupplierDbRow): SupplierRow {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    notes: r.notes,
    defaultExpenseCategoryId: r.default_expense_category_id,
    isActive: r.is_active,
    createdAt: r.created_at,
  }
}

export async function listSuppliers(
  filter: SupplierFilter = {},
): Promise<SupplierRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('suppliers')
    .select(
      'id, kind, name, contact_name, email, phone, address, notes, default_expense_category_id, is_active, created_at',
    )

  if (filter.kind) query = query.eq('kind', filter.kind)
  if (filter.activeStatus === 'active') query = query.eq('is_active', true)
  if (filter.activeStatus === 'inactive') query = query.eq('is_active', false)

  const search = filter.search?.trim()
  if (search) {
    // match name OR contact_name (case-insensitive)
    query = query.or(`name.ilike.%${search}%,contact_name.ilike.%${search}%`)
  }

  query = query.order('is_active', { ascending: false }).order('name', { ascending: true })

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as SupplierDbRow[]).map(mapRow)
}
