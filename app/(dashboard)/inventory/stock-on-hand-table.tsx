'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { StockOnHandRow } from '@/lib/inventory'

type Props = {
  rows: StockOnHandRow[]
}

export function StockOnHandTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing in stock right now.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} product/warehouse {rows.length === 1 ? 'line' : 'lines'}{' '}
        in stock.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">In stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.productId + '|' + r.warehouseId}>
                <TableCell className="font-medium">{r.productName}</TableCell>
                <TableCell>{r.warehouseName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qtyOnHand}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}