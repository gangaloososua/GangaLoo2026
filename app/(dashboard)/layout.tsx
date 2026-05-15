import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="border-b bg-background">
          <div className="flex h-16 items-center justify-end px-6">
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}