'use server'

// Reports - Inventory valuation snapshot actions.
//
// Banks (or refreshes) the current month's inventory-valuation snapshot.
// Owner-gated twice over: requireOwner() here, plus the DB function gates on
// owner/admin. Uses the regular server client (via the data layer) so
// auth.uid() is present.

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth/guard'
import { saveInventoryReportSnapshot } from '@/lib/inventory-report'

export async function saveInventorySnapshotAction(): Promise<void> {
  await requireOwner()
  await saveInventoryReportSnapshot()
  revalidatePath('/reports/inventory')
}
