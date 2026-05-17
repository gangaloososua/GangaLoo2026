import { Suspense } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { requireAdminCaller } from '@/lib/auth/guard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const caller = await requireAdminCaller()

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<aside className="w-60 border-r bg-background" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-y-auto">
        <div className="border-b bg-background">
          <div className="flex h-16 items-center justify-end px-6">
            <span className="text-sm text-muted-foreground">{caller.email}</span>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}
