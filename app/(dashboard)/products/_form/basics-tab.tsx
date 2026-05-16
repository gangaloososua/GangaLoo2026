'use client'

import { useState } from 'react'
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

type Props = {
  initialSku?: string
  initialName?: string
  initialSlug?: string
  initialDescription?: string
  initialIsActive?: boolean
  initialVisibleInStore?: boolean
}

export function BasicsTab({
  initialSku = '',
  initialName = '',
  initialSlug = '',
  initialDescription = '',
  initialIsActive = true,
  initialVisibleInStore = true,
}: Props) {
  const [name, setName] = useState(initialName)
  const [slug, setSlug] = useState(initialSlug)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    Boolean(initialSlug),
  )

  function handleNameChange(v: string) {
    setName(v)
    if (!slugManuallyEdited) setSlug(slugify(v))
  }

  function handleSlugChange(v: string) {
    setSlug(v)
    setSlugManuallyEdited(true)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid gap-2">
        <Label htmlFor="sku">SKU *</Label>
        <Input
          id="sku"
          name="sku"
          defaultValue={initialSku}
          placeholder="e.g. 13X-150-12-12345"
          required
        />
        <p className="text-xs text-muted-foreground">
          Unique product code. Used internally and on labels.
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
    </div>
  )
}
