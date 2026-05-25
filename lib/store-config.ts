import { createClient } from '@/lib/supabase/server'
import type {
  ConfigValueType,
  StoreConfigRow,
  StoreInfo,
  DeliveryFees,
  WarehousePickupFee,
} from './store-config-types'
import { STORE_INFO_DEFAULTS, DELIVERY_FEES_KEY, DELIVERY_FEES_DEFAULTS } from './store-config-types'

// Re-export for server-side caller convenience. Client components
// must import directly from './store-config-types'.
export type { ConfigValueType, StoreConfigRow, StoreInfo }
export type { DeliveryFees, WarehousePickupFee }
export { STORE_INFO_DEFAULTS }
export { DELIVERY_FEES_KEY, DELIVERY_FEES_DEFAULTS }

export type StoreBankInfo = {
  name: string
  account: string
  accountName: string
  accountType: string
}

export type PaymentConfig = {
  enabled: boolean
  stripePct: number
  stripeFixed: number
  paypalPct: number
  paypalFixed: number
  paypalName: string
}

export type StorePublicConfig = {
  deliveryFees: DeliveryFees
  bankInfo: StoreBankInfo
  paymentConfig: PaymentConfig
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

// ---------------------------------------------------------------------------
// Delivery & pickup fees
// ---------------------------------------------------------------------------
// Validates a raw delivery_fees blob into a typed DeliveryFees. Missing key or
// any malformed field falls back to DELIVERY_FEES_DEFAULTS so the order flow
// never crashes on bad data — worst case it charges no fee until the owner
// saves real numbers.
function parseDeliveryFees(v: Partial<DeliveryFees> | null | undefined): DeliveryFees {
  if (!v || typeof v !== 'object') return DELIVERY_FEES_DEFAULTS
  const num = (x: unknown): number =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0
  const cities = Array.isArray(v.localCities)
    ? v.localCities.filter((c): c is string => typeof c === 'string')
    : []
  const pickups = Array.isArray(v.warehousePickupFees)
    ? v.warehousePickupFees
        .filter(
          (p): p is WarehousePickupFee =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as WarehousePickupFee).fromWarehouseId === 'string' &&
            typeof (p as WarehousePickupFee).toWarehouseId === 'string',
        )
        .map((p) => ({
          fromWarehouseId: p.fromWarehouseId,
          toWarehouseId: p.toWarehouseId,
          feeCents: num(p.feeCents),
        }))
    : []
  return {
    localDeliveryCents: num(v.localDeliveryCents),
    nationalDeliveryCents: num(v.nationalDeliveryCents),
    localCities: cities,
    warehousePickupFees: pickups,
  }
}

// One safe round-trip for the PUBLIC storefront: delivery fees + bank transfer
// details. Read via the SECURITY DEFINER get_store_public_config() RPC so
// anonymous/customer sessions can read these specific values without direct
// (RLS-blocked) access to store_config. Used by the checkout page.
export async function fetchStorePublicConfig(): Promise<StorePublicConfig> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_store_public_config')
  if (error) throw error
  const obj = (data ?? {}) as Record<string, unknown>
  const str = (x: unknown): string => (typeof x === 'string' ? x : '')
  const numv = (x: unknown): number => {
    if (typeof x === 'number' && Number.isFinite(x)) return x
    if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x)
    return 0
  }
  return {
    deliveryFees: parseDeliveryFees(obj.delivery_fees as Partial<DeliveryFees> | null),
    bankInfo: {
      name: str(obj.bankName),
      account: str(obj.bankAccount),
      accountName: str(obj.bankAccountName),
      accountType: str(obj.bankAccountType),
    },
    paymentConfig: {
      enabled: numv(obj.online_pay_enabled) === 1,
      stripePct: numv(obj.stripe_fee_pct),
      stripeFixed: numv(obj.stripe_fee_fixed),
      paypalPct: numv(obj.paypal_fee_pct),
      paypalFixed: numv(obj.paypal_fee_fixed),
      paypalName: str(obj.paypal_name) || 'PayPal',
    },
  }
}

// Kept for any other callers; now RLS-safe via the public-config RPC.
export async function fetchDeliveryFees(): Promise<DeliveryFees> {
  const { deliveryFees } = await fetchStorePublicConfig()
  return deliveryFees
}
