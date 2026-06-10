'use server'

// Round 68f — "Return money" server actions (owner-facing, on the sale page).
//
// Wrap the Round 68e RPCs via the regular server client (they gate on
// auth.uid() -> owner/admin). getSaleReturnInfoAction prefills the dialog;
// returnSaleMoneyAction posts the cash-out through the ledger engine and
// revalidates so sale + account balances refresh.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/guard'

export type SaleReturnInfo = {
  invoiceNumber: string
  collectedCents: number
  returnedCents: number
  returnableCents: number
  suggestedAccountId: string | null
}

export type SaleReturnInfoResult =
  | { ok: true; info: SaleReturnInfo }
  | { ok: false; error: string }

export async function getSaleReturnInfoAction(
  saleId: string,
): Promise<SaleReturnInfoResult> {
  await requireOwner()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_sale_return_info', {
    p_sale_id: saleId,
  })
  if (error) return { ok: false, error: error.message }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        invoice_number: string
        collected_cents: number
        returned_cents: number
        returnable_cents: number
        suggested_account_id: string | null
      }
    | undefined
  if (!row) return { ok: false, error: 'Sale not found.' }

  return {
    ok: true,
    info: {
      invoiceNumber: row.invoice_number,
      collectedCents: Number(row.collected_cents),
      returnedCents: Number(row.returned_cents),
      returnableCents: Number(row.returnable_cents),
      suggestedAccountId: row.suggested_account_id,
    },
  }
}

export type ReturnSaleMoneyResult =
  | { ok: true; returnedCents: number; remainingReturnableCents: number }
  | { ok: false; error: string }

export async function returnSaleMoneyAction(
  saleId: string,
  amountCents: number,
  moneyAccountId: string,
  note: string | null,
): Promise<ReturnSaleMoneyResult> {
  await requireOwner()
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' }
  }
  if (!moneyAccountId) {
    return { ok: false, error: 'Choose an account to return the money from.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('return_sale_money', {
    p_sale_id: saleId,
    p_amount_cents: amountCents,
    p_money_account_id: moneyAccountId,
    p_note: note,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sales')
  revalidatePath(`/sales/${saleId}`)
  revalidatePath('/money-accounts')

  const d = data as
    | { returned_cents?: number; remaining_returnable_cents?: number }
    | null
  return {
    ok: true,
    returnedCents: Number(d?.returned_cents ?? amountCents),
    remainingReturnableCents: Number(d?.remaining_returnable_cents ?? 0),
  }
}
