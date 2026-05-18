'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { upsertStoreInfo } from './actions'
import type { StoreInfo } from '@/lib/store-config-types'
import { STORE_INFO_DEFAULTS } from '@/lib/store-config-types'

type Props = {
  storeInfo: StoreInfo
}

export function ReceiptForm({ storeInfo }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await upsertStoreInfo(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success('Receipt identity updated.')
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Store name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={storeInfo.name}
          placeholder={STORE_INFO_DEFAULTS.name}
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Top line on every printed receipt.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Store address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={storeInfo.address}
          rows={2}
          placeholder="e.g. Sosua, Puerto Plata"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Store phone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={storeInfo.phone}
            placeholder="e.g. 829-286-7868"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rnc">RNC</Label>
          <Input
            id="rnc"
            name="rnc"
            defaultValue={storeInfo.rnc}
            placeholder="e.g. 130-12345-6"
          />
          <p className="text-xs text-muted-foreground">
            Registro Nacional de Contribuyente. Leave blank if not
            registered.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save changes'}
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
    </form>
  )
}
