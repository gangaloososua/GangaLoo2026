import { listCategories } from './actions'
import { CategoriesTable } from './categories-table'
import { requireOwner } from '@/lib/auth/guard'

export default async function CategoriesPage() {
  await requireOwner()
  const categories = await listCategories()
  return <CategoriesTable categories={categories} />
}