// Pure types and constants for store config. NO server code here —
// this module is safe to import from client components.
//
// The server fetchers (fetchStoreConfig, fetchStoreInfo) live in
// lib/store-config.ts and re-export everything here so server-side
// code can keep a single import.

export type ConfigValueType = 'string' | 'number' | 'boolean'

export type StoreConfigRow = {
  key: string
  value: string | number | boolean
  valueType: ConfigValueType
  description: string | null
  updated_at: string
}

// ---------------------------------------------------------------------------
// Receipt header info (the four typed keys edited by /settings/receipt)
// ---------------------------------------------------------------------------

export type StoreInfo = {
  name: string
  address: string
  phone: string
  rnc: string
}

// Hardcoded fallbacks for when a key isn't set yet. The Settings UI
// lets the owner override these without touching code.
export const STORE_INFO_DEFAULTS: StoreInfo = {
  name: 'Gangaloo',
  address: '',
  phone: '',
  rnc: '',
}
