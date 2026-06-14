// app/(dashboard)/us-products/page.tsx
//
// US dropship shop — products list (admin). Phase 1.
// Owner-only. Lists US products with their computed selling price.

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireOwner } from '@/lib/auth/guard'
import { listUsProducts, computeUsPriceUsd } from '@/lib/us-products'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

export default async function UsProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireOwner()
  const { q } = await searchParams
  const products = await listUsProducts({ search: q ?? null })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">US products</h1>
          <p className="text-sm text-muted-foreground">
            Dropship products for the US shop. Priced in USD (supplier cost +
            shipping + markup, or a manual override).
          </p>
        </div>
        <Button asChild>
          <Link href="/us-products/new">
            <Plus className="mr-1 h-4 w-4" />
            New US product
          </Link>
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search name, SKU, or category…"
              className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm shadow-sm"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
            {q ? (
              <Button asChild variant="ghost">
                <Link href="/us-products">Clear</Link>
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost+Ship</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {q
                      ? 'No US products match that search.'
                      : 'No US products yet. Create one to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => {
                  const price = computeUsPriceUsd(p)
                  const costShip = p.supplierCostUsd + p.supplierShippingUsd
                  return (
                    <TableRow key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.category ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtUsd(costShip)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.priceOverrideUsd != null
                          ? 'override'
                          : `${p.markupPercent}%`}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtUsd(price)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.isActive
                          ? p.visibleInStore
                            ? 'Active'
                            : 'Active (hidden)'
                          : 'Retired'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/us-products/${p.id}/edit`}>Edit</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
