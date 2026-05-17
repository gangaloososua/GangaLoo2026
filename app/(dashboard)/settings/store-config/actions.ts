'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ConfigValueType } from '@/lib/store-config'
import { requireOwner } from '@/lib/auth/guard'

export type ConfigActionResult = { ok: boolean; error?: string }

export async function updateConfigValue(
  key: string,
  rawValue: string,
  type: ConfigValueType,
): Promise<ConfigActionResult> {
  await requireOwner()
  if (!key) return { ok: false, error: 'Missing key.' }

  let parsed: string | number | boolean
  if (type === 'number') {
    const n = Number(rawValue)
    if (!Number.isFinite(n)) {
      return { ok: false, error: 'Value must be a valid number.' }
    }
    parsed = n
  } else if (type === 'boolean') {
    if (rawValue === 'true') parsed = true
    else if (rawValue === 'false') parsed = false
    else return { ok: false, error: 'Boolean value must be true or false.' }
  } else {
    parsed = rawValue
  }

  const supabase = await createClient()

  // NOTE: updated_by intentionally omitted. store_config.updated_by has a FK
  // to profiles(id), and not every auth user has a profiles row yet. Wire this
  // up when the Users management module ensures profile creation on signup.
  const { error } = await supabase
    .from('store_config')
    .update({
      value: parsed,
      updated_at: new Date().toISOString(),
    })
    .eq('key', key)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/store-config')
  return { ok: true }
}
