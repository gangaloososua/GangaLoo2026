'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  createWarehouse,
  updateWarehouse,
  type Warehouse,
  type StaffOption,
} from './actions'

type Props = {
  warehouse?: Warehouse | null
  staff: StaffOption[]
}

const NONE = '__none__'

export function WarehouseForm({ warehouse, staff }: Props) {
  const isEdit = !!warehouse
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)

    // Translate "__none__" sentinel back to empty for the server
    for (const key of ['distributor_id', 'manager_id']) {
      if (formData.get(key) === NONE) formData.set(key, '')
    }

    startTransition(async () => {
      if (isEdit) {
        const result = await updateWarehouse(warehouse!.id, formData)
        if (result?.error) {
          setError(result.error)
          return
        }
        toast.success('Warehouse updated.')
        router.refresh()
      } else {
        // createWarehouse redirects on success, so it only returns on error
        const result = await createWarehouse(formData)
        if (result?.error) {
          setError(result.error)
        }
      }
    })
  }

  const w = warehouse

  return (
    <form action={handleSubmit} className="space-y-6">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="storefront">Storefront</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 pt-4" forceMount>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={w?.name ?? ''}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={w?.slug ?? ''}
                placeholder="auto-generated from name"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kind">Kind</Label>
              <Select name="kind" defaultValue={w?.kind ?? 'store'}>
                <SelectTrigger id="kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">Store</SelectItem>
                  <SelectItem value="fulfillment">Fulfillment</SelectItem>
                  <SelectItem value="virtual">Virtual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  name="is_active"
                  defaultChecked={w?.is_active ?? true}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={w?.description ?? ''}
              rows={3}
            />
          </div>
</TabsContent>
       <TabsContent value="location" className="space-y-4 pt-4" forceMount>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={w?.address ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={w?.city ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input id="region" name="region" defaultValue={w?.region ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={w?.phone ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" name="whatsapp" defaultValue={w?.whatsapp ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maps_url">Maps URL</Label>
              <Input id="maps_url" name="maps_url" defaultValue={w?.maps_url ?? ''} placeholder="https://maps.google.com/..." />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="storefront" className="space-y-4 pt-4" forceMount>
          <div className="flex items-center gap-2">
            <Switch id="is_public" name="is_public" defaultChecked={w?.is_public ?? true} />
            <Label htmlFor="is_public">Visible on public storefront</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display_order">Display order</Label>
              <Input id="display_order" name="display_order" type="number" defaultValue={w?.display_order ?? 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner_url">Banner URL</Label>
              <Input id="banner_url" name="banner_url" defaultValue={w?.banner_url ?? ''} placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero_text">Hero text</Label>
            <Textarea id="hero_text" name="hero_text" defaultValue={w?.hero_text ?? ''} rows={2} placeholder="Visit our Santo Domingo store" />
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-4 pt-4" forceMount>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="distributor_id">Distributor</Label>
              <Select name="distributor_id" defaultValue={w?.distributor_id ?? NONE}>
                <SelectTrigger id="distributor_id">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="distributor_commission_percent">Distributor commission %</Label>
              <Input id="distributor_commission_percent" name="distributor_commission_percent" type="number" step="0.01" defaultValue={w?.distributor_commission_percent ?? 0} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="manager_id">Manager</Label>
              <Select name="manager_id" defaultValue={w?.manager_id ?? NONE}>
                <SelectTrigger id="manager_id">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create warehouse'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/warehouses')} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}