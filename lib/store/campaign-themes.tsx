// lib/store/campaign-themes.tsx
//
// Round 90: storefront looks for seasonal campaigns (see lib/campaigns.ts).
// The storefront's CampaignSection draws every season listed here with the
// same layout (title, "up to -X%" badge, countdown, product grid, "see more"
// button, bottom stripe); only the colours, font, texts and decorations
// change. Halloween keeps its own original drawing in store-page.tsx.
//
// TO ADD A SEASON'S LOOK: copy one entry below, change its key to the
// campaign id from lib/campaigns.ts, and adjust colours / texts / pictures.
// A campaign without an entry here still shows, in a plain box.
//
// Everything here is display only. Positions are fixed numbers (no random
// values) so the server and the browser draw exactly the same thing.

import type { CSSProperties, ReactNode } from 'react'
import type { Locale } from '@/lib/i18n/shop'

export type CampaignThemeText = {
  title: string
  sub: string
  upTo: string
  more: string
  less: string
}

export type CampaignTheme = {
  text: Record<Locale, CampaignThemeText>
  /** Google Fonts css URL for the title font (optional). */
  fontUrl?: string
  /** CSS for the title (font, size, colour, glow, animation). */
  titleStyle: CSSProperties
  /** Extra CSS (keyframes + classes used by the decorations). */
  css: string
  /** Box background. */
  background: string
  subColor: string
  badge: { bg: string; color: string }
  /** Countdown + "see more" button colour. */
  accent: string
  accentText: string
  glow: string
  /** Glow ring around each product card. */
  cardShadow: string
  /** Thin stripe under the box (CSS background), or null. */
  stripe: string | null
  /** Small picture next to the title. */
  icon: () => ReactNode
  /** Pictures layered behind the content (absolute positioned). */
  decorations: () => ReactNode
  /** Row of small pictures under the products (optional). */
  footer?: () => ReactNode
}

// Shared CSS: every animation stops for visitors who ask for less motion.
const REDUCED = (classes: string) =>
  `@media (prefers-reduced-motion: reduce) { ${classes} { animation: none !important } }`

/* ------------------------------------------------------------------ */
/* BLACK FRIDAY: black + gold                                          */
/* ------------------------------------------------------------------ */

function ShoppingBag({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 16v-3a7 7 0 0 1 14 0v3" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M9 16h30l-2.5 26H11.5z" fill="#111" stroke="#fbbf24" strokeWidth="2" />
      <text x="24" y="36" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fbbf24" fontFamily="Arial, sans-serif">%</text>
    </svg>
  )
}

function PriceTag({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} style={style} aria-hidden="true">
      <path d="M2 4h44l16 16-16 16H2z" fill="#fbbf24" opacity="0.92" />
      <circle cx="47" cy="20" r="3.5" fill="#111" />
      <text x="22" y="27" textAnchor="middle" fontSize="20" fontWeight="900" fill="#111" fontFamily="Arial, sans-serif">%</text>
    </svg>
  )
}

function Sparkle({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d="M12 0l2.2 9.8L24 12l-9.8 2.2L12 24l-2.2-9.8L0 12l9.8-2.2z" fill="#fde68a" />
    </svg>
  )
}

