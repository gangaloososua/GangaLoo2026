import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  InventoryDashboardStats,
  StockByGroupRow,
} from '@/lib/inventory'

type Props = {
  stats: InventoryDashboardStats
  byWarehouse: StockByGroupRow[]
  byCategory: StockByGroupRow[]
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

function fmtDop(n: number): string {
  return (
    'RD$' +
    Math.round(n).toLocaleString('en-GB')
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function BreakdownTable({
  title,
  rows,
  groupLabel,
}: {
  title: string
  rows: StockByGroupRow[]
  groupLabel: string
}) {
  const totalUnits = rows.reduce((s, r) => s + r.units, 0)
  const totalValue = rows.reduce((s, r) => s + r.valueDop, 0)
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in stock.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{groupLabel}</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.groupId}>
                  <TableCell className="font-medium">{r.groupName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtInt(r.units)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtDop(r.valueDop)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtInt(totalUnits)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmtDop(totalValue)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function InventoryDashboard({ stats, byWarehouse, byCategory }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Items in stock" value={fmtInt(stats.totalUnitsOnHand)} />
        <StatTile label="Stock value" value={fmtDop(stats.totalValueDop)} />
        <StatTile label="Distinct products" value={fmtInt(stats.distinctProducts)} />
        <StatTile label="Incoming units" value={fmtInt(stats.incomingUnits)} />
        <StatTile label="Incoming value" value={fmtDop(stats.incomingValueDop)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownTable
          title="Stock by warehouse"
          rows={byWarehouse}
          groupLabel="Warehouse"
        />
        <BreakdownTable
          title="Stock by category"
          rows={byCategory}
          groupLabel="Category"
        />
      </div>
    </div>
  )
}