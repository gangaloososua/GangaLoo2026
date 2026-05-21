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

// ---------------------------------------------------------------------------
// Delivery & pickup fees (one store_config key: 'delivery_fees')
// ---------------------------------------------------------------------------
// Managed by the dedicated /settings/delivery-fees page (NOT the generic
// store-config editor, which skips complex JSON values). All amounts are
// stored in cents to match the rest of the money columns in the app.

// A single from -> to warehouse pickup fee: charged when a customer picks
// the order up at a different warehouse than it was sourced from.
export type WarehousePickupFee = {
  fromWarehouseId: string
  toWarehouseId: string
  feeCents: number
}

export type DeliveryFees = {
  // Flat delivery fees in cents.
  localDeliveryCents: number
  nationalDeliveryCents: number
  // Cities that count as "local". Matched case/accent-insensitively at
  // order time; a blank or unlisted city falls back to the national fee.
  localCities: string[]
  // Per from -> to warehouse pickup fees.
  warehousePickupFees: WarehousePickupFee[]
}

export const DELIVERY_FEES_KEY = 'delivery_fees'

// Safe fallbacks for when the key has never been saved: everything zero /
// empty, so no fee is ever charged until the owner sets real numbers.
export const DELIVERY_FEES_DEFAULTS: DeliveryFees = {
  localDeliveryCents: 0,
  nationalDeliveryCents: 0,
  localCities: [],
  warehousePickupFees: [],
}