const blackfriday: CampaignTheme = {
  text: {
    es: {
      title: 'BLACK FRIDAY',
      sub: 'Los precios más bajos del año en productos seleccionados',
      upTo: 'Hasta',
      more: 'Ver más ofertas',
      less: 'Ver menos',
    },
    en: {
      title: 'BLACK FRIDAY',
      sub: 'Our lowest prices of the year on selected products',
      upTo: 'Up to',
      more: 'See more deals',
      less: 'See less',
    },
  },
  fontUrl: 'https://fonts.googleapis.com/css2?family=Anton&display=swap',
  titleStyle: {
    fontFamily: "'Anton', var(--font-display), Impact, sans-serif",
    letterSpacing: '0.04em',
    backgroundImage: 'linear-gradient(90deg, #b8860b 0%, #fde68a 25%, #fbbf24 50%, #fde68a 75%, #b8860b 100%)',
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    filter: 'drop-shadow(0 0 12px rgba(251,191,36,.45)) drop-shadow(0 2px 0 #000)',
  },
  css: `
    @keyframes bfshine { 0% { background-position: 0% center } 100% { background-position: 200% center } }
    @keyframes bftwinkle { 0%,100% { opacity: .15; transform: scale(.6) } 50% { opacity: 1; transform: scale(1) } }
    @keyframes bfswing { 0%,100% { transform: rotate(-10deg) } 50% { transform: rotate(8deg) } }
    @keyframes bfbob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
    .cmp-title { animation: bfshine 5s linear infinite }
    .bf-tw1 { animation: bftwinkle 2.4s ease-in-out infinite }
    .bf-tw2 { animation: bftwinkle 3.1s ease-in-out .8s infinite }
    .bf-tw3 { animation: bftwinkle 2.7s ease-in-out 1.6s infinite }
    .bf-swing { transform-origin: 90% 50%; animation: bfswing 4s ease-in-out infinite }
    .cmp-icon { animation: bfbob 3s ease-in-out infinite }
    ${REDUCED('.cmp-title, .bf-tw1, .bf-tw2, .bf-tw3, .bf-swing, .cmp-icon')}
  `,
  background: 'linear-gradient(160deg, #050505 0%, #141414 55%, #2a2109 100%)',
  subColor: '#e7e5e4',
  badge: { bg: '#dc2626', color: '#ffffff' },
  accent: '#fbbf24',
  accentText: '#111111',
  glow: 'rgba(251,191,36,.5)',
  cardShadow: '0 0 0 1.5px rgba(251,191,36,.6), 0 8px 24px -10px rgba(251,191,36,.5)',
  stripe: 'repeating-linear-gradient(45deg, #111 0 10px, #fbbf24 10px 20px)',
  icon: () => <ShoppingBag size={46} />,
  decorations: () => (
    <>
      {/* gold light beams */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ right: -60, top: -80, width: 70, height: 320, transform: 'rotate(35deg)', background: 'linear-gradient(180deg, rgba(251,191,36,0), rgba(251,191,36,.18), rgba(251,191,36,0))' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ right: 60, top: -90, width: 26, height: 300, transform: 'rotate(35deg)', background: 'linear-gradient(180deg, rgba(251,191,36,0), rgba(251,191,36,.12), rgba(251,191,36,0))' }}
      />
      {/* price tags: wider screens only, so they never cover the title on phones */}
      <PriceTag className="bf-swing hidden sm:block" style={{ position: 'absolute', right: 20, top: 10, width: 54, pointerEvents: 'none' }} />
      <PriceTag className="bf-swing hidden sm:block" style={{ position: 'absolute', right: 125, top: 14, width: 34, opacity: 0.7, pointerEvents: 'none' }} />
      <Sparkle className="bf-tw1" style={{ position: 'absolute', left: '38%', top: 14, width: 14, pointerEvents: 'none' }} />
      <Sparkle className="bf-tw2" style={{ position: 'absolute', left: '58%', top: 40, width: 10, pointerEvents: 'none' }} />
      <Sparkle className="bf-tw3" style={{ position: 'absolute', left: 14, top: 12, width: 12, pointerEvents: 'none' }} />
    </>
  ),
}

/* ------------------------------------------------------------------ */
/* CHRISTMAS: green + red, snow, lights                                */
/* ------------------------------------------------------------------ */

function Tree({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 3l2.4 4.8 5.3.8-3.8 3.7.9 5.3L24 15.1l-4.8 2.5.9-5.3-3.8-3.7 5.3-.8z" fill="#facc15" />
      <path d="M24 12L12 28h7l-9 12h28l-9-12h7z" fill="#16a34a" />
      <rect x="21" y="40" width="6" height="6" rx="1" fill="#78350f" />
      <circle cx="20" cy="25" r="1.8" fill="#ef4444" />
      <circle cx="28" cy="31" r="1.8" fill="#facc15" />
      <circle cx="18" cy="35" r="1.8" fill="#60a5fa" />
      <circle cx="30" cy="37" r="1.8" fill="#ef4444" />
    </svg>
  )
}

function Gift({ size = 26, box = '#dc2626', ribbon = '#facc15' }: { size?: number; box?: string; ribbon?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="12" width="24" height="17" rx="2" fill={box} />
      <rect x="2" y="9" width="28" height="6" rx="1.5" fill={box} />
      <rect x="14" y="9" width="4" height="20" fill={ribbon} />
      <path d="M16 9c-3-6-9-5-7-1 1 2 5 1 7 1zM16 9c3-6 9-5 7-1-1 2-5 1-7 1z" fill={ribbon} />
    </svg>
  )
}

