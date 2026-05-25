'use client'
// Round 26d — receive-transfer button + confirm dialog.
// Calls receiveTransfer (RPC enforces owner/admin or destination distributor).
// Round 36a — locale-aware (Spanish for the destination distributor).
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { receiveTransfer } from './actions'
import { tt } from '@/lib/i18n/transfers-i18n'
import type { Locale } from '@/lib/i18n/dictionary'
export function ReceiveTransferButton({
  transferId,
  toWarehouseName,
  size = 'sm',
  locale = 'en',
}: {
  transferId: string
  toWarehouseName: string
  size?: 'sm' | 'default'
  locale?: Locale
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  function doReceive() {
    startTransition(async () => {
      const res = await receiveTransfer(transferId)
      if (res.ok) {
        toast.success(tt(locale, 'tr.recv.toastDone'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }
  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => setOpen(true)}>
        <PackageCheck className="mr-1 h-4 w-4" />
        {tt(locale, 'tr.recv.button')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tt(locale, 'tr.recv.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tt(locale, 'tr.recv.bodyPre')} {toWarehouseName} {tt(locale, 'tr.recv.bodyPost')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{tt(locale, 'tr.recv.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                doReceive()
              }}
            >
              {pending ? tt(locale, 'tr.recv.doing') : tt(locale, 'tr.recv.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
