// GangaLoo — Tarifas y cargos  —  route: /club/tarifas
//
// Public page linked from the "Tarjeta de débito virtual GRATIS" benefit on
// /club. Shows ALL of GangaLoo's fees: the virtual card service charges AND the
// order/import fees used by the Cotizador.
//
// ─────────────────────────────────────────────────────────────────────────
//  EDITA LAS TARIFAS AQUÍ  ·  EDIT THE FEES HERE
//  Card fees live in TARIFAS. Order/import fees live in PEDIDOS. To change a
//  number, edit it here and re-deliver this file. Nothing else needs touching.
//
//  NOTE: the PEDIDOS numbers mirror the Cotizador (app/cotizador/page.tsx). If
//  you change a fee in one place, change it in the other so they always agree.
// ─────────────────────────────────────────────────────────────────────────

import Link from 'next/link'

export const metadata = {
  title: 'Tarifas y cargos — Club GangaLoo',
}

const WA_BUSINESS = '18292867868'

// ── Virtual card service charges ──────────────────────────────────────────
const TARIFAS = {
  intro:
    'Tu Tarjeta Virtual GangaLoo es gratis. Al usarla para pagar en línea se aplican cargos de servicio por transacción, que dependen del tipo de tarjeta y de la moneda. Aquí te lo explicamos con claridad:',
  rows: [
    {
      tipo: 'Tarjetas UE / EEE',
      base: '1.5% + €0.25',
      extra: '+2% si hay conversión a USD',
      ejemplo: '≈ US$3.25 de cargo sobre US$100',
    },
    {
      tipo: 'Tarjetas premium UE',
      base: '1.9% + €0.25',
      extra: '+2% si hay conversión a USD',
      ejemplo: '≈ US$3.65 de cargo sobre US$100',
    },
    {
      tipo: 'Tarjetas fuera de la UE (ej. emitidas en EE.UU.)',
      base: '3.25% + €0.25',
      extra: '+2% si hay conversión a USD',
      ejemplo: '≈ US$5.50 de cargo sobre US$100',
    },
    {
      tipo: 'Contracargo / disputa',
      base: 'US$15 (equivalente)',
      extra: 'Fijo por cada disputa',
      ejemplo: 'Se aplica solo si se disputa un cargo',
    },
  ],
  notas: [
    'Sin cargos mensuales ni de suscripción — solo pagas por transacción.',
    'Cuando pagas en USD u otra moneda distinta al euro, se añade un 2% por conversión de moneda.',
    'Las tarifas pueden cambiar. Para conocer la tarifa exacta del momento, escríbenos por WhatsApp.',
  ],
  ejemploTitulo: 'Ejemplo práctico',
  ejemplo:
    'Si pagas US$100 con una tarjeta emitida fuera de la UE: se aplica 3.25% + €0.25 (~US$3.50) más un 2% por conversión (~US$2.00), para un cargo total aproximado de US$5.50.',
}

// ── Order / import fees (mirror the Cotizador) ─────────────────────────────
const PEDIDOS = {
  intro:
    'Cuando te traemos pedidos de Temu, Shein, Amazon, eBay, AliExpress y otras tiendas, aplicamos estos cargos. Varían según la tienda y el tamaño del pedido.',
  comision: {
    titulo: 'Comisión de servicio',
    desc: 'Según el tamaño de tu carrito (en USD):',
    tiers: [
      { rango: 'Hasta $30', pct: '15%' },
      { rango: '$30 – $50', pct: '12.5%' },
      { rango: '$50 – $100', pct: '10%' },
      { rango: '$100 – $150', pct: '8%' },
      { rango: '$150 – $200', pct: '7%' },
      { rango: 'Más de $200', pct: '6%' },
    ],
  },
  cargos: [
    {
      nombre: 'Cargo bancario',
      valor: '3%',
      detalle: 'Aplica en eBay, AliExpress y otras tiendas. No aplica en Temu, Shein ni Amazon.',
    },
    {
      nombre: 'Impuesto de importación',
      valor: '7%',
      detalle: 'Aplica en AliExpress y otras tiendas.',
    },
    {
      nombre: 'Cargo mínimo',
      valor: 'RD$150',
      detalle: 'En pedidos de Amazon menores de $35 USD.',
    },
    {
      nombre: 'Flete / envío',
      valor: 'RD$100 · ó RD$300/lb',
      detalle:
        'RD$100 fijo (Temu, Shein). RD$300 por libra, pagado al recibir (Amazon, eBay, AliExpress, otras).',
    },
    {
      nombre: 'Markup de tasa',
      valor: '+0.8%',
      detalle: 'Sobre la tasa de cambio del mercado USD → RD$.',
    },
  ],
  miembros: [
    {
      nombre: 'Cargo financiero (plan 50/50)',
      normal: 'Normal: +20% sobre el saldo restante',
      miembro: 'GRATIS — 0% para miembros del Club',
    },
    {
      nombre: 'Cobro a domicilio',
      normal: 'Normal: RD$200 para recoger el pago en tu dirección',
      miembro: 'GRATIS para miembros del Club',
    },
  ],
}

