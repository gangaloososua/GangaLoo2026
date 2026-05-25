'use client'

// Round 36a — distributor transfer request form (locale-aware).
//
// Direction toggle (order-in vs send-out), the distributor's own warehouse
// locked onto one side, and a parked REQUEST on submit (no stock moves).
// Text reads from the transfers dictionary by role; distributors see Spanish.

import { useState } from 'react'
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
import { requestTransfer } from '../actions'
import { plural, type Locale } from '@/lib/i18n/dictionary'
import { tt } from '@/lib/i18n/transfers-i18n'
import type { ProductSearchResult, SaleCategoryPickerItem } from '@/lib/sales'
import type { WarehouseOption } from '@/lib/stock-transfers'

type Direction = 'in' | 'out'

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

export function RequestTransferForm({
  myWarehouse,
  otherWarehouses,
  categories,
  locale = 'es',
}: {
  myWarehouse: WarehouseOption
  otherWarehouses: WarehouseOption[]
  categories: SaleCategoryPickerItem[]
  locale?: Locale
}) {
  const router = useRouter()
  const [direction, setDirection] = useState<Direction>('in')
  const [otherId, setOtherId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [lines, setLines] = useState<Line[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const sourceId = direction === 'in' ? otherId : myWarehouse.id
  const destId = direction === 'in' ? myWarehouse.id : otherId
  const ready = !!otherId

  function resetCart() {
    if (lines.length > 0) setLines([])
  }
  function onDirectionChange(d: Direction) {
    setDirection(d)
    resetCart()
  }
  function onOtherChange(id: string) {
    setOtherId(id)
    resetCart()
  }

  function addProduct(p: ProductSearchResult) {
    setLines((prev) => {
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

  function updateQty(line_id: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.line_id === line_id ? { ...l, qty: Math.max(1, qty) } : l)),
    )
  }

  function removeLine(line_id: string) {
    setLines((prev) => prev.filter((l) => l.line_id !== line_id))
  }

  const canSubmit = ready && lines.length > 0 && !submitting

  async function handleSubmit() {
    if (!ready || lines.length === 0) return
    setSubmitting(true)
    try {
      const res = await requestTransfer({
        fromWarehouseId: sourceId,
        toWarehouseId: destId,
        notes: notes.trim() || null,
        items: lines.map((l) => ({ productId: l.product_id, qty: l.qty })),
      })
      if (res.ok) {
        toast.success(tt(locale, 'tr.req.toastSubmitted'))
        router.push('/transfers')
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt(locale, 'tr.req.toastFailed'))
      setSubmitting(false)
    }
  }

  const otherName = otherWarehouses.find((w) => w.id === otherId)?.name ?? ''
  const sourceName = direction === 'in' ? otherName : myWarehouse.name
  const destName = direction === 'in' ? myWarehouse.name : otherName
  const otherLabel =
    direction === 'in' ? tt(locale, 'tr.req.fromWhich') : tt(locale, 'tr.req.toWhich')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tt(locale, 'tr.req.detailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{tt(locale, 'tr.req.direction')}</Label>
            <Select
              value={direction}
              onValueChange={(v) => onDirectionChange(v as Direction)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">{tt(locale, 'tr.req.orderIn')}</SelectItem>
                <SelectItem value="out">{tt(locale, 'tr.req.sendOut')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tt(locale, 'tr.req.yourWarehouse')}: {myWarehouse.name}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {otherLabel} <span className="text-rose-600">*</span>
            </Label>
            <Select value={otherId} onValueChange={onOtherChange}>
              <SelectTrigger>
                <SelectValue placeholder={tt(locale, 'tr.req.choosePh')} />
              </SelectTrigger>
              <SelectContent>
                {otherWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{tt(locale, 'tr.req.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={tt(locale, 'tr.req.notesPh')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tt(locale, 'tr.req.products')}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[20rem] space-y-4">
          {!ready ? (
            <p className="text-sm text-muted-foreground">{tt(locale, 'tr.req.pickFirst')}</p>
          ) : (
            <>
              <ProductSearch
                warehouseId={sourceId}
                categories={categories}
                onAdd={addProduct}
              />

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tt(locale, 'tr.req.noProducts')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{tt(locale, 'tr.req.colProduct')}</th>
                        <th className="py-2 pr-3 font-medium">{tt(locale, 'tr.req.colQty')}</th>
                        <th className="py-2 pr-3 font-medium">{tt(locale, 'tr.req.colOnHand')}</th>
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
                                <span className="text-amber-700">
                                  {l.qty_on_hand_at_add} {tt(locale, 'tr.req.moreThanAvail')}
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
                                aria-label={tt(locale, 'tr.req.colProduct')}
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

              <p className="text-xs text-muted-foreground">{tt(locale, 'tr.req.guide')}</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => router.push('/transfers')}
          disabled={submitting}
        >
          {tt(locale, 'tr.req.cancel')}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => setConfirmOpen(true)}
          title={
            !ready
              ? tt(locale, 'tr.req.needWh')
              : lines.length === 0
                ? tt(locale, 'tr.req.needProduct')
                : tt(locale, 'tr.req.submit')
          }
        >
          {submitting ? tt(locale, 'tr.req.submitting') : tt(locale, 'tr.req.submit')}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt(locale, 'tr.req.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  {tt(locale, 'tr.req.requesting')} {lines.length}{' '}
                  {plural(locale, lines.length, 'product.one', 'product.other')}{' '}
                  {tt(locale, 'tr.req.from')}{' '}
                  <span className="font-medium">{sourceName}</span> {tt(locale, 'tr.req.to')}{' '}
                  <span className="font-medium">{destName}</span>.
                </div>
                <div className="text-muted-foreground">{tt(locale, 'tr.req.confirmNote')}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{tt(locale, 'tr.req.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                setConfirmOpen(false)
                void handleSubmit()
              }}
            >
              {tt(locale, 'tr.req.submit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
