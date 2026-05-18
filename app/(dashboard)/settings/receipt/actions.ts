'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'
import { STORE_INFO_DEFAULTS, type StoreInfo } from '@/lib/store-config'

// ---------------------------------------------------------------------------
// upsertStoreInfo
// ---------------------------------------------------------------------------
// Owner-only. Writes all four store_config rows in one bulk upsert.
//
// Fields are read out of FormData and trimmed. Empty fields are
// written as empty strings (not deletes) — the POS receipt template
// conditionally hides empty lines, and the store_config table is
// happier with stable row shape than with rows blinking in and out.
//
// `name` is defended at both the form layer and here: the form
// marks it required, and if it somehow arrives blank we substitute
// the default ('Gangaloo') so the receipt never ends up headerless.
//
// `updated_at` is written explicitly — the column has no auto-update
// trigger and no DEFAULT on UPDATE, so without this every save would
// leave updated_at frozen at the row's original INSERT timestamp.
//
// Returns { success: true } on success / { error: string } on failure.
// No redirect — caller stays on /settings/receipt after save.
// ---------------------------------------------------------------------------

function readField(formData: FormData, key: string): string {
  const v = formData.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export async function upsertStoreInfo(formData: FormData) {
  await requireOwner()

  const input: StoreInfo = {
    name: readField(formData, 'name') || STORE_INFO_DEFAULTS.name,
    address: readField(formData, 'address'),
    phone: readField(formData, 'phone'),
    rnc: readField(formData, 'rnc'),
  }

  const now = new Date().toISOString()
  const supabase = await createClient()
  const { error } = await supabase
    .from('store_config')
    .upsert(
      [
        { key: 'store_name', value: input.name, updated_at: now },
        { key: 'store_address', value: input.address, updated_at: now },
        { key: 'store_phone', value: input.phone, updated_at: now },
        { key: 'store_rnc', value: input.rnc, updated_at: now },
      ],
      { onConflict: 'key' },
    )

  if (error) return { error: error.message }

  revalidatePath('/settings/receipt')
  revalidatePath('/settings')
  return { success: true as const }
}
