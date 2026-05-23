'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomerQuick } from './customer-actions'
import type { CustomerPickerItem } from '@/lib/sales'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (customer: CustomerPickerItem) => void
}

export function QuickCustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setFullName('')
    setPhone('')
    setEmail('')
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleCreate() {
    const name = fullName.trim()
    if (!name) {
      toast.error('Name is required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await createCustomerQuick({
        full_name: name,
        phone: phone.trim() || null,
        email: email.trim() || null,
      })
      if (res.ok) {
        toast.success(`Customer "${res.customer.full_name}" added.`)
        onCreated(res.customer)
        reset()
        onOpenChange(false)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add customer.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Add a customer on the fly. You can fill in the rest of their
            details later from the People page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">
              Name <span className="text-rose-600">*</span>
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreate()
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 809 555 1234"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Used for sending invoices by WhatsApp.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Email (optional)</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
