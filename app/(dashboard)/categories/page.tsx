import { listCategories } from './actions'
import { CategoriesTable } from './categories-table'

export default async function CategoriesPage() {
  const categories = await listCategories()
  return <CategoriesTable categories={categories} />
}