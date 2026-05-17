'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type RateActionResult = { ok: boolean; error?: string }

function parseRateInput(formData: FormData): {
  year: number
  month: number
  rate: number
  source: string | null
  notes: string | null
} | { error: string } {
  const yearRaw = String(formData.get('year') ?? '').trim()
  const monthRaw = String(formData.get('month') ?? '').trim()
  const rateRaw = String(formData.get('rate') ?? '').trim()
  const sourceRaw = String(formData.get('source') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const rate = Number(rateRaw)

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: 'Year must be between 2000 and 2100.' }
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: 'Month must be between 1 and 12.' }
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: 'Rate must be a positive number.' }
  }

  return {
    year,
    month,
    rate,
    source: sourceRaw || null,
    notes: notesRaw || null,
  }
}

export async function createRate(formData: FormData): Promise<RateActionResult> {
  await requireOwner()
  const parsed = parseRateInput(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase.from('monthly_exchange_rates').insert(parsed)
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A rate already exists for that year and month. Edit it instead.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/settings/exchange-rates')
  return { ok: true }
}

export async function updateRate(
  origYear: number,
  origMonth: number,
  formData: FormData,
): Promise<RateActionResult> {
  await requireOwner()
  const parsed = parseRateInput(formData)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  if (parsed.year !== origYear || parsed.month !== origMonth) {
    return { ok: false, error: 'Year and month cannot be changed. Delete and recreate instead.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('monthly_exchange_rates')
    .update({ rate: parsed.rate, source: parsed.source, notes: parsed.notes })
    .eq('year', origYear)
    .eq('month', origMonth)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/exchange-rates')
  return { ok: true }
}

export async function deleteRate(year: number, month: number): Promise<RateActionResult> {
  await requireOwner()
  const supabase = await createClient()
  const { error } = await supabase
    .from('monthly_exchange_rates')
    .delete()
    .eq('year', year)
    .eq('month', month)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/exchange-rates')
  return { ok: true }
}
