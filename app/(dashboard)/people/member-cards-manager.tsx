'use client'

// Round 68b — membership cards UI on a customer's detail page (owner-facing).
//
// Lists the customer's linked cards, links a new one by serial (type or paste
// for now; tap-to-scan is a later add-on once physical cards arrive), and
// deactivates a lost/replaced card. All work goes through member-card-actions,
// which calls the Round 68a RPCs.

import { useState } from 'react'
import { toast } from 'sonner'
import { CreditCard, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { formatDate } from '@/lib/format'
import {
  type MemberCard,
  linkMemberCard,
  deactivateMemberCard,
} from './member-card-actions'

export function MemberCardsManager({
  customerId,
  initialCards,
  club,
}: {
  customerId: string
  initialCards: MemberCard[]
  club: { isMember: boolean; tier: string; memberNo: string | null; points: number }
}) {
  const [cards, setCards] = useState<MemberCard[]>(initialCards)
  const [uid, setUid] = useState('')
  const [label, setLabel] = useState('')
  const [linking, setLinking] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const activeCards = cards.filter((c) => c.is_active)
  const inactiveCards = cards.filter((c) => !c.is_active)

  async function doLink() {
    const serial = uid.trim()
    if (!serial) {
      toast.error('Enter the card serial number first.')
      return
    }
    setLinking(true)
    try {
      const res = await linkMemberCard(customerId, serial, label.trim() || null)
      if (res.ok) {
        setCards(res.cards)
        setUid('')
        setLabel('')
        if (res.status === 'already') {
          toast.info('That card is already linked to this customer.')
        } else {
          toast.success('Card linked.')
        }
      } else {
        toast.error(res.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link the card.')
    } finally {
      setLinking(false)
    }
  }

  async function doDeactivate(cardId: string) {
    setRemoving(true)
    try {
      const res = await deactivateMemberCard(customerId, cardId)
      if (res.ok) {
        setCards(res.cards)
        toast.success('Card deactivated.')
      } else {
        toast.error(res.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deactivate the card.')
    } finally {
      setRemoving(false)
      setConfirmId(null)
    }
  }

  const tierLabel = club.tier && club.tier !== 'none'
    ? club.tier.charAt(0).toUpperCase() + club.tier.slice(1)
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Membership cards
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {club.isMember ? 'Club member' : 'Not a club member yet'}
          {tierLabel ? ` · ${tierLabel}` : ''}
          {club.memberNo ? ` · #${club.memberNo}` : ''}
          {` · ${club.points} ${club.points === 1 ? 'point' : 'points'}`}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Existing cards */}
        {activeCards.length === 0 && inactiveCards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards linked yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {[...activeCards, ...inactiveCards].map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.label || 'Card'}
                    </span>
                    {c.is_active ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {c.card_uid}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Linked {formatDate(c.created_at)}
                  </div>
                </div>
                {c.is_active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setConfirmId(c.id)}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Link a new card */}
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs" htmlFor="card-uid">Card serial number</Label>
              <Input
                id="card-uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="e.g. 04:1A:2B:3C:4D:5E"
                autoComplete="off"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs" htmlFor="card-label">Label (optional)</Label>
              <Input
                id="card-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Green card"
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              onClick={() => void doLink()}
              disabled={linking}
              className="sm:shrink-0"
            >
              <Plus className="mr-1 h-4 w-4" />
              {linking ? 'Linking…' : 'Link card'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Type or paste the card&apos;s serial number for now. Tap-to-scan will be
            added once your NFC cards arrive.
          </p>
        </div>
      </CardContent>

      {/* Deactivate confirm */}
      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this card?</AlertDialogTitle>
            <AlertDialogDescription>
              The card will stop working at the POS. Use this for a lost or replaced
              card. You can always link a new card to this customer afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault()
                if (confirmId) void doDeactivate(confirmId)
              }}
            >
              {removing ? 'Deactivating…' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
