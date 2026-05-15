'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navItems } from '@/lib/nav'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/actions'
import { LogOut } from 'lucide-react'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Gangaloo Control
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <form>
          <Button
            formAction={logout}
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}