// GangaLoo — Returns policy  —  route: /returns  (app/returns/page.tsx)
// Informational only (no form, no DB). Server component.

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Devoluciones — GangaLoo',
  description:
    'Cómo funciona el proceso de devolución en GangaLoo: plazo de 7 días, condiciones, métodos de devolución y reembolsos.',
}

const WA =
  'https://wa.me/18292867868?text=' +
  encodeURIComponent('Hola, quiero solicitar una devolución. Mi número de pedido es: ')

const CONDICIONES = [
  'Sin usar — en el mismo estado en que fue entregado',
  'En su empaque original, con etiquetas intactas',
  'Sin daños causados por el cliente',
  'Con comprobante de compra (número de pedido o factura)',
]

const PASOS = [
  { n: 1, t: 'Contáctanos', d: 'Escríbenos por WhatsApp dentro de los 7 días con tu número de pedido y el motivo de la devolución.' },
  { n: 2, t: 'Aprobación', d: 'Te confirmaremos si la devolución aplica y te daremos las instrucciones necesarias.' },
  { n: 3, t: 'Entrega del producto', d: 'Puedes traerlo a nuestra tienda en Sosúa, Puerto Plata, o enviarlo a tu costo por mensajería.' },
  { n: 4, t: 'Reembolso', d: 'Una vez recibido e inspeccionado, procesamos el reembolso en tu método de pago original. Los costos de envío no son reembolsables.' },
]

const METODOS = [
  'En tienda — visítanos en Sosúa, Puerto Plata (sin costo adicional)',
  'Por mensajería — el cliente corre con el costo del envío de regreso',
]

const REEMBOLSOS = [
  'El reembolso se realiza por el mismo método de pago original',
  'Los costos de envío originales no son reembolsables',
  'Cargo de reposición (restocking fee) del 10% sobre el valor del producto',
  'El reembolso se procesa en 3–5 días hábiles tras recibir el producto',
]

const EXCEPCIONES = [
  'Productos usados o con signos de uso',
  'Productos sin empaque original o con etiquetas removidas',
  'Solicitudes realizadas después de 7 días de la entrega',
  'Productos dañados por mal uso del cliente',
]

