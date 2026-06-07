'use server'

// Reports - Balance Sheet snapshot actions.
//
// Banks (or refreshes) the current month's balance-sheet snapshot. Owner-gated
// twice over: requireOwner() here, plus the DB function gates on owner/admin.
// Uses the regular server client (via the data layer) so auth.uid() is present.

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth/guard'
import { saveBalanceSheetSnapshot } from '@/lib/balance-sheet'

export async function saveSnapshotAction(): Promise<void> {
  await requireOwner()
  await saveBalanceSheetSnapshot()
  revalidatePath('/reports/balance-sheet')
}
