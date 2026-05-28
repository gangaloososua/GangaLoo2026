import { requireRole } from '@/lib/auth/guard'
import {
  listAccountCategories,
  listParentOptions,
  type AccountType,
  type ParentOption,
} from '@/lib/account-categories'
import { CategoriesView } from './categories-view'

export const dynamic = 'force-dynamic'

const ALL_TYPES: AccountType[] = ['income', 'expense', 'asset', 'liability', 'equity']

export default async function AccountingCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  await requireRole(['owner', 'admin'] as const)
  const sp = await searchParams

  const [rows, ...parentLists] = await Promise.all([
    listAccountCategories(),
    ...ALL_TYPES.map((t) => listParentOptions(t)),
  ])

  const parentOptionsByType: Partial<Record<AccountType, ParentOption[]>> = {}
  ALL_TYPES.forEach((t, i) => {
    parentOptionsByType[t] = parentLists[i]
  })

  const initialEditRow = sp.edit ? rows.find((r) => r.id === sp.edit) ?? null : null

  return (
    <CategoriesView
      rows={rows}
      parentOptionsByType={parentOptionsByType}
      initialEditRow={initialEditRow}
    />
  )
}
