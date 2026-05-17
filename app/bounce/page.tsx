import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

async function signOut() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default function BouncePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            This is the Gangaloo admin app
          </h1>
          <p className="text-sm text-muted-foreground">
            Your account is a customer account. The admin app is for staff only.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <p>
            To view your orders, loyalty points, and profile, please go to the
            Gangaloo store:
          </p>
          
            href="https://gangaloo.club"
            className="block text-base font-medium text-primary underline underline-offset-4"
          >
            gangaloo.club
          </a>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  )
}
