import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listStaff } from '../actions'
import { WarehouseForm } from '../warehouse-form'

export default async function NewWarehousePage() {
  const staff = await listStaff()

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/warehouses" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to warehouses
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New warehouse</h1>
        <p className="text-sm text-muted-foreground">Create a new store, fulfillment center, or virtual location.</p>
      </div>
      <WarehouseForm staff={staff} />
    </div>
  )
}