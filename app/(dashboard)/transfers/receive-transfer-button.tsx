'use client'

// Round 26d — receive-transfer button + confirm dialog.
// Calls receiveTransfer (RPC enforces owner/admin or destination distributor).

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

export function ReceiveTransferButton({
  transferId,
  toWarehouseName,
  size = 'sm',
}: {
  transferId: string
  toWarehouseName: string
  size?: 'sm' | 'default'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function doReceive() {
    startTransition(async () => {
      const res = await receiveTransfer(transferId)
      if (res.ok) {
        toast.success('Transfer received — stock added to the destination.')
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
        Receive
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive this transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              This confirms the stock arrived at {toWarehouseName} and adds it to that
              warehouse&apos;s inventory at the same cost it left with. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault()
                doReceive()
              }}
            >
              {pending ? 'Receiving…' : 'Receive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
