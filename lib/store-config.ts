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
