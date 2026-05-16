import { createClient } from '@/lib/supabase/server'

export type ExchangeRate = {
  year: number
  month: number
  rate: number
  source: string | null
  notes: string | null
  created_at: string
}

export async function fetchAllExchangeRates(): Promise<ExchangeRate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, rate, source, notes, created_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) }))
}
