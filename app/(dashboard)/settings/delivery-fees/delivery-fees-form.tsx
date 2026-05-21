'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveDeliveryFees } from './actions'
import type { DeliveryFees } from '@/lib/store-config-types'

type Warehouse = { id: string; name: string }

type Props = {
  fees: DeliveryFees
  warehouses: Warehouse[]
}

// Editable shape for a pickup row while the form is open. Amount is held
// as a peso string so the field can be typed freely; converted to cents
// only on save.
type PickupRow = {
  fromWarehouseId: string
  toWarehouseId: string
  feePesos: string
}

// ---- money helpers: the UI speaks pesos, the database speaks cents ----
function centsToPesos(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return ''
  return (cents / 100).toString()
}

function pesosToCents(pesos: string): number {
  const n = parseFloat(pesos)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

export function DeliveryFeesForm({ fees, warehouses }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [localPesos, setLocalPesos] = useState<string>(
    centsToPesos(fees.localDeliveryCents),
  )
  const [nationalPesos, setNationalPesos] = useState<string>(
    centsToPesos(fees.nationalDeliveryCents),
  )

  const [cities, setCities] = useState<string[]>(fees.localCities)
  const [cityDraft, setCityDraft] = useState<string>('')

  const [pickups, setPickups] = useState<PickupRow[]>(
    fees.warehousePickupFees.map((p) => ({
      fromWarehouseId: p.fromWarehouseId,
      toWarehouseId: p.toWarehouseId,
      feePesos: centsToPesos(p.feeCents),
    })),
  )

  const noWarehousePairsPossible = warehouses.length < 2

  function addCity() {
    const trimmed = cityDraft.trim()
    if (!trimmed) return
    const exists = cities.some((c) => c.toLowerCase() === trimmed.toLowerCase())
    if (exists) {
      setCityDraft('')
      return
    }
    setCities((prev) => [...prev, trimmed])
    setCityDraft('')
  }

  function removeCity(index: number) {
    setCities((prev) => prev.filter((_, i) => i !== index))
  }

  function addPickup() {
    setPickups((prev) => [
      ...prev,
      { fromWarehouseId: '', toWarehouseId: '', feePesos: '' },
    ])
  }

  function updatePickup(index: number, patch: Partial<PickupRow>) {
    setPickups((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function removePickup(index: number) {
    setPickups((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    setError(null)

    // Validate pickup rows before sending: each must have both
    // warehouses chosen and they must differ.
    for (const row of pickups) {
      if (!row.fromWarehouseId || !row.toWarehouseId) {
        setError('Each pickup fee needs both a "from" and a "to" warehouse.')
        return
      }
      if (row.fromWarehouseId === row.toWarehouseId) {
        setError('A pickup fee cannot have the same warehouse for from and to.')
        return
      }
    }

    // Reject duplicate from->to pairs (the server drops them too, but
    // warning here avoids silent data loss).
    const seen = new Set<string>()
    for (const row of pickups) {
      const key = row.fromWarehouseId + '->' + row.toWarehouseId
      if (seen.has(key)) {
        setError('You have two pickup fees for the same warehouse pair.')
        return
      }
      seen.add(key)
    }

    const payload: DeliveryFees = {
      localDeliveryCents: pesosToCents(localPesos),
      nationalDeliveryCents: pesosToCents(nationalPesos),
      localCities: cities,
      warehousePickupFees: pickups.map((p) => ({
        fromWarehouseId: p.fromWarehouseId,
        toWarehouseId: p.toWarehouseId,
        feeCents: pesosToCents(p.feePesos),
      })),
    }

    startTransition(async () => {
      const result = await saveDeliveryFees(payload)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Delivery & pickup fees saved.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      {/* ---- Delivery fees ------------------------------------------- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Delivery fees</h2>
          <p className="text-sm text-muted-foreground">
            Charged on delivery orders. A delivery to a city on the local list
            below uses the local fee; any other (or unknown) city uses the
            national fee.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="local">Local delivery fee (RD$)</Label>
            <Input
              id="local"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={localPesos}
              onChange={(e) => setLocalPesos(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="national">National delivery fee (RD$)</Label>
            <Input
              id="national"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={nationalPesos}
              onChange={(e) => setNationalPesos(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </section>

      {/* ---- Local cities -------------------------------------------- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Local cities</h2>
          <p className="text-sm text-muted-foreground">
            Deliveries to these cities are charged the local fee. Matching
            ignores capitals, spaces, and accents, so &quot;sosua&quot; and
            &quot;Sos&uacute;a&quot; count as the same.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={cityDraft}
            onChange={(e) => setCityDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCity()
              }
            }}
            placeholder="e.g. Sosua"
          />
          <Button type="button" variant="outline" onClick={addCity}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {cities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local cities yet. Every delivery uses the national fee until you
            add some.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {cities.map((city, i) => (
              <li
                key={city + i}
                className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-1 pl-3 pr-1 text-sm"
              >
                {city}
                <button
                  type="button"
                  onClick={() => removeCity(i)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label={'Remove ' + city}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Warehouse pickup fees ----------------------------------- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Warehouse pickup fees</h2>
          <p className="text-sm text-muted-foreground">
            Charged when a customer collects an order at a different warehouse
            than it was ordered from. Set a fee for each from &rarr; to pair.
          </p>
        </div>

        {noWarehousePairsPossible ? (
          <p className="text-sm text-muted-foreground">
            You need at least two active warehouses to set a pickup fee.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {pickups.map((row, i) => (
                <div
                  key={i}
                  className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_8rem_auto]"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Ordered from</Label>
                    <select
                      value={row.fromWarehouseId}
                      onChange={(e) =>
                        updatePickup(i, { fromWarehouseId: e.target.value })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select…</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Picked up at</Label>
                    <select
                      value={row.toWarehouseId}
                      onChange={(e) =>
                        updatePickup(i, { toWarehouseId: e.target.value })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select…</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fee (RD$)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.feePesos}
                      onChange={(e) =>
                        updatePickup(i, { feePesos: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePickup(i)}
                    aria-label="Remove pickup fee"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addPickup}>
              <Plus className="h-4 w-4" />
              Add pickup fee
            </Button>
          </>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/settings')}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
