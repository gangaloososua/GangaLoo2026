'use server'

// Read-only server action backing the account-statement modal. It fetches one
// account's statement on demand (when the modal opens) so we don't pull every
// account's full ledger up front. Writes nothing - owner-gated for safety
// since server actions are independently callable endpoints.

import { requireOwner } from '@/lib/auth/guard'
import {
  fetchAccountStatement,
  type AccountStatement,
} from '@/lib/account-statement'

export async function getAccountStatement(
  accountId: string,
): Promise<AccountStatement> {
  await requireOwner()
  return fetchAccountStatement(accountId)
}
