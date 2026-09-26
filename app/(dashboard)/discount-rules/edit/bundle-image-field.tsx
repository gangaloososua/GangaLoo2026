'use client'

// Round 85d — Bundle picture field.
//
// Two modes:
//  - ruleId set (edit page): uploads / removes straight away.
//  - ruleId null (new bundle form): just holds the chosen file and shows a
//    preview; the form uploads it right after the bundle is created.

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { uploadBundleImage, removeBundleImage } from '../actions'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 4.5 * 1024 * 1024

type Props = {
  ruleId: string | null
  initialUrl: string | null
  // New-bundle mode only: tells the form which file to upload after create.
  onPendingFile?: (file: File | null) => void
}

export function BundleImageField({ ruleId, initialUrl, onPendingFile }: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Free the local preview when it changes / on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (!ALLOWED.includes(file.type)) {
      toast.error('Please pick a JPG, PNG, WEBP or GIF picture.')
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error('Picture must be smaller than 4.5 MB.')
      return
    }

    if (!ruleId) {
      setPreviewUrl(URL.createObjectURL(file))
      onPendingFile?.(file)
      return
    }

    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('rule_id', ruleId)
      fd.append('file', file)
      const res = await uploadBundleImage(fd)
      if (res.ok) {
        setUrl(res.imageUrl)
        toast.success('Picture saved.')
      } else {
        toast.error(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    if (!ruleId) {
      setPreviewUrl(null)
      onPendingFile?.(null)
      return
    }
    setBusy(true)
    try {
      const res = await removeBundleImage(ruleId)
      if (res.ok) {
        setUrl(null)
        toast.success('Picture removed.')
      } else {
        toast.error(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const shown = ruleId ? url : previewUrl

  return (
    <div className="space-y-2">
      <Label className="text-xs">Bundle picture (optional)</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Bundle" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onPick}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            {busy ? 'Uploading…' : shown ? 'Change picture' : 'Add picture'}
          </Button>
          {shown ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remove
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Shown on the online store with the bundle. JPG, PNG, WEBP or GIF,
            up to 4.5 MB. A square picture looks best.
          </p>
        </div>
      </div>
    </div>
  )
}
