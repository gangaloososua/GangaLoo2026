// Reports - per-account statement (Movimientos) data layer.
//
// Thin wrapper around the read-only account_statement() RPC, which gathers
// every movement that touches a money account from the transactions ledger,
// tags each with its tipo (Cobros / Transacciones / Compras / Transferencias /
// Comisiones / Courier), and computes a running SALDO from the account's
// opening balance. All money values are in CENTS (integers).
//
// SALDO model: running saldo = opening_cents + cumulative(amount_cents) in
// occurred_at order. amount_cents is signed (income +, expense -), so the
// direction of each movement is read from its sign. `computed_balance_cents`
// is opening + the net of all movements; `stored_balance_cents` is whatever
// the account currently shows on its card. These two can differ (migration
// drift) - stage 2 reconciles them by letting the owner set the opening
// (the "starting saldo"), which also re-syncs the stored balance.
//
// Round 73a: a SPLIT PAYMENT (one receipt allocated across several invoices)
// is collapsed by account_statement() into ONE movement. `group_size` is how
// many invoices it covered (1 = a normal single movement) and `invoices` lists
// their numbers, so the UI can show one deposit line that expands to the
// invoices it paid.
import { createClient } from '@/lib/supabase/server'
export type StatementTipo =
  | 'Cobros'
  | 'Transacciones'
  | 'Compras'
  | 'Transferencias'
  | 'Comisiones'
  | 'Courier'
export type StatementMovement = {
  id: string
  occurred_at: string
  description: string | null
  tipo: StatementTipo
  /** Signed: income positive, expense negative. */
  amount_cents: number
  /** Running balance after this movement (opening + cumulative to here). */
  saldo_cents: number
  is_manual: boolean
  /** How many ledger rows were collapsed into this movement (1 = normal). */
  group_size: number
  /** Invoice numbers covered by a grouped receipt (empty for non-sale rows). */
  invoices: string[]
}
export type StatementDirection = {
  count: number
  /** entradas: positive; salidas: negative (natural ledger sign). */
  total_cents: number
}
export type AccountStatement = {
  account: {
    id: string
    name: string
    kind: string
    currency: string
  }
  /** The account's opening "starting saldo" (initial_balance_cents). */
  opening_cents: number
  /** What the account card currently shows. */
  stored_balance_cents: number
  /** opening + net of all movements. The honest current saldo. */
  computed_balance_cents: number
  movement_count: number
  entradas: StatementDirection
  salidas: StatementDirection
  movements: StatementMovement[]
}
export async function fetchAccountStatement(
  accountId: string,
): Promise<AccountStatement> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('account_statement', {
    p_account_id: accountId,
  })
  if (error) throw new Error(error.message)
  return data as AccountStatement
}
