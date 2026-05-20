'use client'

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronsUpDown,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CourierPickerItem } from '@/lib/purchases'
import type { MoneyAccount } from '@/lib/sales'
import type { PurchaseOrderPickerItem } from '@/lib/courier-payments'
import {
  createCourierPayment,
  type CreateCourierPaymentInput,
} from '../actions'

type Props = {
  couriers: CourierPickerItem[]
  moneyAccounts: MoneyAccount[]
  purchaseOrders: PurchaseOrderPickerItem[]
  prefillPurchaseOrderId?: string | null
}

type DraftAllocation = {
  key: string
  purchaseOrderId: string
  amountDopRaw: string
}

function newAllocationKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}

function localDatetimeInputValueToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatDop(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function poLabel(po: PurchaseOrderPickerItem): string {
  const datePart = po.orderedAt
    ? new Date(po.orderedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'
  const supplierPart = po.supplierName ?? '(no supplier)'
  const usdPart = po.usdTotal ? `$${formatDop(po.usdTotal)}` : ''
  const idPart = po.legacyId ?? po.id.slice(0, 8)
  return [datePart, supplierPart, usdPart, idPart]
    .filter(Boolean)
    .join(' · ')
}

export function NewCourierPaymentForm({
  couriers,
  moneyAccounts,
  purchaseOrders,
  prefillPurchaseOrderId,
}: Props) {
  const router = useRouter()

  // ---- Header fields ----
  const [courierId, setCourierId] = useState<string>('')
  const [paidAt, setPaidAt] = useState<string>(
    toLocalDatetimeInputValue(new Date()),
  )
  const [amountDopRaw, setAmountDopRaw] = useState<string>('')
  const [moneyAccountId, setMoneyAccountId] = useState<string>('')
  const [reference, setReference] = useState<string>('')
  const [description, setDescription] = useState<string>('')

  // ---- Courier combobox ----
  const [courierPickerOpen, setCourierPickerOpen] = useState(false)
  const [courierQuery, setCourierQuery] = useState('')

  const courierMatches = useMemo(() => {
    const q = courierQuery.trim().toLowerCase()
    if (!q) return couriers
    return couriers.filter((c) => c.name.toLowerCase().includes(q))
  }, [couriers, courierQuery])

  const selectedCourierName = useMemo(() => {
    return couriers.find((c) => c.id === courierId)?.name ?? ''
  }, [couriers, courierId])

  // ---- Allocations state ----
  const [allocations, setAllocations] = useState<DraftAllocation[]>(() => {
    const seedPoId =
      prefillPurchaseOrderId &&
      purchaseOrders.some((p) => p.id === prefillPurchaseOrderId)
        ? prefillPurchaseOrderId
        : ''
    return [{ key: newAllocationKey(), purchaseOrderId: seedPoId, amountDopRaw: '' }]
  })

  function addAllocation() {
    setAllocations((xs) => [
      ...xs,
      { key: newAllocationKey(), purchaseOrderId: '', amountDopRaw: '' },
    ])
  }

  function removeAllocation(key: string) {
    setAllocations((xs) =>
      xs.length <= 1 ? xs : xs.filter((a) => a.key !== key),
    )
  }

  function updateAllocation(key: string, patch: Partial<DraftAllocation>) {
    setAllocations((xs) =>
      xs.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    )
  }

  // ---- Derived values ----
  const amountDopTotal = useMemo(() => {
    const n = Number(amountDopRaw)
    return Number.isFinite(n) ? n : 0
  }, [amountDopRaw])

  const sumOfAllocations = useMemo(() => {
    return allocations.reduce((acc, a) => {
      const n = Number(a.amountDopRaw)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [allocations])

  const sumDelta = sumOfAllocations - amountDopTotal
  const sumMatches = Math.abs(sumDelta) <= 0.01

  // ---- Submit state ----
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSubmit =
    !submitting &&
    courierId.length > 0 &&
    paidAt.length > 0 &&
    amountDopTotal > 0 &&
    moneyAccountId.length > 0 &&
    allocations.length > 0 &&
    allocations.every(
      (a) => a.purchaseOrderId.length > 0 && Number(a.amountDopRaw) > 0,
    ) &&
    sumMatches

  async function onSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setErrorMsg(null)

    const paidAtIso = localDatetimeInputValueToIso(paidAt)
    if (!paidAtIso) {
      setErrorMsg('Invalid paid-at timestamp')
      setSubmitting(false)
      return
    }

    const input: CreateCourierPaymentInput = {
      courierId,
      paidAt: paidAtIso,
      amountDopTotal,
      moneyAccountId,
      description: description.trim() || null,
      reference: reference.trim() || null,
      allocations: allocations.map((a) => ({
        purchaseOrderId: a.purchaseOrderId,
        amountDop: Number(a.amountDopRaw),
      })),
    }

    const result = await createCourierPayment(input)
    if (!result.ok) {
      setErrorMsg(result.error)
      setSubmitting(false)
      return
    }
    router.push(`/courier-payments/${result.id}`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Courier combobox */}
          <div className="space-y-1.5">
            <Label htmlFor="courier-trigger">Courier</Label>
            <Popover
              open={courierPickerOpen}
              onOpenChange={setCourierPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  id="courier-trigger"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={courierPickerOpen}
                  className="w-full justify-between font-normal"
                >
                  <span
                    className={
                      selectedCourierName ? '' : 'text-muted-foreground'
                    }
                  >
                    {selectedCourierName || 'Pick a courier...'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search couriers..."
                    value={courierQuery}
                    onValueChange={setCourierQuery}
                  />
                  <CommandList>
                    {courierMatches.length === 0 ? (
                      <CommandEmpty>
                        No couriers match. Add new couriers in People (kind:
                        courier) first.
                      </CommandEmpty>
                    ) : (
                      <CommandGroup heading="Couriers">
                        {courierMatches.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setCourierId(c.id)
                              setCourierQuery('')
                              setCourierPickerOpen(false)
                            }}
                          >
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Paid at */}
          <div className="space-y-1.5">
            <Label htmlFor="paid-at">Paid at</Label>
            <Input
              id="paid-at"
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          {/* Amount DOP total */}
          <div className="space-y-1.5">
            <Label htmlFor="amount-dop">Amount (DOP)</Label>
            <Input
              id="amount-dop"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amountDopRaw}
              onChange={(e) => setAmountDopRaw(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Payment account */}
          <div className="space-y-1.5">
            <Label htmlFor="money-account">Payment account</Label>
            <Select
              value={moneyAccountId}
              onValueChange={(v) => setMoneyAccountId(v)}
            >
              <SelectTrigger id="money-account">
                <SelectValue placeholder="Pick an account..." />
              </SelectTrigger>
              <SelectContent>
                {moneyAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice number, courier confirmation, etc."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Notes about this courier payment..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Allocations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Allocations</CardTitle>
            <p className="text-xs text-muted-foreground">
              How this payment splits across purchase orders.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAllocation}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add row
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase order</TableHead>
                <TableHead className="w-[180px] text-right">
                  Amount (DOP)
                </TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => (
                <AllocationRow
                  key={a.key}
                  draft={a}
                  purchaseOrders={purchaseOrders}
                  onChange={(patch) => updateAllocation(a.key, patch)}
                  onRemove={() => removeAllocation(a.key)}
                  canRemove={allocations.length > 1}
                />
              ))}
            </TableBody>
            <tfoot>
              <TableRow>
                <TableCell className="text-right font-medium">
                  Sum of allocations
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatDop(sumOfAllocations)}
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell className="text-right text-muted-foreground">
                  Payment total
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDop(amountDopTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
              {!sumMatches && (amountDopTotal > 0 || sumOfAllocations > 0) ? (
                <TableRow>
                  <TableCell
                    className="text-right text-amber-700"
                    colSpan={2}
                  >
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Off by {formatDop(sumDelta)} DOP
                    </span>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ) : null}
            </tfoot>
          </Table>
        </CardContent>
      </Card>

      {/* Submit */}
      {errorMsg ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-start gap-2 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-700" />
            <div className="text-rose-900">{errorMsg}</div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/courier-payments')}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="button" onClick={onSubmit} disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save courier payment'
          )}
        </Button>
      </div>
    </div>
  )
}

// ---- Per-row PO picker + amount input ----------------------------

function AllocationRow({
  draft,
  purchaseOrders,
  onChange,
  onRemove,
  canRemove,
}: {
  draft: DraftAllocation
  purchaseOrders: PurchaseOrderPickerItem[]
  onChange: (patch: Partial<DraftAllocation>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return purchaseOrders
    return purchaseOrders.filter((p) => {
      const hay = [
        p.legacyId ?? '',
        p.supplierName ?? '',
        p.orderedAt ?? '',
        p.id,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [purchaseOrders, query])

  const selected = useMemo(
    () => purchaseOrders.find((p) => p.id === draft.purchaseOrderId) ?? null,
    [purchaseOrders, draft.purchaseOrderId],
  )

  return (
    <TableRow>
      <TableCell>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            >
              <span
                className={
                  selected ? '' : 'text-muted-foreground'
                }
              >
                {selected ? poLabel(selected) : 'Pick a purchase order...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by supplier, date, or legacy id..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                {matches.length === 0 ? (
                  <CommandEmpty>No purchase orders match.</CommandEmpty>
                ) : (
                  <CommandGroup heading="Purchase orders">
                    {matches.slice(0, 100).map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          onChange({ purchaseOrderId: p.id })
                          setQuery('')
                          setOpen(false)
                        }}
                      >
                        {poLabel(p)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={draft.amountDopRaw}
          onChange={(e) => onChange({ amountDopRaw: e.target.value })}
          placeholder="0.00"
          className="text-right tabular-nums"
        />
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="Remove allocation"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
