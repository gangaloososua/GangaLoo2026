'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function skuPrefix(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 24)
}

function randomSkuSuffix(): string {
  return Math.floor(10000 + Math.random() * 90000).toString()
}

type Props = {
  initialSku?: string
  initialName?: string
  initialSlug?: string
  initialDescription?: string
  initialVideoUrl?: string
  initialIsActive?: boolean
  initialVisibleInStore?: boolean
  initialIsInventory?: boolean
}

export function BasicsTab({
  initialSku = '',
  initialName = '',
  initialSlug = '',
  initialDescription = '',
  initialVideoUrl = '',
  initialIsActive = true,
  initialVisibleInStore = true,
  initialIsInventory = true,
}: Props) {
  const [name, setName] = useState(initialName)

  const [slug, setSlug] = useState(initialSlug)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    Boolean(initialSlug),
  )

  const [sku, setSku] = useState(initialSku)
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(
    Boolean(initialSku),
  )
  const skuSuffixRef = useRef<string>(randomSkuSuffix())

  function handleNameChange(v: string) {
    setName(v)
    if (!slugManuallyEdited) setSlug(slugify(v))
    if (!skuManuallyEdited) {
      const prefix = skuPrefix(v)
      setSku(prefix ? `${prefix}-${skuSuffixRef.current}` : '')
    }
  }

  function handleSlugChange(v: string) {
    setSlug(v)
    setSlugManuallyEdited(true)
  }

  function handleSkuChange(v: string) {
    setSku(v)
    setSkuManuallyEdited(true)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid gap-2">
        <Label htmlFor="sku">SKU *</Label>
        <Input
          id="sku"
          name="sku"
          value={sku}
          onChange={(e) => handleSkuChange(e.target.value)}
          placeholder="auto-generated from name"
          required
        />
        <p className="text-xs text-muted-foreground">
          Unique product code. Auto-fills from the name unless you edit it.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. 13x4 150% 12&quot; #4/27 Highlights Lacio"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          placeholder="auto-generated from name"
        />
        <p className="text-xs text-muted-foreground">
          Used in storefront URLs. Auto-fills from the name unless you edit it.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initialDescription}
          rows={4}
          placeholder="Customer-facing description (optional)"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="video_url">YouTube video link</Label>
        <Input
          id="video_url"
          name="video_url"
          type="url"
          defaultValue={initialVideoUrl}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-xs text-muted-foreground">
          Optional. Paste the full YouTube link for this product. It will play
          on the product&apos;s page in the online store.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Switch
          id="is_active"
          name="is_active"
          defaultChecked={initialIsActive}
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Active
          <span className="block text-xs font-normal text-muted-foreground">
            Inactive products are hidden everywhere and can't be sold.
          </span>
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="visible_in_store"
          name="visible_in_store"
          defaultChecked={initialVisibleInStore}
        />
        <Label htmlFor="visible_in_store" className="cursor-pointer">
          Visible in online store
          <span className="block text-xs font-normal text-muted-foreground">
            Active but hidden products can still be sold in-store / POS.
          </span>
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="is_inventory"
          name="is_inventory"
          defaultChecked={initialIsInventory}
        />
        <Label htmlFor="is_inventory" className="cursor-pointer">
          Track inventory
          <span className="block text-xs font-normal text-muted-foreground">
            Turn off for service / non-physical products (e.g. "Pedido Amazon"
            placeholder for third-party orders). Non-inventory products skip
            stock checks and COGS — set the price per sale.
          </span>
        </Label>
      </div>
    </div>
  )
}
