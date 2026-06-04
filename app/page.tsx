// GangaLoo landing / front door  —  route: /  (app/page.tsx)
// Server component, no client JS. Pure navigation into the rest of the site.
// "Tienda" -> /tienda (the store chooser that already exists).
// Other links (/ayuda, /club, /partners, /cotizador) get built in later steps.

import type { Metadata } from "next";
import Link from "next/link";
import { HomeInstallButton } from "./home-install-button";

export const metadata: Metadata = {
  title: "GangaLoo — Tu destino de compras",
  description:
    "GangaLoo — extensiones y pelucas de cabello de lujo en Sosúa, Puerto Plata. Dos sucursales: Maranatha y Montellano.",
};

const DESTINOS = [
  {
    href: "/tienda",
    titulo: "Tienda",
    desc: "Explora el catálogo y elige tu sucursal.",
    cta: "Comprar ahora",
    destacado: true,
  },
  {
    href: "/ayuda",
    titulo: "¿Cómo funciona?",
    desc: "Guía paso a paso para comprar con confianza.",
    cta: "Ver guía",
    destacado: false,
  },
  {
    href: "/club",
    titulo: "Club GangaLoo",
    desc: "Únete y obtén mejores precios y beneficios.",
    cta: "Unirme",
    destacado: false,
  },
  {
    href: "/partners",
    titulo: "Mayoreo y vendedores",
    desc: "Compra al por mayor o véndé con nosotros.",
    cta: "Más info",
    destacado: false,
  },
  {
    href: "/cotizador",
    titulo: "Cotizador",
    desc: "Calcula el precio de tu pedido al instante.",
    cta: "Calcular",
    destacado: false,
  },
];

const SUCURSALES = [
  {
    nombre: "GangaLoo Maranatha",
    direccion: "Calle Bella Vista, Maranatha, Rep. Dom.",
    horario: [
      { d: "Lun – Vie", h: "10:00 AM – 2:00 PM y 4:00 PM – 7:00 PM" },
      { d: "Sábado", h: "2:00 PM – 6:00 PM" },
      { d: "Domingo", h: "Cerrado" },
    ],
    tel: "+1 (829) 286-7868",
    wa: "18292867868",
    mapa: "https://www.google.com/maps?q=19.7299357,-70.5980177",
  },
  {
    nombre: "GangaLoo Montellano",
    direccion: "Pancho Mateo, Montellano, Rep. Dom.",
    horario: [{ d: "Lun – Dom", h: "9:00 AM – 7:00 PM" }],
    tel: "+1 (829) 841-7980",
    wa: "18298417980",
    mapa: "https://www.google.com/maps?q=19.7411172,-70.5228458",
  },
];

const REDES = [
  { nombre: "Instagram", href: "https://www.instagram.com/cellphonesella" },
  { nombre: "Facebook", href: "https://www.facebook.com/GangaLoo.Tienda" },
  { nombre: "TikTok", href: "https://www.tiktok.com/@gangaloo6" },
  { nombre: "YouTube", href: "https://www.youtube.com/@gangaloososua" },
];

const WHATSAPP =
  "https://wa.me/18292867868?text=Hola%2C%20tengo%20una%20pregunta%20sobre%20GangaLoo";

