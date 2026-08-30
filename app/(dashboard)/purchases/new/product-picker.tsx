'use client'
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
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
import type {
  ProductPickerItem,
  ProductPickerCategoryGroup,
} from '@/lib/purchases'
type Props = {
  productGroups: ProductPickerCategoryGroup[]
  onPick: (product: ProductPickerItem) => void
}
// Self-contained product picker. Renders its own "Add line" trigger button;
// clicking it opens a Popover with a search input above a grouped, scrollable
// list of products. Search filters across name + SKU and prunes empty groups.
// Picking a product calls onPick and closes the popover.
export function ProductPicker({ productGroups, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return productGroups
    const out: ProductPickerCategoryGroup[] = []
    for (const g of productGroups) {
      const matches = g.products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      if (matches.length > 0) {
        out.push({ ...g, products: matches })
      }
    }
    return out
  }, [productGroups, query])
  function handlePick(p: ProductPickerItem) {
    onPick(p)
    setQuery('')
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add line
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or SKU..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[360px]">
            {filteredGroups.length === 0 && (
              <CommandEmpty>No products match.</CommandEmpty>
            )}
            {filteredGroups.map((g) => (
              <CommandGroup
                key={g.category_id ?? '__uncategorized__'}
                heading={g.category_name}
              >
                {g.products.map((p) => (
                  <CommandItem
                    key={(g.category_id ?? 'u') + ':' + p.id}
                    value={(g.category_id ?? 'u') + ':' + p.id + ':' + p.name + ':' + p.sku}
                    onSelect={() => handlePick(p)}
                  >
                    <div className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      <span
                        className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground"
                        title={p.sku}
                      >
                        {p.sku}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
