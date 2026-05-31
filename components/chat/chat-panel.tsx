'use client'

// components/chat/chat-panel.tsx
//
// The GangaLoo virtual assistant UI, reskinned to the navy/gold brand theme.
// Reusable in two layouts:
//   variant="page"   -> full-screen chat (used by /chat)
//   variant="widget"  -> fills a floating panel (used by the bubble in Step 3)
// Posts the conversation to /api/chat (same origin) and reads { reply }.
// Styles are self-contained in a scoped <style> block (glc- prefix) so they
// never collide with the gl-* front-of-site pages.

import { useEffect, useRef, useState } from 'react'

type Role = 'user' | 'assistant'
type Msg = { role: Role; content: string }

type ChatPanelProps = {
  /** Store slug used for catalog + links. Defaults to maranatha. */
  warehouse?: string
  /** Layout: full-screen page or floating widget. */
  variant?: 'page' | 'widget'
  /** When provided (widget mode), shows a close button. */
  onClose?: () => void
}

const QUICK_REPLIES: { label: string; text: string; accent?: 'gold' | 'red' }[] = [
  { label: '🛍️ Pedir de Temu/Shein', text: '¿Cómo hago un pedido de Temu o Shein?' },
  { label: '👑 Club GangaLoo', text: '¿Qué es el Club GangaLoo y cuánto cuesta?', accent: 'gold' },
  { label: '💰 Ganar dinero', text: '¿Cómo puedo ganar dinero con GangaLoo?', accent: 'red' },
  { label: '💆 Ver pelucas', text: '¿Qué pelucas tienen disponibles y a qué precio?' },
  { label: '📍 Tiendas', text: '¿Dónde están ubicados y cuál es el horario?' },
]

const GREETING =
  '¡Hola! 👋 Soy la asistente virtual de GangaLoo. Puedo ayudarte con pedidos de Temu/Shein, pelucas y extensiones, el Club GangaLoo, cómo ganar dinero, y nuestras tiendas y horarios. ¿En qué te ayudo hoy?'

// Escape HTML, then turn URLs and wa.me links into clickable anchors and
// newlines into <br>. Returned string is injected via dangerouslySetInnerHTML.
function renderBubble(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener" class="glc-link">$1</a>',
    )
    .replace(
      /\b(wa\.me\/[^\s<]+)/g,
      '<a href="https://$1" target="_blank" rel="noopener" class="glc-link glc-wa">$1</a>',
    )
    .replace(/\n/g, '<br>')
}

