import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listWarehouses } from './actions'
import { WarehousesTable } from './warehouses-table'

export default async function WarehousesPage() {
  const warehouses = await listWarehouses()

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warehouses</h1>
          <p className="text-sm text-muted-foreground">
            Stores, fulfillment centers, and virtual locations.
          </p>
        </div>
        <Button asChild>
          <Link href="/warehouses/new">
            <Plus className="mr-2 h-4 w-4" />
            New warehouse
          </Link>
        </Button>
      </div>
      <WarehousesTable warehouses={warehouses} />
    </div>
  )
}