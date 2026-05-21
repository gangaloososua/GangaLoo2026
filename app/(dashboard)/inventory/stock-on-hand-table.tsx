'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import type { StockOnHandRow } from '@/lib/inventory'

type WarehouseOption = { id: string; name: string }
type CategoryOption = { id: string; name: string }

type Props = {
  rows: StockOnHandRow[]
  // Optional: when provided, the warehouse + category filter dropdowns show.
  // Sellers get them too; only costs are withheld (this view never shows cost).
  warehouses?: WarehouseOption[]
  categories?: CategoryOption[]
  // When true, product names link to that product's history (owners only).
  enableHistoryLink?: boolean
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

type Group = {
  categoryId: string
  categoryName: string
  rows: StockOnHandRow[]
  subtotal: number
}

export function StockOnHandTable({
  rows,
  warehouses,
  categories,
  enableHistoryLink = false,
}: Props) {
  const [warehouseId, setWarehouseId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const showFilters = !!warehouses && warehouses.length > 0

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (warehouseId && r.warehouseId !== warehouseId) return false
      if (categoryId) {
        if (categoryId === '__uncategorized__') {
          if (r.categoryId !== null) return false
        } else if (r.categoryId !== categoryId) {
          return false
        }
      }
      return true
    })
  }, [rows, warehouseId, categoryId])

  // Group filtered rows by top-level category, preserving the loader's sort
  // (already category -> product -> warehouse).
  const groups = useMemo(() => {
    const byCat = new Map<string, Group>()
    const order: string[] = []
    for (const r of filtered) {
      const key = r.categoryId ?? '__uncategorized__'
      let g = byCat.get(key)
      if (!g) {
        g = {
          categoryId: key,
          categoryName: r.categoryName,
          rows: [],
          subtotal: 0,
        }
        byCat.set(key, g)
        order.push(key)
      }
      g.rows.push(r)
      g.subtotal += r.qtyOnHand
    }
    return order.map((k) => byCat.get(k) as Group)
  }, [filtered])

  const grandTotal = filtered.reduce((s, r) => s + r.qtyOnHand, 0)

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Warehouse</Label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={selectClass}
            >
              <option value="">All warehouses</option>
              {warehouses!.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {categories && categories.length > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={selectClass}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__uncategorized__">(uncategorized)</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in stock for this filter.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {fmtInt(grandTotal)} units in stock across {groups.length}{' '}
            {groups.length === 1 ? 'category' : 'categories'}.
          </p>
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.categoryId} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{g.categoryName}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {fmtInt(g.subtotal)} units
                  </span>
                </div>
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
                      {g.rows.map((r) => (
                        <TableRow key={r.productId + '|' + r.warehouseId}>
                          <TableCell className="font-medium">
                            {enableHistoryLink ? (
                              <Link
                                href={'/inventory?product=' + r.productId}
                                className="text-blue-600 hover:underline"
                              >
                                {r.productName}
                              </Link>
                            ) : (
                              r.productName
                            )}
                          </TableCell>
                          <TableCell>{r.warehouseName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtInt(r.qtyOnHand)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
