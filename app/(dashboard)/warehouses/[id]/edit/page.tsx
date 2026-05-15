import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getWarehouse, listStaff } from '../../actions'
import { WarehouseForm } from '../../warehouse-form'

export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [warehouse, staff] = await Promise.all([getWarehouse(id), listStaff()])

  if (!warehouse) notFound()

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/warehouses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to warehouses
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{warehouse.name}</h1>
        <p className="text-sm text-muted-foreground">Edit warehouse details.</p>
      </div>
      <WarehouseForm warehouse={warehouse} staff={staff} />
    </div>
  )
}