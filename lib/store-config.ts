import { createClient } from '@/lib/supabase/server'

export type ConfigValueType = 'string' | 'number' | 'boolean'

export type StoreConfigRow = {
  key: string
  value: string | number | boolean
  valueType: ConfigValueType
  description: string | null
  updated_at: string
}

function detectType(value: unknown): ConfigValueType | null {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return null
}

export async function fetchStoreConfig(): Promise<StoreConfigRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_config')
    .select('key, value, description, updated_at')
    .order('key', { ascending: true })
  if (error) throw error

  const rows: StoreConfigRow[] = []
  for (const row of data ?? []) {
    const t = detectType(row.value)
    if (t === null) {
      // Skip rows with complex JSON values for now — not editable in this UI
      continue
    }
    rows.push({
      key: row.key,
      value: row.value as string | number | boolean,
      valueType: t,
      description: row.description,
      updated_at: row.updated_at,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// 9.9 — receipt header info
// ---------------------------------------------------------------------------

export type StoreInfo = {
  name: string
  address: string
  phone: string
  rnc: string
}

// Hardcoded fallbacks for when a key isn't set yet. The Settings UI
// lets the owner override these without touching code.
const STORE_INFO_DEFAULTS: StoreInfo = {
  name: 'Gangaloo',
  address: '',
  phone: '',
  rnc: '',
}

/**
 * Fetches the store_* keys from store_config in one round-trip and
 * returns a typed StoreInfo. Missing keys fall back to defaults; blank
 * values (empty strings) pass through and the receipt template
 * conditionally hides those lines.
 */
export async function fetchStoreInfo(): Promise<StoreInfo> {
  const rows = await fetchStoreConfig()
  const byKey: Record<string, unknown> = {}
  for (const r of rows) {
    byKey[r.key] = r.value
  }

  function pickString(key: string, fallback: string): string {
    const v = byKey[key]
    if (typeof v === 'string') return v
    return fallback
  }

  return {
    name: pickString('store_name', STORE_INFO_DEFAULTS.name),
    address: pickString('store_address', STORE_INFO_DEFAULTS.address),
    phone: pickString('store_phone', STORE_INFO_DEFAULTS.phone),
    rnc: pickString('store_rnc', STORE_INFO_DEFAULTS.rnc),
  }
}