export default function TarifasPage() {
  const waContacto = `https://wa.me/${WA_BUSINESS}?text=${encodeURIComponent(
    'Hola, quiero conocer las tarifas actuales de GangaLoo.',
  )}`

  return (
    <div className="gl-tarifas">
      <style>{styles}</style>

      {/* NAV */}
      <header className="gl-nav">
        <Link href="/" className="gl-brand">
          Ganga<span>Loo</span>
        </Link>
        <nav className="gl-nav-links">
          <Link href="/club">Club</Link>
          <Link href="/cotizador">Cotizador</Link>
          <Link href="/tienda" className="gl-nav-cta">
            Tienda
          </Link>
        </nav>
      </header>

      <section className="gl-section">
        <p className="gl-eyebrow">Club GangaLoo</p>
        <h1 className="gl-h1">Tarifas y cargos</h1>
        <p className="gl-intro">
          Todo lo que cobramos, en un solo lugar: los cargos de la Tarjeta Virtual y los
          cargos de tus pedidos.
        </p>

        {/* ============ CARD FEES ============ */}
        <h2 className="gl-sec">💳 Tarjeta Virtual GangaLoo</h2>
        <p className="gl-sec-intro">{TARIFAS.intro}</p>

        <div className="gl-fees">
          {TARIFAS.rows.map((r) => (
            <div key={r.tipo} className="gl-fee">
              <h3 className="gl-fee-tipo">{r.tipo}</h3>
              <div className="gl-fee-lines">
                <div className="gl-fee-line">
                  <span className="gl-fee-k">Tarifa base</span>
                  <span className="gl-fee-v">{r.base}</span>
                </div>
                <div className="gl-fee-line">
                  <span className="gl-fee-k">Cargo adicional</span>
                  <span className="gl-fee-v">{r.extra}</span>
                </div>
                <div className="gl-fee-line">
                  <span className="gl-fee-k">Ejemplo</span>
                  <span className="gl-fee-v gl-fee-ex">{r.ejemplo}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <ul className="gl-notas">
          {TARIFAS.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>

        <div className="gl-ejemplo">
          <h3>{TARIFAS.ejemploTitulo}</h3>
          <p>{TARIFAS.ejemplo}</p>
        </div>

        {/* ============ ORDER FEES ============ */}
        <h2 className="gl-sec">📦 Cargos de pedidos</h2>
        <p className="gl-sec-intro">{PEDIDOS.intro}</p>

        {/* commission tiers */}
        <div className="gl-fee gl-fee-wide">
          <h3 className="gl-fee-tipo">{PEDIDOS.comision.titulo}</h3>
          <p className="gl-tiers-desc">{PEDIDOS.comision.desc}</p>
          <div className="gl-tiers">
            {PEDIDOS.comision.tiers.map((t) => (
              <div key={t.rango} className="gl-tier">
                <span className="gl-tier-r">{t.rango}</span>
                <span className="gl-tier-p">{t.pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* other order charges */}
        <div className="gl-fees">
          {PEDIDOS.cargos.map((c) => (
            <div key={c.nombre} className="gl-fee">
              <div className="gl-fee-line gl-fee-top">
                <h3 className="gl-fee-tipo gl-fee-tipo-inline">{c.nombre}</h3>
                <span className="gl-fee-v gl-fee-ex">{c.valor}</span>
              </div>
              <p className="gl-fee-detalle">{c.detalle}</p>
            </div>
          ))}
        </div>

        {/* member perks */}
        <div className="gl-perks">
          <div className="gl-perks-head">👑 Beneficios para miembros del Club</div>
          {PEDIDOS.miembros.map((m) => (
            <div key={m.nombre} className="gl-perk">
              <div className="gl-perk-name">{m.nombre}</div>
              <div className="gl-perk-normal">{m.normal}</div>
              <div className="gl-perk-member">{m.miembro}</div>
            </div>
          ))}
          <Link href="/club" className="gl-perks-cta">
            Únete al Club →
          </Link>
        </div>

        {/* CONTACT */}
        <div className="gl-cta-row">
          <a className="gl-btn gl-btn-wa" href={waContacto} target="_blank" rel="noopener noreferrer">
            Preguntar por WhatsApp
          </a>
          <Link className="gl-btn gl-btn-ghost" href="/club">
            ← Volver al Club
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="gl-footer">
        <p style={{ opacity: 0.5 }}>© {new Date().getFullYear()} GangaLoo</p>
      </footer>
    </div>
  )
}

const styles = `
.gl-tarifas{
  --gl-navy:#002D62; --gl-navy2:#1a4a8a; --gl-ink:#06101a;
  --gl-red:#CF142B; --gl-gold:#c8a84b; --gl-gold2:#e5c96a;
  --gl-cream:#f0f4ff; --gl-line:rgba(200,168,75,.25);
  background:var(--gl-ink); color:var(--gl-cream);
  min-height:100vh; width:100%;
}
.gl-tarifas a{ text-decoration:none; color:inherit; }
.gl-tarifas h1,.gl-tarifas h2,.gl-tarifas h3{ line-height:1.1; letter-spacing:-.01em; }

/* NAV */
.gl-nav{ position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:0 5vw; height:64px; background:rgba(6,16,26,.85); backdrop-filter:blur(12px); border-bottom:1px solid var(--gl-line); }
.gl-brand{ font-size:1.5rem; font-weight:800; letter-spacing:1px; color:var(--gl-gold); }
.gl-brand span{ color:var(--gl-cream); }
.gl-nav-links{ display:flex; align-items:center; gap:1.5rem; }
.gl-nav-links a{ font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; opacity:.85; transition:opacity .15s,color .15s; }
.gl-nav-links a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-nav-cta{ background:var(--gl-red); color:#fff !important; padding:9px 18px; border-radius:3px; opacity:1 !important; }
.gl-nav-cta:hover{ background:#a50f22; }
@media (max-width:560px){ .gl-nav-links a:not(.gl-nav-cta){ display:none; } }

/* SECTION */
.gl-section{ max-width:820px; margin:0 auto; padding:clamp(40px,7vh,72px) 5vw 0; }
.gl-eyebrow{ font-size:.78rem; font-weight:600; letter-spacing:2.5px; text-transform:uppercase; color:var(--gl-gold2); margin-bottom:.6rem; }
.gl-h1{ font-size:clamp(1.9rem,6vw,2.8rem); font-weight:800; color:var(--gl-gold); margin:0 0 1rem; }
.gl-intro{ font-size:1rem; line-height:1.6; opacity:.85; max-width:640px; margin-bottom:1rem; }

.gl-sec{ font-size:1.25rem; font-weight:800; color:var(--gl-cream); margin:2.5rem 0 .5rem; padding-bottom:.5rem; border-bottom:1px solid var(--gl-line); }
.gl-sec-intro{ font-size:.92rem; line-height:1.6; opacity:.8; margin-bottom:1.25rem; }

/* FEE CARDS */
.gl-fees{ display:grid; gap:1rem; }
@media (min-width:640px){ .gl-fees{ grid-template-columns:1fr 1fr; } }
.gl-fee{ padding:1.25rem 1.25rem; border-radius:14px; background:rgba(255,255,255,.03); border:1px solid var(--gl-line); }
.gl-fee-wide{ margin-bottom:1rem; }
.gl-fee-tipo{ font-size:1rem; font-weight:700; color:var(--gl-cream); margin-bottom:.85rem; }
.gl-fee-tipo-inline{ margin-bottom:0; }
.gl-fee-top{ display:flex; justify-content:space-between; gap:1rem; align-items:baseline; }
.gl-fee-lines{ display:flex; flex-direction:column; gap:.55rem; }
.gl-fee-line{ display:flex; justify-content:space-between; gap:1rem; align-items:baseline; }
.gl-fee-k{ font-size:.78rem; text-transform:uppercase; letter-spacing:.5px; opacity:.6; flex-shrink:0; }
.gl-fee-v{ font-size:.9rem; font-weight:600; text-align:right; }
.gl-fee-ex{ color:var(--gl-gold2); font-weight:700; }
.gl-fee-detalle{ font-size:.82rem; opacity:.72; line-height:1.5; margin:.6rem 0 0; }

/* COMMISSION TIERS */
.gl-tiers-desc{ font-size:.85rem; opacity:.75; margin-bottom:.85rem; }
.gl-tiers{ display:grid; grid-template-columns:1fr 1fr; gap:.5rem .9rem; }
@media (max-width:480px){ .gl-tiers{ grid-template-columns:1fr; } }
.gl-tier{ display:flex; justify-content:space-between; gap:1rem; padding:.5rem .75rem; border-radius:8px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); }
.gl-tier-r{ font-size:.85rem; opacity:.85; }
.gl-tier-p{ font-size:.9rem; font-weight:800; color:var(--gl-gold2); }

/* NOTES */
.gl-notas{ margin:1.5rem 0 0; padding-left:1.2rem; }
.gl-notas li{ font-size:.9rem; opacity:.8; line-height:1.65; }

/* EXAMPLE */
.gl-ejemplo{ margin-top:1.5rem; padding:1.25rem 1.4rem; border-radius:14px; background:linear-gradient(150deg,rgba(0,45,98,.35),rgba(6,16,26,.2)); border:1px solid var(--gl-line); }
.gl-ejemplo h3{ font-size:.95rem; font-weight:700; color:var(--gl-gold2); margin-bottom:.5rem; }
.gl-ejemplo p{ font-size:.9rem; line-height:1.6; opacity:.9; margin:0; }

/* MEMBER PERKS */
.gl-perks{ margin-top:1.5rem; padding:1.4rem; border-radius:16px; background:linear-gradient(135deg,rgba(200,168,75,.12),rgba(0,45,98,.18)); border:1px solid rgba(200,168,75,.45); }
.gl-perks-head{ font-size:1rem; font-weight:800; color:var(--gl-gold2); margin-bottom:1rem; }
.gl-perk{ padding:.85rem 0; border-top:1px solid rgba(200,168,75,.2); }
.gl-perk:first-of-type{ border-top:none; padding-top:0; }
.gl-perk-name{ font-size:.92rem; font-weight:700; color:var(--gl-cream); margin-bottom:.25rem; }
.gl-perk-normal{ font-size:.82rem; opacity:.6; text-decoration:line-through; }
.gl-perk-member{ font-size:.88rem; font-weight:700; color:var(--gl-gold2); margin-top:.15rem; }
.gl-perks-cta{ display:inline-block; margin-top:1rem; font-size:.85rem; font-weight:800; color:var(--gl-gold2); border-bottom:1px solid rgba(229,201,106,.4); }
.gl-perks-cta:hover{ color:var(--gl-gold); border-color:var(--gl-gold); }

/* BUTTONS */
.gl-cta-row{ display:flex; flex-wrap:wrap; gap:1rem; margin-top:2rem; }
.gl-btn{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; padding:13px 24px; border-radius:4px; font-size:.92rem; font-weight:700; letter-spacing:.3px; transition:transform .15s,background .15s; cursor:pointer; border:none; }
.gl-btn:hover{ transform:translateY(-2px); }
.gl-btn-wa{ background:#25D366; color:#fff; box-shadow:0 8px 24px rgba(37,211,102,.3); }
.gl-btn-wa:hover{ background:#1da855; }
.gl-btn-ghost{ background:transparent; color:var(--gl-cream); border:1px solid var(--gl-line); }
.gl-btn-ghost:hover{ border-color:var(--gl-gold); color:var(--gl-gold2); }

/* FOOTER */
.gl-footer{ margin-top:clamp(48px,8vh,80px); padding:2.25rem 5vw; border-top:1px solid var(--gl-line); text-align:center; }
.gl-footer p{ font-size:.85rem; opacity:.75; margin:.2rem 0; }
`
