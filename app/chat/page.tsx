// app/chat/page.tsx
//
// Full-page virtual assistant at /chat. Renders the shared ChatPanel in
// full-screen ("page") mode, defaulting to the Maranatha store for catalog and
// links. (This route is made public in Step 4 so logged-out visitors can use it.)

import ChatPanel from '@/components/chat/chat-panel'

export const metadata = {
  title: 'Asistente Virtual · GangaLoo',
  description:
    'Chatea con la asistente virtual de GangaLoo: pedidos de Temu y Shein, pelucas y extensiones, Club GangaLoo, y nuestras tiendas.',
}

export default function ChatPage() {
  return <ChatPanel warehouse="maranatha" variant="page" />
}
