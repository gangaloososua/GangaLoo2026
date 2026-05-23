import { requireOwner } from '@/lib/auth/guard'
import {
  listInventoryCategories,
  fetchInventoryCategoryListing,
  type InventoryCategoryListing,
} from '@/lib/inventory-category-listing'
import { InventoryPrintView } from './print-view'

export const dynamic = 'force-dynamic'

export default async function InventoryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  await requireOwner()

  const { cat } = await searchParams
  const categories = await listInventoryCategories()

  // Default to the first category so the page always shows a preview.
  const selectedId =
    cat && categories.some((c) => c.id === cat)
      ? cat
      : (categories[0]?.id ?? null)

  const listing: InventoryCategoryListing | null = selectedId
    ? await fetchInventoryCategoryListing(selectedId)
    : null

  return (
    <InventoryPrintView
      categories={categories}
      selectedId={selectedId}
      listing={listing}
    />
  )
}