export default function HomePage() {
  return (
    <div className="gl-landing">
      <style>{glStyles}</style>

      {/* NAV */}
      <header className="gl-nav">
        <Link href="/" className="gl-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-g.png" alt="GangaLoo" className="gl-logo-img" />
          <span className="gl-brand-text">Ganga<span>Loo</span></span>
        </Link>
        <nav className="gl-nav-links">
          <Link href="/ayuda">Cómo funciona</Link>
          <Link href="/club">Club</Link>
          <Link href="/partners">Mayoreo</Link>
          <Link href="/panel" className="gl-nav-admin">Admin</Link>
          <Link href="/tienda" className="gl-nav-cta">
            Tienda
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="gl-hero">
        <div className="gl-hero-bg" aria-hidden="true" />
        <div className="gl-hero-grid" aria-hidden="true" />
        <div className="gl-hero-inner">
          <p className="gl-eyebrow gl-fade" style={{ animationDelay: "0.05s" }}>
            Sosúa · Puerto Plata · Rep. Dom.
          </p>
          <h1 className="gl-title gl-fade" style={{ animationDelay: "0.12s" }}>
            Ganga<span>Loo</span>
          </h1>
          <p className="gl-tagline gl-fade" style={{ animationDelay: "0.2s" }}>
            Extensiones y pelucas de cabello de lujo. Precios de ganga, calidad
            real.
          </p>
          <div className="gl-hero-cta gl-fade" style={{ animationDelay: "0.3s" }}>
            <Link href="/tienda" className="gl-btn gl-btn-primary">
              Ir a la tienda
            </Link>
            <Link href="/ayuda" className="gl-btn gl-btn-ghost">
              ¿Cómo funciona?
            </Link>
            <HomeInstallButton />
          </div>
        </div>
      </section>

      {/* DESTINOS */}
      <section className="gl-section">
        <h2 className="gl-h2">Explora</h2>
        <div className="gl-grid">
          {DESTINOS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className={`gl-card${d.destacado ? " gl-card-feature" : ""}`}
            >
              <h3>{d.titulo}</h3>
              <p>{d.desc}</p>
              <span className="gl-card-cta">{d.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* SUCURSALES */}
      <section className="gl-section">
        <h2 className="gl-h2">Nuestras sucursales</h2>
        <div className="gl-stores">
          {SUCURSALES.map((s) => (
            <div key={s.nombre} className="gl-store">
              <h3>{s.nombre}</h3>
              <p className="gl-store-addr">{s.direccion}</p>
              <div className="gl-store-hours">
                {s.horario.map((h) => (
                  <div key={h.d} className="gl-hours-row">
                    <span className="gl-hours-d">{h.d}</span>
                    <span className="gl-hours-h">{h.h}</span>
                  </div>
                ))}
              </div>
              <div className="gl-store-contact">
                <a
                  href={`https://wa.me/${s.wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gl-store-tel"
                >
                  📞 {s.tel}
                </a>
                <a
                  href={s.mapa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gl-store-map"
                >
                  Ver en mapa →
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACTO */}
      <section className="gl-contact">
        <h2 className="gl-h2">¿Tienes una pregunta?</h2>
        <p>Escríbenos por WhatsApp y con gusto te ayudamos.</p>
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="gl-btn gl-btn-wa"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Escribir por WhatsApp
        </a>
      </section>

      {/* FOOTER */}
      <footer className="gl-footer">
        <div className="gl-footer-redes">
          {REDES.map((r) => (
            <a key={r.nombre} href={r.href} target="_blank" rel="noopener noreferrer">
              {r.nombre}
            </a>
          ))}
        </div>
        <p className="gl-footer-links">
          <Link href="/returns">Política de Devoluciones</Link>
        </p>
        <p>© {new Date().getFullYear()} GangaLoo · Sosúa, Puerto Plata, Rep. Dom.</p>
      </footer>
    </div>
  );
}

const glStyles = `
.gl-landing{
  --gl-navy:#002D62; --gl-navy2:#1a4a8a; --gl-ink:#06101a;
  --gl-red:#CF142B; --gl-gold:#c8a84b; --gl-gold2:#e5c96a;
  --gl-cream:#f0f4ff; --gl-line:rgba(200,168,75,.25);
  background:var(--gl-ink); color:var(--gl-cream);
  min-height:100vh; width:100%;
}
.gl-landing a{ text-decoration:none; color:inherit; }
.gl-landing h1,.gl-landing h2,.gl-landing h3{ line-height:1.05; letter-spacing:-.01em; }

/* NAV */
.gl-nav{
  position:sticky; top:0; z-index:50;
  display:flex; align-items:center; justify-content:space-between;
  padding:0 5vw; height:64px;
  background:rgba(6,16,26,.85); backdrop-filter:blur(12px);
  border-bottom:1px solid var(--gl-line);
}
.gl-brand{ display:flex; align-items:center; gap:.55rem; font-size:1.5rem; font-weight:800; letter-spacing:1px; }
.gl-logo-img{ height:34px; width:34px; border-radius:7px; object-fit:cover; display:block; }
.gl-brand-text{ color:var(--gl-gold); }
.gl-brand-text span{ color:var(--gl-cream); }
.gl-nav-links{ display:flex; align-items:center; gap:1.5rem; }
.gl-nav-links a{ font-size:.85rem; font-weight:600; text-transform:uppercase; letter-spacing:.5px; opacity:.85; transition:opacity .15s,color .15s; }
.gl-nav-links a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-nav-cta{ background:var(--gl-red); color:#fff !important; padding:9px 18px; border-radius:3px; opacity:1 !important; }
.gl-nav-cta:hover{ background:#a50f22; color:#fff !important; }
@media (max-width:560px){
  .gl-nav-links a:not(.gl-nav-cta):not(.gl-nav-admin){ display:none; }
  .gl-nav{ padding:0 4vw; gap:.5rem; }
  .gl-brand{ font-size:1.15rem; white-space:nowrap; flex-shrink:0; }
  .gl-logo-img{ height:30px; width:30px; }
  .gl-nav-links{ gap:.75rem; flex-shrink:0; }
  .gl-nav-admin{ font-size:.72rem; }
  .gl-nav-cta{ padding:7px 12px; font-size:.72rem; }
}
@media (max-width:360px){
  .gl-brand-text{ display:none; }
}

/* HERO */
.gl-hero{ position:relative; overflow:hidden; background:var(--gl-navy); padding:clamp(80px,18vh,160px) 5vw clamp(64px,12vh,120px); text-align:center; }
.gl-hero-bg{ position:absolute; inset:0;
  background:
    radial-gradient(ellipse 80% 60% at 65% 40%, rgba(0,45,98,.6) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 8% 95%, rgba(207,20,43,.28) 0%, transparent 60%),
    radial-gradient(ellipse 45% 45% at 95% 5%, rgba(200,168,75,.18) 0%, transparent 60%);
}
.gl-hero-grid{ position:absolute; inset:0; opacity:.06;
  background-image:linear-gradient(rgba(200,168,75,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(200,168,75,.6) 1px,transparent 1px);
  background-size:60px 60px;
}
.gl-hero-inner{ position:relative; max-width:780px; margin:0 auto; }
.gl-eyebrow{ font-size:.8rem; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:var(--gl-gold2); margin-bottom:1.25rem; }
.gl-title{ font-size:clamp(3rem,12vw,6.5rem); font-weight:800; color:var(--gl-gold); margin:0; }
.gl-title span{ color:var(--gl-cream); }
.gl-tagline{ font-size:clamp(1rem,2.4vw,1.3rem); max-width:540px; margin:1.5rem auto 0; opacity:.85; line-height:1.5; }
.gl-hero-cta{ display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; margin-top:2.5rem; }

/* BUTTONS */
.gl-btn{ display:inline-flex; align-items:center; gap:.5rem; padding:14px 30px; border-radius:4px; font-size:.95rem; font-weight:700; letter-spacing:.3px; transition:transform .15s,background .15s,box-shadow .15s; }
.gl-btn:hover{ transform:translateY(-2px); }
.gl-btn-primary{ background:var(--gl-red); color:#fff; box-shadow:0 8px 24px rgba(207,20,43,.35); }
.gl-btn-primary:hover{ background:#a50f22; }
.gl-btn-ghost{ background:transparent; color:var(--gl-cream); border:1px solid var(--gl-line); }
.gl-btn-ghost:hover{ border-color:var(--gl-gold); color:var(--gl-gold2); }
.gl-btn-wa{ background:#25D366; color:#fff; box-shadow:0 8px 24px rgba(37,211,102,.3); }
.gl-btn-wa:hover{ background:#1da855; }

/* SECTIONS */
.gl-section{ max-width:1080px; margin:0 auto; padding:clamp(56px,9vh,90px) 5vw 0; }
.gl-h2{ font-size:clamp(1.4rem,4vw,2rem); font-weight:700; color:var(--gl-cream); margin-bottom:1.75rem; position:relative; padding-bottom:.6rem; }
.gl-h2::after{ content:""; position:absolute; left:0; bottom:0; width:48px; height:3px; background:var(--gl-red); border-radius:2px; }

/* DESTINOS GRID */
.gl-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }
.gl-card{ display:flex; flex-direction:column; gap:.5rem; padding:1.6rem 1.5rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); transition:transform .18s,border-color .18s,background .18s; }
.gl-card:hover{ transform:translateY(-4px); border-color:var(--gl-gold); background:rgba(200,168,75,.06); }
.gl-card h3{ font-size:1.15rem; font-weight:700; color:var(--gl-cream); }
.gl-card p{ font-size:.9rem; opacity:.7; line-height:1.5; flex:1; }
.gl-card-cta{ font-size:.85rem; font-weight:700; color:var(--gl-gold2); margin-top:.4rem; }
.gl-card-feature{ background:linear-gradient(150deg,rgba(207,20,43,.18),rgba(0,45,98,.25)); border-color:rgba(207,20,43,.45); }
.gl-card-feature:hover{ border-color:var(--gl-red); }
.gl-card-feature h3{ color:#fff; }

/* SUCURSALES */
.gl-stores{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1rem; }
.gl-store{ display:flex; flex-direction:column; gap:.55rem; padding:1.5rem 1.6rem; border-radius:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); }
.gl-store h3{ font-size:1.1rem; font-weight:800; color:var(--gl-gold); letter-spacing:.5px; }
.gl-store-addr{ font-size:.85rem; opacity:.7; line-height:1.4; }
.gl-store-hours{ display:flex; flex-direction:column; gap:.3rem; margin-top:.2rem; }
.gl-hours-row{ display:flex; gap:.6rem; font-size:.85rem; line-height:1.45; }
.gl-hours-d{ flex:0 0 84px; font-weight:700; color:var(--gl-cream); }
.gl-hours-h{ opacity:.82; }
.gl-store-contact{ display:flex; align-items:center; gap:1rem; flex-wrap:wrap; margin-top:.5rem; padding-top:.75rem; border-top:1px solid var(--gl-line); }
.gl-store-tel{ font-size:.88rem; font-weight:700; color:var(--gl-cream); }
.gl-store-tel:hover{ color:var(--gl-gold2); }
.gl-store-map{ font-size:.85rem; font-weight:700; color:var(--gl-gold2); white-space:nowrap; margin-left:auto; }
.gl-store-map:hover{ color:var(--gl-gold); }

/* CONTACTO */
.gl-contact{ max-width:1080px; margin:0 auto; padding:clamp(56px,9vh,90px) 5vw 0; text-align:center; }
.gl-contact p{ opacity:.75; margin:.5rem 0 1.75rem; }
.gl-contact .gl-h2{ display:inline-block; }
.gl-contact .gl-h2::after{ left:50%; transform:translateX(-50%); }

/* FOOTER */
.gl-footer{ margin-top:clamp(56px,9vh,90px); padding:2.5rem 5vw; border-top:1px solid var(--gl-line); text-align:center; }
.gl-footer-redes{ display:flex; gap:1.5rem; justify-content:center; flex-wrap:wrap; margin-bottom:1rem; }
.gl-footer-redes a{ font-size:.85rem; font-weight:600; opacity:.8; transition:opacity .15s,color .15s; }
.gl-footer-redes a:hover{ opacity:1; color:var(--gl-gold2); }
.gl-footer-links{ margin-bottom:.5rem; }
.gl-footer-links a{ font-size:.85rem; font-weight:600; color:var(--gl-gold2); opacity:.85; transition:opacity .15s; }
.gl-footer-links a:hover{ opacity:1; }
.gl-footer p{ font-size:.8rem; opacity:.5; }

/* LOAD ANIMATION */
.gl-fade{ opacity:0; transform:translateY(16px); animation:glFadeUp .6s ease forwards; }
@keyframes glFadeUp{ to{ opacity:1; transform:translateY(0); } }
@media (prefers-reduced-motion:reduce){ .gl-fade{ animation:none; opacity:1; transform:none; } }
`;