export default function ReturnsPage() {
  return (
    <div className="gl-returns">
      <style>{styles}</style>

      <header className="gl-nav">
        <Link href="/" className="gl-brand">Ganga<span>Loo</span></Link>
        <nav className="gl-nav-links">
          <Link href="/ayuda">Cómo funciona</Link>
          <Link href="/club">Club</Link>
          <Link href="/tienda" className="gl-nav-cta">Tienda</Link>
        </nav>
      </header>

      <section className="gl-hero">
        <div className="gl-hero-bg" aria-hidden="true" />
        <div className="gl-hero-inner">
          <p className="gl-eyebrow">Tu satisfacción es nuestra prioridad</p>
          <h1 className="gl-title">Política de <span>Devoluciones</span></h1>
          <p className="gl-tagline">Conoce cómo funciona nuestro proceso de devolución, paso a paso.</p>
        </div>
      </section>

      <section className="gl-section">
        <h2 className="gl-h2">Plazo de devolución</h2>
        <p className="gl-text">
          Tienes <strong>7 días calendario</strong> desde la fecha de entrega para solicitar
          una devolución. Pasado este plazo no se aceptarán solicitudes.
        </p>

        <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>Condiciones del producto</h2>
        <p className="gl-text">Para que la devolución sea aceptada, el producto debe cumplir con lo siguiente:</p>
        <ul className="gl-check">
          {CONDICIONES.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <p className="gl-warn">⚠️ No se aceptan devoluciones de productos usados, sin empaque, o con indicios de daño por uso.</p>

        <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>Cómo devolver un producto</h2>
        <div className="gl-steps">
          {PASOS.map((s) => (
            <div key={s.n} className="gl-step">
              <span className="gl-step-n">{s.n}</span>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>Métodos de devolución</h2>
        <ul className="gl-check">
          {METODOS.map((m) => <li key={m}>{m}</li>)}
        </ul>

        <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>Reembolsos</h2>
        <ul className="gl-check">
          {REEMBOLSOS.map((r) => <li key={r}>{r}</li>)}
        </ul>

        <h2 className="gl-h2" style={{ marginTop: '2.5rem' }}>Excepciones — no aplica devolución</h2>
        <ul className="gl-x">
          {EXCEPCIONES.map((e) => <li key={e}>{e}</li>)}
        </ul>

        <div className="gl-contact">
          <h3>¿Tienes alguna pregunta?</h3>
          <p>Nuestro equipo está disponible para ayudarte con tu devolución.</p>
          <a className="gl-btn gl-btn-wa" href={WA} target="_blank" rel="noopener noreferrer">
            Escribir por WhatsApp
          </a>
        </div>
      </section>

      <footer className="gl-footer">
        <p><Link href="/tienda">← Volver a la tienda</Link></p>
        <p style={{ opacity: 0.5 }}>© {new Date().getFullYear()} GangaLoo</p>
      </footer>
    </div>
  )
}

const styles = `
.gl-returns{
  --gl-navy:#002D62; --gl-navy2:#1a4a8a; --gl-ink:#06101a;
  --gl-red:#CF142B; --gl-gold:#c8a84b; --gl-gold2:#e5c96a;
  --gl-cream:#f0f4ff; --gl-line:rgba(200,168,75,.25);
  background:var(--gl-ink); color:var(--gl-cream); min-height:100vh; width:100%;
}
.gl-returns a{ text-decoration:none; color:inherit; }
.gl-returns h1,.gl-returns h2,.gl-returns h3{ line-height:1.1; letter-spacing:-.01em; }

.gl-nav{ position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:0 5vw; height:64px; background:rgba(6,16,26,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--gl-line); }
.gl-brand{ font-size:1.5rem; font-weight:800; letter-spacing:1px; color:var(--gl-gold); }
.gl-brand span{ color:var(--gl-cream); }
.gl-nav-links{ display:flex; align-items:center; gap:1.5rem; }
.gl-nav-links a{ font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; opacity:.85; transition:opacity .15s,color .15s; }
.gl-nav-links a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-nav-cta{ background:var(--gl-red); color:#fff !important; padding:9px 18px; border-radius:3px; opacity:1 !important; }
.gl-nav-cta:hover{ background:#a50f22; }
@media (max-width:560px){ .gl-nav-links a:not(.gl-nav-cta){ display:none; } }

.gl-hero{ position:relative; overflow:hidden; background:var(--gl-navy); padding:clamp(48px,11vh,100px) 5vw clamp(40px,8vh,80px); text-align:center; }
.gl-hero-bg{ position:absolute; inset:0; background:radial-gradient(ellipse 70% 60% at 60% 30%, rgba(26,74,138,.55) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 10% 100%, rgba(207,20,43,.25) 0%, transparent 60%), radial-gradient(ellipse 45% 45% at 95% 0%, rgba(200,168,75,.2) 0%, transparent 60%); }
.gl-hero-inner{ position:relative; max-width:720px; margin:0 auto; }
.gl-eyebrow{ font-size:.78rem; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--gl-gold2); margin-bottom:1rem; }
.gl-title{ font-size:clamp(2rem,7vw,3.6rem); font-weight:800; color:var(--gl-gold); margin:0; }
.gl-title span{ color:var(--gl-cream); }
.gl-tagline{ font-size:clamp(1rem,2.4vw,1.2rem); max-width:520px; margin:1.25rem auto 0; opacity:.85; line-height:1.5; }

.gl-section{ max-width:780px; margin:0 auto; padding:clamp(40px,7vh,68px) 5vw 0; }
.gl-h2{ font-size:clamp(1.3rem,3.6vw,1.8rem); font-weight:700; color:var(--gl-cream); margin-bottom:1rem; position:relative; padding-bottom:.55rem; }
.gl-h2::after{ content:""; position:absolute; left:0; bottom:0; width:44px; height:3px; background:var(--gl-red); border-radius:2px; }
.gl-text{ font-size:.95rem; line-height:1.65; opacity:.85; }

.gl-check{ list-style:none; padding:0; margin:.5rem 0 0; display:flex; flex-direction:column; gap:.6rem; }
.gl-check li{ position:relative; padding-left:1.6rem; font-size:.92rem; line-height:1.5; opacity:.88; }
.gl-check li::before{ content:"✓"; position:absolute; left:0; top:0; color:var(--gl-gold2); font-weight:800; }
.gl-x{ list-style:none; padding:0; margin:.5rem 0 0; display:flex; flex-direction:column; gap:.6rem; }
.gl-x li{ position:relative; padding-left:1.6rem; font-size:.92rem; line-height:1.5; opacity:.88; }
.gl-x li::before{ content:"✕"; position:absolute; left:0; top:0; color:var(--gl-red); font-weight:800; }

.gl-warn{ margin-top:1rem; font-size:.9rem; line-height:1.55; background:rgba(207,20,43,.1); border:1px solid rgba(207,20,43,.4); border-radius:10px; padding:.9rem 1.1rem; }

.gl-steps{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; }
.gl-step{ display:flex; gap:.9rem; padding:1.2rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
.gl-step-n{ flex-shrink:0; width:30px; height:30px; border-radius:50%; background:var(--gl-gold); color:#1a1205; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:.9rem; }
.gl-step h3{ font-size:1rem; font-weight:700; color:var(--gl-cream); margin-bottom:.25rem; }
.gl-step p{ font-size:.86rem; opacity:.72; line-height:1.5; }

.gl-contact{ margin-top:2.5rem; text-align:center; background:rgba(255,255,255,.03); border:1px solid var(--gl-line); border-radius:14px; padding:2rem 1.5rem; }
.gl-contact h3{ font-size:1.2rem; font-weight:700; color:var(--gl-cream); margin-bottom:.4rem; }
.gl-contact p{ font-size:.9rem; opacity:.75; margin-bottom:1.25rem; }

.gl-btn{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; padding:14px 28px; border-radius:4px; font-size:.95rem; font-weight:700; transition:transform .15s,background .15s; }
.gl-btn:hover{ transform:translateY(-2px); }
.gl-btn-wa{ background:#25D366; color:#fff; box-shadow:0 8px 24px rgba(37,211,102,.3); }
.gl-btn-wa:hover{ background:#1da855; }

.gl-footer{ margin-top:clamp(48px,8vh,80px); padding:2.25rem 5vw; border-top:1px solid var(--gl-line); text-align:center; }
.gl-footer p{ font-size:.85rem; opacity:.75; margin:.2rem 0; }
.gl-footer a{ color:var(--gl-gold2); font-weight:600; }
`
