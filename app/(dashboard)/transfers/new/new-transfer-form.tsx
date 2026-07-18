'use client'

// Round 26d — new stock transfer form.
//
// Pick source + destination warehouse, then add products via the shared
// ProductSearch (scoped to the SOURCE warehouse, so it lists that warehouse's
// stock and on-hand qty) OR by scanning a product code with the camera.
// Set quantities, confirm, submit -> initiateTransfer.
// The engine rejects an over-stock transfer; we also warn in the UI.
//
// 2026-06-17: + camera scan to add products (one-shot). A scanned code is
// looked up scoped to the SOURCE warehouse via findProductBySkuAction, so the
// added line carries the right on-hand and inherits the over-stock guard.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ProductSearch } from '../../sales/new/product-search'
import { QrScanButton } from '@/components/qr-scanner'
import { findProductBySkuAction } from '../../scan/actions'
import { initiateTransfer } from '../actions'
import type { ProductSearchResult, SaleCategoryPickerItem } from '@/lib/sales'
import type { WarehouseOption } from '@/lib/stock-transfers'

type Line = {
  line_id: string
  product_id: string
  sku: string
  name: string
  qty: number
  qty_on_hand_at_add: number
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function NewTransferForm({
  warehouses,
  categories,
}: {
  warehouses: WarehouseOption[]
  categories: SaleCategoryPickerItem[]
}) {
  const router = useRouter()
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [lines, setLines] = useState<Line[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const ready = !!fromId && !!toId && fromId !== toId

  function onFromChange(id: string) {
    setFromId(id)
    // Changing the source warehouse invalidates the cart (stock differs).
    if (lines.length > 0) setLines([])
  }

  function addProduct(p: ProductSearchResult) {
    setLines((prev) => {
      // If already added, bump qty by 1 instead of duplicating.
      const existing = prev.find((l) => l.product_id === p.id)
      if (existing) {
        return prev.map((l) =>
          l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l,
        )
      }
      return [
        ...prev,
        {
          line_id: makeId(),
          product_id: p.id,
          sku: p.sku,
          name: p.name,
          qty: 1,
          qty_on_hand_at_add: p.qty_on_hand,
        },
      ]
    })
  }

  // Camera scan -> look up the code in the SOURCE warehouse -> add the line.
  async function handleScan(code: string) {
    if (!fromId) return
    try {
      const res = await findProductBySkuAction(fromId, code)
      if (!res.ok) {
        toast.error(res.error || 'Lookup failed.')
        return
      }
      if (res.product) {
        addProduct(res.product)
        toast.success(res.product.name)
      } else {
        toast.error('No product for that code in this warehouse.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed.')
    }
  }

  function updateQty(line_id: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.line_id === line_id ? { ...l, qty: Math.max(1, qty) } : l)),
    )
  }

  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }

  const anyOverStock = useMemo(
    () => lines.some((l) => l.qty > l.qty_on_hand_at_add),
    [lines],
  )

  const canSubmit = ready && lines.length > 0 && !anyOverStock && !submitting

  async function handleSubmit() {
    if (!ready || lines.length === 0) return
    setSubmitting(true)
    try {
      const res = await initiateTransfer({
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        notes: notes.trim() || null,
        items: lines.map((l) => ({ productId: l.product_id, qty: l.qty })),
      })
      if (res.ok) {
        toast.success('Transfer created — stock is now in transit.')
        router.push(`/transfers/${res.id}`)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create transfer.')
      setSubmitting(false)
    }
  }

  const fromName = warehouses.find((w) => w.id === fromId)?.name ?? ''
  const toName = warehouses.find((w) => w.id === toId)?.name ?? ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">
              From warehouse <span className="text-rose-600">*</span>
            </Label>
            <Select value={fromId} onValueChange={onFromChange}>
              <SelectTrigger>
                <SelectValue placeholder="Source…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              To warehouse <span className="text-rose-600">*</span>
            </Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Destination…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  .filter((w) => w.id !== fromId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason, who's carrying it, etc."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[20rem] space-y-4">
          {!ready ? (
            <p className="text-sm text-muted-foreground">
              Pick a source and destination warehouse (they must be different) to add products.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <ProductSearch
                    warehouseId={fromId}
                    categories={categories}
                    onAdd={addProduct}
                  />
                </div>
                <QrScanButton onScan={handleScan} label="Scan" />
              </div>

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No products yet. Search or scan above to add what you&apos;re moving.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Product</th>
                        <th className="py-2 pr-3 font-medium">Qty to move</th>
                        <th className="py-2 pr-3 font-medium">In source</th>
                        <th className="py-2 pl-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const over = l.qty > l.qty_on_hand_at_add
                        return (
                          <tr key={l.line_id} className="border-b align-top">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{l.name}</div>
                              <div className="text-xs text-muted-foreground">{l.sku}</div>
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={l.qty}
                                onChange={(e) =>
                                  updateQty(l.line_id, parseInt(e.target.value, 10) || 1)
                                }
                                className="w-24"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              {over ? (
                                <span className="text-rose-700">
                                  {l.qty_on_hand_at_add} (short by {l.qty - l.qty_on_hand_at_add})
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {l.qty_on_hand_at_add}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pl-3">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(l.line_id)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {anyOverStock && (
                <p className="text-sm text-rose-700">
                  One or more lines exceed what&apos;s in the source warehouse. Reduce the
                  quantity — you can only move stock that&apos;s actually there.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => router.push('/transfers')} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => setConfirmOpen(true)}
          title={
            !ready
              ? 'Pick two different warehouses'
              : lines.length === 0
                ? 'Add at least one product'
                : anyOverStock
                  ? 'Reduce over-stock lines'
                  : 'Create transfer'
          }
        >
          {submitting ? 'Creating…' : 'Create transfer'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create this transfer?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Moving {lines.length} {lines.length === 1 ? 'product' : 'products'} from{' '}
                  <span className="font-medium">{fromName}</span> to{' '}
                  <span className="font-medium">{toName}</span>.
                </div>
                <div className="text-muted-foreground">
                  The stock leaves {fromName} now and sits in transit until someone
                  receives it at {toName}. Inventory value is unchanged.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleSubmit()
              }}
            >
              Create transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
