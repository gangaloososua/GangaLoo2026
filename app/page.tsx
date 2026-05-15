import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { logout } from './actions'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Gangaloo Admin</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <form>
        <Button formAction={logout} variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  )
}