// Fixed snowflake positions (left %, size px, fall seconds, delay seconds).
const SNOW: Array<[number, number, number, number]> = [
  [4, 6, 9, 0], [11, 4, 12, 3], [19, 7, 10, 6], [27, 5, 13, 1], [35, 4, 11, 7],
  [43, 6, 9.5, 4], [51, 5, 12.5, 2], [59, 7, 10.5, 8], [67, 4, 11.5, 5], [75, 6, 9, 1.5],
  [83, 5, 12, 6.5], [91, 7, 10, 3.5], [97, 4, 13, 0.5],
]
const LIGHTS = ['#ef4444', '#facc15', '#22c55e', '#60a5fa']

const christmas: CampaignTheme = {
  text: {
    es: {
      title: 'Especial de Navidad',
      sub: 'Regalos con descuento en productos seleccionados',
      upTo: 'Hasta',
      more: 'Ver más ofertas',
      less: 'Ver menos',
    },
    en: {
      title: 'Christmas Special',
      sub: 'Gift-worthy savings on selected products',
      upTo: 'Up to',
      more: 'See more deals',
      less: 'See less',
    },
  },
  fontUrl: 'https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&display=swap',
  titleStyle: {
    fontFamily: "'Mountains of Christmas', var(--font-display), cursive",
    fontWeight: 700,
    color: '#ffffff',
    textShadow: '0 0 14px rgba(254,202,202,.65), 0 2px 0 #7f1d1d',
  },
  css: `
    @keyframes xsnow { 0% { transform: translateY(-20px) } 100% { transform: translateY(520px) } }
    @keyframes xsway { 0%,100% { margin-left: 0 } 50% { margin-left: 12px } }
    @keyframes xlight { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
    @keyframes xbob { 0%,100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-4px) rotate(-3deg) } }
    .x-flake { position: absolute; top: -12px; border-radius: 9999px; background: #fff; opacity: .85; animation-name: xsnow, xsway; animation-timing-function: linear, ease-in-out; animation-iteration-count: infinite, infinite }
    .x-light { animation: xlight 1.6s ease-in-out infinite }
    .cmp-icon { animation: xbob 3s ease-in-out infinite }
    ${REDUCED('.x-flake, .x-light, .cmp-icon')}
    @media (prefers-reduced-motion: reduce) { .x-flake { display: none } }
  `,
  background: 'linear-gradient(160deg, #052e16 0%, #14532d 55%, #7f1d1d 100%)',
  subColor: '#dcfce7',
  badge: { bg: '#facc15', color: '#422006' },
  accent: '#ef4444',
  accentText: '#ffffff',
  glow: 'rgba(239,68,68,.5)',
  cardShadow: '0 0 0 1.5px rgba(250,204,21,.6), 0 8px 24px -10px rgba(239,68,68,.55)',
  stripe: 'repeating-linear-gradient(45deg, #ffffff 0 8px, #dc2626 8px 16px)',
  icon: () => <Tree size={48} />,
  decorations: () => (
    <>
      {/* string of lights along the top */}
      <svg
        aria-hidden="true"
        viewBox="0 0 400 24"
        preserveAspectRatio="none"
        className="pointer-events-none absolute left-0 top-0 w-full"
        style={{ height: 22 }}
      >
        <path d="M0 4 Q50 18 100 4 T200 4 T300 4 T400 4" stroke="#1f2937" strokeWidth="1.5" fill="none" />
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex w-full justify-around" style={{ paddingTop: 6 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="x-light"
            style={{
              width: 7,
              height: 10,
              borderRadius: 9999,
              background: LIGHTS[i % LIGHTS.length],
              boxShadow: `0 0 8px ${LIGHTS[i % LIGHTS.length]}`,
              animationDelay: `${(i % 4) * 0.4}s`,
              marginTop: i % 2 === 0 ? 4 : 9,
            }}
          />
        ))}
      </div>
      {/* falling snow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {SNOW.map(([left, size, dur, delay], i) => (
          <span
            key={i}
            className="x-flake"
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              animationDuration: `${dur}s, ${dur / 3}s`,
              animationDelay: `-${delay}s, -${delay}s`,
            }}
          />
        ))}
      </div>
    </>
  ),
  footer: () => (
    <>
      <Gift size={22} />
      <Gift size={28} box="#16a34a" ribbon="#ef4444" />
      <Gift size={22} box="#facc15" ribbon="#dc2626" />
    </>
  ),
}

/* ------------------------------------------------------------------ */

export const CAMPAIGN_THEMES: Record<string, CampaignTheme> = {
  blackfriday,
  christmas,
}
