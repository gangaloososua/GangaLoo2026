import Link from 'next/link'
import { requireRole } from '@/lib/auth/guard'
import { fetchStockCountSheet, type CountSheetRow } from '@/lib/inventory'
import { listWarehousesForFilter } from '@/lib/sales'
import { PrintButton } from './print-button'

export const dynamic = 'force-dynamic'

type SearchParams = { warehouse?: string; out?: string; category?: string }

type ProductLine = {
  productId: string
  productName: string
  qtyByWarehouse: Map<string, number>
  total: number
}
type SubGroup = { subId: string; subName: string; products: ProductLine[] }
type ParentGroup = { parentId: string; parentName: string; subs: SubGroup[] }

function groupRows(rows: CountSheetRow[]): ParentGroup[] {
  const parents = new Map<string, ParentGroup>()
  const parentOrder: string[] = []
  const lineByProduct = new Map<string, ProductLine>()

  for (const r of rows) {
    let p = parents.get(r.parentId)
    if (!p) {
      p = { parentId: r.parentId, parentName: r.parentName, subs: [] }
      parents.set(r.parentId, p)
      parentOrder.push(r.parentId)
    }
    let s = p.subs.find((x) => x.subId === r.subId)
    if (!s) {
      s = { subId: r.subId, subName: r.subName, products: [] }
      p.subs.push(s)
    }
    let line = lineByProduct.get(r.productId)
    if (!line) {
      line = {
        productId: r.productId,
        productName: r.productName,
        qtyByWarehouse: new Map(),
        total: 0,
      }
      lineByProduct.set(r.productId, line)
      s.products.push(line)
    }
    line.qtyByWarehouse.set(
      r.warehouseName,
      (line.qtyByWarehouse.get(r.warehouseName) ?? 0) + r.qtyOnHand,
    )
    line.total += r.qtyOnHand
  }

  for (const p of parents.values()) {
    for (const s of p.subs) {
      s.products.sort((a, b) => a.productName.localeCompare(b.productName))
    }
    p.subs.sort((a, b) => a.subName.localeCompare(b.subName))
  }
  return parentOrder.map((id) => parents.get(id) as ParentGroup)
}

export default async function CountSheetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireRole(['owner', 'admin'] as const)
  const sp = await searchParams
  const includeOut = sp.out === '1'
  const selectedWarehouseId = sp.warehouse || ''

  const [rows, warehouses] = await Promise.all([
    fetchStockCountSheet({ categoryId: sp.category || undefined, includeOut }),
    listWarehousesForFilter(),
  ])

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)
  const selectedWarehouseName = selectedWarehouse?.name ?? ''

  // Which warehouses become columns: the selected one, or every warehouse
  // that appears in the data (sorted).
  const presentWarehouses = Array.from(
    new Set(rows.map((r) => r.warehouseName)),
  ).sort((a, b) => a.localeCompare(b))
  const columnWarehouses = selectedWarehouse
    ? presentWarehouses.filter((w) => w === selectedWarehouseName)
    : presentWarehouses

  const groups = groupRows(rows)

  const printedAt = new Date().toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Total columns = product + one per warehouse + total. Total only useful
  // when there's more than one warehouse column.
  const showTotal = columnWarehouses.length > 1

  return (
    <div className="count-sheet mx-auto max-w-5xl space-y-4 p-4 text-sm">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: landscape; }
        }
        .count-sheet table { width: 100%; border-collapse: collapse; }
        .count-sheet th, .count-sheet td {
          border: 1px solid #ccc; padding: 4px 8px; text-align: left;
        }
        .count-sheet th.num, .count-sheet td.num { text-align: right; }
        .count-sheet thead { background: #f3f4f6; }
      `}</style>

      <div className="no-print flex items-center justify-between">
        <Link
          href="/inventory"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to inventory
        </Link>
        <PrintButton />
      </div>

      <div>
        <h1 className="text-xl font-semibold">Stock count sheet</h1>
        <p className="text-xs text-muted-foreground">
          {selectedWarehouse
            ? 'Warehouse: ' + selectedWarehouseName
            : 'All warehouses'}
          {' · '}Printed {printedAt}
          {includeOut ? ' · including out-of-stock' : ' · in-stock only'}
        </p>
      </div>

      {groups.length === 0 || columnWarehouses.length === 0 ? (
        <p>No stock to list.</p>
      ) : (
        groups.map((p) => (
          <div key={p.parentId} className="space-y-2">
            <h2 className="text-base font-semibold border-b pb-1">
              {p.parentName}
            </h2>
            {p.subs.map((s) => (
              <div key={s.subId} className="space-y-1">
                <h3 className="text-sm font-medium italic">{s.subName}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      {columnWarehouses.map((w) => (
                        <th key={w} className="num">
                          {w}
                        </th>
                      ))}
                      {showTotal ? <th className="num">Total</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {s.products.map((pr) => (
                      <tr key={pr.productId}>
                        <td>{pr.productName}</td>
                        {columnWarehouses.map((w) => (
                          <td key={w} className="num">
                            {Math.round(pr.qtyByWarehouse.get(w) ?? 0)}
                          </td>
                        ))}
                        {showTotal ? (
                          <td className="num">{Math.round(pr.total)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
