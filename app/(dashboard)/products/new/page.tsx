import { ProductForm } from '../_form/product-form'
import { requireOwner } from '@/lib/auth/guard'

export default async function NewProductPage() {
  await requireOwner()
  return <ProductForm mode="create" canSeeCosts={true} />
}
