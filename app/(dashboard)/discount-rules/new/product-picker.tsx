'use client'

// Round 20.1 — Searchable product picker with a category filter.
//
// Reusable combobox for the discount-rule forms. A category filter
// (PRIMARY category only) sits above a type-to-search product list.
// The category filter only narrows WHICH products you browse; the
// selected product id is what the form consumes via value/onChange.

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type PickerProduct = {
  id: string
  name: string
  sku: string
  primaryCategoryId: string | null
}
export type PickerCategory = { id: string; name: string }

type Props = {
  products: PickerProduct[]
  categories: PickerCategory[]
  value: string
  onChange: (productId: string) => void
}

// Sentinel for the "no category filter" option (empty string is not a
// valid Select item value in Radix).
const ALL = '__all__'

export function ProductPicker({
  products,
  categories,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)

  const selected = products.find((p) => p.id === value) ?? null

  const visible =
    categoryFilter === ALL
      ? products
      : products.filter((p) => p.primaryCategoryId === categoryFilter)

  return (
    <div className="space-y-2">
      {/* Category filter (primary category only) */}
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger>
          <SelectValue placeholder="Filter by category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Searchable product list */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn(!selected && 'text-muted-foreground')}>
              {selected
                ? `${selected.name} (${selected.sku})`
                : 'Pick a product…'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search by name or SKU…" />
            <CommandList>
              <CommandEmpty>No products found.</CommandEmpty>
              <CommandGroup>
                {visible.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.sku}`}
                    onSelect={() => {
                      onChange(p.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === p.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>
                      {p.name}{' '}
                      <span className="text-muted-foreground">({p.sku})</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
