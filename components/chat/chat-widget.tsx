'use client'

// components/chat/chat-widget.tsx
//
// Floating chat launcher. Mounted once in the root layout; it decides for itself
// where to appear:
//   - shows ONLY on the landing page ("/") and store pages ("/tienda/...")
//   - hidden everywhere else (admin, login, /chat, etc.)
// On a store page it passes that store's slug to ChatPanel so the catalog and
// links match the store the visitor is browsing; on the landing page it defaults
// to Maranatha.

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import ChatPanel from '@/components/chat/chat-panel'

function showOn(pathname: string): boolean {
  if (pathname === '/') return true
  if (pathname === '/tienda' || pathname.startsWith('/tienda/')) return true
  return false
}

function warehouseFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean) // e.g. ['tienda','maranatha']
  if (parts[0] === 'tienda' && parts[1]) return parts[1]
  return 'maranatha'
}

export default function ChatWidget() {
  const pathname = usePathname() || '/'
  const [open, setOpen] = useState(false)

  if (!showOn(pathname)) return null
  const warehouse = warehouseFromPath(pathname)

  return (
    <div className="glw-root">
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: WCSS }}
      />
      {open ? (
        <div className="glw-panel" role="dialog" aria-label="Asistente GangaLoo">
          <ChatPanel
            warehouse={warehouse}
            variant="widget"
            onClose={() => setOpen(false)}
          />
        </div>
      ) : (
        <button
          className="glw-launch"
          onClick={() => setOpen(true)}
          aria-label="Abrir chat con la asistente"
        >
          💬
        </button>
      )}
    </div>
  )
}

const WCSS = `
.glw-root{ --gold:#c8a84b; --gold2:#e5c96a; --ink:#06101a; }
.glw-launch{
  position:fixed; right:18px; bottom:18px; z-index:50;
  width:60px; height:60px; border-radius:50%; border:none; cursor:pointer;
  font-size:26px; line-height:1; color:#06101a;
  display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,var(--gold2),var(--gold));
  box-shadow:0 8px 24px rgba(0,0,0,.4);
  animation:glwpulse 2.6s infinite;
  transition:transform .15s ease;
}
.glw-launch:hover{ transform:translateY(-2px); }
@keyframes glwpulse{
  0%{ box-shadow:0 8px 24px rgba(0,0,0,.4), 0 0 0 0 rgba(200,168,75,.5); }
  70%{ box-shadow:0 8px 24px rgba(0,0,0,.4), 0 0 0 16px rgba(200,168,75,0); }
  100%{ box-shadow:0 8px 24px rgba(0,0,0,.4), 0 0 0 0 rgba(200,168,75,0); }
}
.glw-panel{
  position:fixed; right:18px; bottom:18px; z-index:50;
  width:min(390px, calc(100vw - 24px));
  height:min(620px, calc(100dvh - 36px));
  border-radius:20px; overflow:hidden;
  border:1px solid rgba(200,168,75,.25);
  box-shadow:0 20px 60px rgba(0,0,0,.5);
  background:var(--ink);
}
@media (max-width:480px){
  .glw-panel{ right:8px; bottom:8px; width:calc(100vw - 16px); height:calc(100dvh - 16px); }
}
`
