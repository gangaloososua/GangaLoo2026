import { createClient } from '@/lib/supabase/server'
import type { Currency, ExchangeRate, EffectiveRate, EffectiveRatesResult } from './exchange-rates-types'
import { SUPPORTED_CURRENCIES } from './exchange-rates-types'

// Re-export so server-side callers can keep `from '@/lib/exchange-rates'`
// as a single import.
export type { Currency, ExchangeRate, EffectiveRate, EffectiveRatesResult }
export { SUPPORTED_CURRENCIES }

/**
 * All rates, newest first. Used by the Settings > Exchange Rates page.
 */
export async function fetchAllExchangeRates(): Promise<ExchangeRate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, currency, rate, source, notes, created_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .order('currency', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) })) as ExchangeRate[]
}

/**
 * Fetch the effective rate for ONE currency, with fallback:
 *   - try current year/month
 *   - else most recent prior month for that currency
 *   - else null (no rate ever set)
 *
 * `currency` is required. Defaulting it silently is exactly the
 * bug that motivated the 12.0.a schema change — every caller must
 * declare which currency it expects.
 */
export async function fetchCurrentExchangeRate(
  currency: Currency,
): Promise<ExchangeRate | null> {
  const supabase = await createClient()

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: exact, error: exactErr } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, currency, rate, source, notes, created_at')
    .eq('year', year)
    .eq('month', month)
    .eq('currency', currency)
    .maybeSingle()
  if (exactErr) throw exactErr
  if (exact) {
    return { ...exact, rate: Number(exact.rate) } as ExchangeRate
  }

  const { data: latest, error: latestErr } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, currency, rate, source, notes, created_at')
    .eq('currency', currency)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) throw latestErr
  if (!latest) return null
  return { ...latest, rate: Number(latest.rate) } as ExchangeRate
}

/**
 * Fetch the effective rate for each requested currency in one round trip.
 * Used by /money-accounts to compute the DOP-equivalent total.
 *
 * For each requested currency:
 *   - try current year/month
 *   - else most recent prior month for that currency
 *   - else add to `missing`
 *
 * DOP, if requested, is returned as { rate: 1, year: 0, month: 0 } —
 * a synthetic identity rate so callers can treat all currencies
 * uniformly without special-casing DOP. (year/month 0 is the signal
 * to UI code that this is the base, not a stored rate.)
 */
export async function fetchEffectiveRatesForCurrencies(
  currencies: readonly Currency[],
): Promise<EffectiveRatesResult> {
  const rates: Partial<Record<Currency, EffectiveRate>> = {}
  const missing: Currency[] = []

  const nonDopCurrencies = currencies.filter((c) => c !== 'DOP')
  const wantsDop = currencies.includes('DOP')

  if (wantsDop) {
    rates.DOP = { currency: 'DOP', rate: 1, year: 0, month: 0 }
  }

  if (nonDopCurrencies.length === 0) {
    return { rates, missing }
  }

  const supabase = await createClient()

  // One query: every rate for the requested currencies, newest first.
  // We pick the first row per currency in JS — simpler than a DISTINCT ON
  // and works with the existing PostgREST surface.
  const { data, error } = await supabase
    .from('monthly_exchange_rates')
    .select('year, month, currency, rate')
    .in('currency', nonDopCurrencies as Currency[])
    .order('year', { ascending: false })
    .order('month', { ascending: false })
  if (error) throw error

  for (const c of nonDopCurrencies) {
    const row = (data ?? []).find((r) => r.currency === c)
    if (row) {
      rates[c] = {
        currency: c,
        rate: Number(row.rate),
        year: row.year,
        month: row.month,
      }
    } else {
      missing.push(c)
    }
  }

  return { rates, missing }
}
