import {
  fetchProductsWithStock,
  fetchAllCategoriesFlat,
  type ProductFilters,
} from '@/lib/products'
import { ProductsClient } from './products-client'

type SP = {
  q?: string
  category?: string
  active?: string
  visible?: string
  page?: string
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const params = await searchParams

  const filters: ProductFilters = {
    search: params.q,
    categoryId: params.category,
    active: (params.active as ProductFilters['active']) ?? 'all',
    visible: (params.visible as ProductFilters['visible']) ?? 'all',
    page: params.page ? parseInt(params.page, 10) || 1 : 1,
    pageSize: 25,
  }

  const [{ rows, total, page, pageSize }, categories] = await Promise.all([
    fetchProductsWithStock(filters),
    fetchAllCategoriesFlat(),
  ])

  return (
    <ProductsClient
      initialRows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      categories={categories}
      currentFilters={{
        search: filters.search,
        categoryId: filters.categoryId,
        active: filters.active ?? 'all',
        visible: filters.visible ?? 'all',
      }}
    />
  )
}
