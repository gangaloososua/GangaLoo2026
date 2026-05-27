'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  saveProductAttributes,
  type ProductAttributeOption,
} from './attributes-tab-actions'

const NONE = '__none__'

export function AttributesTab({
  productId,
  attributes,
  initialValueIds,
}: {
  productId: string
  attributes: ProductAttributeOption[]
  initialValueIds: string[]
}) {
  const [isPending, startTransition] = useTransition()

  // selected[attributeId] = array of chosen value ids.
  // Single-value attributes hold 0 or 1; multi-value hold any number.
  const initialSelected = useMemo(() => {
    const initial = new Set(initialValueIds)
    const map: Record<string, string[]> = {}
    for (const attr of attributes) {
      map[attr.id] = attr.values.filter((v) => initial.has(v.id)).map((v) => v.id)
    }
    return map
  }, [attributes, initialValueIds])

  const [selected, setSelected] = useState<Record<string, string[]>>(initialSelected)

  function setSingle(attrId: string, valueId: string) {
    setSelected((prev) => ({
      ...prev,
      [attrId]: valueId === NONE ? [] : [valueId],
    }))
  }

  function toggleMulti(attrId: string, valueId: string, on: boolean) {
    setSelected((prev) => {
      const current = new Set(prev[attrId] ?? [])
      if (on) current.add(valueId)
      else current.delete(valueId)
      return { ...prev, [attrId]: Array.from(current) }
    })
  }

  function onSave() {
    const valueIds = Object.values(selected).flat()
    startTransition(async () => {
      const res = await saveProductAttributes(productId, valueIds)
      if (res.ok) toast.success('Attributes saved')
      else toast.error(res.error ?? 'Failed to save attributes')
    })
  }

  if (attributes.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No attributes defined yet. Create attributes and their values on the{' '}
        <span className="font-medium">Attributes</span> screen first, then assign
        them here.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        {attributes.map((attr) => {
          const chosen = selected[attr.id] ?? []
          const hasValues = attr.values.length > 0
          return (
            <div key={attr.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{attr.name}</Label>
                {!attr.single_value_only && (
                  <span className="text-xs text-muted-foreground">
                    (multiple allowed)
                  </span>
                )}
              </div>

              {!hasValues ? (
                <p className="text-sm text-muted-foreground">
                  No values yet for this attribute.
                </p>
              ) : attr.single_value_only ? (
                <Select
                  value={chosen[0] ?? NONE}
                  onValueChange={(v) => setSingle(attr.id, v)}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="— Not set —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Not set —</SelectItem>
                    {attr.values.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {attr.values.map((v) => {
                    const on = chosen.includes(v.id)
                    return (
                      <label
                        key={v.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(c) =>
                            toggleMulti(attr.id, v.id, c === true)
                          }
                        />
                        {v.value}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save attributes'}
        </Button>
      </div>
    </div>
  )
}