export default function ChatPanel({
  warehouse = 'maranatha',
  variant = 'page',
  onClose,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [sending, setSending] = useState(false)
  const [started, setStarted] = useState(false)
  const [draft, setDraft] = useState('')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || sending) return
    setStarted(true)
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const next: Msg[] = [...messages, { role: 'user', content: clean }]
    setMessages(next)
    setSending(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, warehouse }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      const reply =
        data.reply && data.reply.trim()
          ? data.reply
          : 'Lo siento, tuve un problema. ¡Intenta de nuevo! 😊'
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content:
            'Tuve un problema técnico. Por favor intenta de nuevo en un momento 🙏',
        },
      ])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function onInputResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }

  return (
    <div className={`glc-root glc-${variant}`}>
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: CSS }}
      />

      <div className="glc-shell">
        {/* HEADER */}
        <div className="glc-header">
          <div className="glc-avatar">💆</div>
          <div className="glc-hinfo">
            <div className="glc-hname">Asistente GangaLoo</div>
            <div className="glc-hstatus">
              <span className="glc-dot" /> En línea
            </div>
          </div>
          {onClose ? (
            <button className="glc-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          ) : (
            <div className="glc-logo">GANGALOO</div>
          )}
        </div>

        {/* MESSAGES */}
        <div className="glc-messages" ref={scrollRef}>
          <div className="glc-datechip">Hoy</div>

          <div className="glc-msg glc-bot">
            <div className="glc-msgav">💆</div>
            <div
              className="glc-bubble"
              dangerouslySetInnerHTML={{ __html: renderBubble(GREETING) }}
            />
          </div>

          {messages.map((m, i) => (
            <div
              key={i}
              className={`glc-msg ${m.role === 'user' ? 'glc-user' : 'glc-bot'}`}
            >
              <div className="glc-msgav">{m.role === 'user' ? '👤' : '💆'}</div>
              <div
                className="glc-bubble"
                dangerouslySetInnerHTML={{ __html: renderBubble(m.content) }}
              />
            </div>
          ))}

          {sending ? (
            <div className="glc-msg glc-bot">
              <div className="glc-msgav">💆</div>
              <div className="glc-bubble glc-typing">
                <span /> <span /> <span />
              </div>
            </div>
          ) : null}
        </div>

        {/* QUICK REPLIES */}
        {!started ? (
          <div className="glc-quick">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q.label}
                className={`glc-qbtn${q.accent ? ' glc-' + q.accent : ''}`}
                onClick={() => send(q.text)}
              >
                {q.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* INPUT */}
        <div className="glc-inputbar">
          <div className="glc-inputrow">
            <textarea
              ref={inputRef}
              className="glc-textarea"
              rows={1}
              placeholder="Escribe tu pregunta..."
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                onInputResize(e.target)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            <button
              className="glc-send"
              onClick={() => send(draft)}
              disabled={sending}
              aria-label="Enviar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div className="glc-powered">
            Powered by{' '}
            <a href="/" className="glc-link">
              GangaLoo
            </a>{' '}
            · IA asistente
          </div>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.glc-root{
  --navy:#002D62; --navy2:#1a4a8a; --ink:#06101a;
  --red:#CF142B; --gold:#c8a84b; --gold2:#e5c96a;
  --cream:#f0f4ff; --line:rgba(200,168,75,.25);
  --text:var(--cream); --text2:rgba(240,244,255,.6);
  color:var(--text);
  font-family:var(--font-geist-sans,system-ui,sans-serif);
}
.glc-root *{box-sizing:border-box;}
.glc-page{
  position:fixed; inset:0; z-index:40;
  background:
    radial-gradient(60% 50% at 80% -10%, rgba(26,74,138,.55), transparent 60%),
    radial-gradient(50% 45% at 10% 110%, rgba(207,20,43,.18), transparent 60%),
    var(--ink);
}
.glc-widget{ position:absolute; inset:0; background:var(--ink); }
.glc-shell{
  position:relative; z-index:1;
  display:flex; flex-direction:column;
  height:100%; max-width:720px; margin:0 auto;
}
.glc-header{
  flex-shrink:0; display:flex; align-items:center; gap:14px;
  padding:16px 20px 14px;
  background:rgba(6,16,26,.85); backdrop-filter:blur(20px);
  border-bottom:1px solid var(--line);
}
.glc-avatar{
  width:46px; height:46px; flex-shrink:0; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:22px;
  background:linear-gradient(135deg,var(--gold),var(--gold2));
  box-shadow:0 0 20px rgba(200,168,75,.35);
}
.glc-hinfo{flex:1; min-width:0;}
.glc-hname{
  font-weight:600; letter-spacing:.02em; font-size:1.05rem;
  background:linear-gradient(90deg,var(--gold2),var(--gold));
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.glc-hstatus{display:flex; align-items:center; gap:6px; font-size:.78rem; color:var(--text2);}
.glc-dot{width:7px; height:7px; border-radius:50%; background:#46d17a; box-shadow:0 0 8px #46d17a;}
.glc-logo{font-weight:700; letter-spacing:.18em; font-size:.8rem; color:var(--gold);}
.glc-close{
  width:34px; height:34px; border-radius:50%; border:1px solid var(--line);
  background:rgba(255,255,255,.05); color:var(--text); font-size:14px;
  cursor:pointer; flex-shrink:0;
}
.glc-close:hover{background:rgba(255,255,255,.1);}
.glc-messages{
  flex:1; overflow-y:auto; padding:18px 16px 8px;
  display:flex; flex-direction:column; gap:12px;
}
.glc-messages::-webkit-scrollbar{width:4px;}
.glc-messages::-webkit-scrollbar-thumb{background:var(--line); border-radius:99px;}
.glc-datechip{
  align-self:center; font-size:.7rem; color:var(--text2);
  background:rgba(255,255,255,.05); border:1px solid var(--line);
  padding:3px 12px; border-radius:99px; margin-bottom:4px;
}
.glc-msg{display:flex; gap:10px; align-items:flex-end; max-width:88%;}
.glc-bot{align-self:flex-start;}
.glc-user{align-self:flex-end; flex-direction:row-reverse;}
.glc-msgav{
  width:30px; height:30px; flex-shrink:0; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:15px;
  background:rgba(255,255,255,.06); border:1px solid var(--line);
}
.glc-bubble{
  padding:11px 14px; border-radius:16px; line-height:1.45; font-size:.95rem;
  word-break:break-word; white-space:normal;
}
.glc-bot .glc-bubble{
  background:rgba(255,255,255,.06); border:1px solid var(--line);
  border-bottom-left-radius:5px;
}
.glc-user .glc-bubble{
  background:linear-gradient(135deg,var(--navy2),var(--navy));
  border:1px solid var(--line); color:var(--cream);
  border-bottom-right-radius:5px;
}
.glc-link{color:var(--gold2); text-underline-offset:2px;}
.glc-wa{color:#46d17a;}
.glc-typing{display:flex; gap:5px; align-items:center;}
.glc-typing span{
  width:7px; height:7px; border-radius:50%; background:var(--gold);
  opacity:.5; animation:glcbounce 1.2s infinite;
}
.glc-typing span:nth-child(2){animation-delay:.2s;}
.glc-typing span:nth-child(3){animation-delay:.4s;}
@keyframes glcbounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}
.glc-quick{
  flex-shrink:0; display:flex; flex-wrap:wrap; gap:8px;
  padding:6px 16px 10px;
}
.glc-qbtn{
  font:inherit; font-size:.82rem; cursor:pointer;
  padding:8px 13px; border-radius:99px; color:var(--cream);
  background:rgba(255,255,255,.05); border:1px solid var(--line);
}
.glc-qbtn:hover{background:rgba(255,255,255,.1);}
.glc-qbtn.glc-gold{border-color:var(--gold); color:var(--gold2);}
.glc-qbtn.glc-red{border-color:rgba(207,20,43,.5); color:#ff8a98;}
.glc-inputbar{
  flex-shrink:0; padding:12px 16px 14px;
  background:rgba(6,16,26,.85); backdrop-filter:blur(20px);
  border-top:1px solid var(--line);
}
.glc-inputrow{display:flex; gap:10px; align-items:flex-end;}
.glc-textarea{
  flex:1; resize:none; font:inherit; font-size:.95rem; color:var(--text);
  background:rgba(255,255,255,.05); border:1px solid var(--line);
  border-radius:18px; padding:11px 15px; max-height:100px; line-height:1.4;
  outline:none;
}
.glc-textarea::placeholder{color:var(--text2);}
.glc-textarea:focus{border-color:var(--gold);}
.glc-send{
  width:44px; height:44px; flex-shrink:0; border-radius:50%; border:none;
  cursor:pointer; color:var(--ink);
  display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,var(--gold2),var(--gold));
  box-shadow:0 0 16px rgba(200,168,75,.4);
}
.glc-send:disabled{opacity:.5; cursor:default;}
.glc-powered{text-align:center; font-size:.68rem; color:var(--text2); margin-top:8px;}
`
