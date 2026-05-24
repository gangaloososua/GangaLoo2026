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
import { type Locale, t } from '@/lib/i18n/dictionary'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (customer: CustomerPickerItem) => void
  locale: Locale
}

export function QuickCustomerDialog({ open, onOpenChange, onCreated, locale }: Props) {
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
      toast.error(t(locale, 'ns.qcNameRequired'))
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
        toast.success(`${t(locale, 'ns.qcCustomerAddedPre')} "${res.customer.full_name}" ${t(locale, 'ns.qcCustomerAddedSuffix')}`)
        onCreated(res.customer)
        reset()
        onOpenChange(false)
      } else {
        toast.error(res.error)
        setSubmitting(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(locale, 'ns.qcCouldNotAdd'))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(locale, 'ns.qcTitle')}</DialogTitle>
          <DialogDescription>
            {t(locale, 'ns.qcDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">
              {t(locale, 'ns.qcName')} <span className="text-rose-600">*</span>
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t(locale, 'ns.qcFullNamePh')}
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
            <Label className="text-xs">{t(locale, 'ns.qcPhone')}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 809 555 1234"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              {t(locale, 'ns.qcPhoneHint')}
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t(locale, 'ns.qcEmail')}</Label>
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
            {t(locale, 'common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={submitting}>
            {submitting ? t(locale, 'ns.qcAdding') : t(locale, 'ns.qcAddCustomer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
