// Pure types and constants for exchange rates. NO server code here —
// this module is safe to import from client components.
//
// The server fetchers (fetchAllExchangeRates, fetchCurrentExchangeRate,
// fetchEffectiveRatesForCurrencies) live in lib/exchange-rates.ts and
// re-export everything here so server-side code can keep a single
// import.

export type Currency = 'DOP' | 'USD' | 'EUR'

export const SUPPORTED_CURRENCIES: readonly Currency[] = ['DOP', 'USD', 'EUR'] as const

export type ExchangeRate = {
  year: number
  month: number
  currency: Currency
  rate: number
  source: string | null
  notes: string | null
  created_at: string
}

export type EffectiveRate = {
  currency: Currency
  rate: number
  year: number
  month: number
}

export type EffectiveRatesResult = {
  rates: Partial<Record<Currency, EffectiveRate>>
  missing: Currency[]
}
