'use client'
// Round 77a — cancel-transfer button + confirm dialog.
// Only shown to owner/admin (the RPC enforces this too). Reverses a shipment
// that never actually left: puts the exact quantities back into the exact
// source lots and flips the transfer to cancelled. Only valid while the
// transfer is still in_transit.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cancelTransfer } from './actions'
import { tt } from '@/lib/i18n/transfers-i18n'
import type { Locale } from '@/lib/i18n/dictionary'

export function CancelTransferButton({
  transferId,
  fromWarehouseName,
  size = 'sm',
  locale = 'en',
}: {
  transferId: string
  fromWarehouseName: string
  size?: 'sm' | 'default'
  locale?: Locale
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  function doCancel() {
    startTransition(async () => {
      const res = await cancelTransfer(transferId, reason.trim() || null)
      if (res.ok) {
        toast.success(tt(locale, 'tr.cancel.toastDone'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error || tt(locale, 'tr.cancel.toastFailed'))
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        className="text-rose-700 hover:text-rose-800"
        onClick={() => setOpen(true)}
      >
        <Undo2 className="mr-1 h-4 w-4" />
        {tt(locale, 'tr.cancel.button')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt(locale, 'tr.cancel.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tt(locale, 'tr.cancel.bodyPre')} {fromWarehouseName} {tt(locale, 'tr.cancel.bodyPost')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">{tt(locale, 'tr.cancel.reasonLabel')}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={tt(locale, 'tr.cancel.reasonPh')}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{tt(locale, 'tr.cancel.keep')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                doCancel()
              }}
            >
              {pending ? tt(locale, 'tr.cancel.doing') : tt(locale, 'tr.cancel.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
