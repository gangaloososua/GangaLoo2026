"use client";

// GangaLoo Cotizador de Pedidos  —  route: /cotizador  (app/cotizador/page.tsx)
// Faithful rebuild of the LIVE calculator that was embedded in the old landing page.
// Single client component so it's a simple one-file drop-in. Fetches the USD->DOP
// market rate in the browser (3 fallback APIs) and adds a 0.8% markup, exactly like
// the old version. Mobile-first.
//
// ─── Settings you can change ────────────────────────────────────────────────
// All the money rules live in STORE_RULES, COMMISSION_TIERS, and the constants
// below — edit those numbers to change what you charge.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const RATE_MARKUP = 1.008; // +0.8% on the fetched market rate
const FALLBACK_RATE = 61.5; // used only if all rate APIs fail
const FLETE_PER_LB = 300; // RD$ per pound (delivery stores)
const FINANCING_PCT = 0.2; // +20% on the remaining balance (pay-in-two)
const DELIVERY_FEE = 200; // RD$ home-collection note
const BUSINESS_WA = "18292867868"; // quote is sent here

type Rules = {
  bank: number;
  tax: number;
  fleteAtDelivery: boolean;
  ship: number;
  minFee: number;
  minFeeThresholdUSD: number;
};

const STORES = ["Temu", "Shein", "Amazon", "eBay", "AliExpress", "Otra"] as const;
type Store = (typeof STORES)[number];

const STORE_RULES: Record<Store, Rules> = {
  Temu: { bank: 0, tax: 0, fleteAtDelivery: false, ship: 100, minFee: 0, minFeeThresholdUSD: 0 },
  Shein: { bank: 0, tax: 0, fleteAtDelivery: false, ship: 100, minFee: 0, minFeeThresholdUSD: 0 },
  Amazon: { bank: 0, tax: 0, fleteAtDelivery: true, ship: 0, minFee: 150, minFeeThresholdUSD: 35 },
  eBay: { bank: 3, tax: 0, fleteAtDelivery: true, ship: 0, minFee: 0, minFeeThresholdUSD: 0 },
  AliExpress: { bank: 3, tax: 7, fleteAtDelivery: true, ship: 0, minFee: 0, minFeeThresholdUSD: 0 },
  Otra: { bank: 3, tax: 7, fleteAtDelivery: true, ship: 0, minFee: 0, minFeeThresholdUSD: 0 },
};

// Service commission, tiered by USD cart size.
function getCommission(subtotalUSD: number): number {
  if (subtotalUSD <= 30) return 15;
  if (subtotalUSD <= 50) return 12.5;
  if (subtotalUSD <= 100) return 10;
  if (subtotalUSD <= 150) return 8;
  if (subtotalUSD <= 200) return 7;
  return 6;
}

const roundUp25 = (n: number) => Math.ceil(n / 25) * 25;
const fmt = (n: number) =>
  "RD$ " + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CotizadorPage() {
  const [store, setStore] = useState<Store>("Temu");
  const [rate, setRate] = useState<string>(String(FALLBACK_RATE));
  const [rateSource, setRateSource] = useState<string>("Cargando tasa…");
  const [usd, setUsd] = useState<string>("");
  const [dop, setDop] = useState<string>("");
  const [lbs, setLbs] = useState<string>("");
  const [payMode, setPayMode] = useState<"full" | "half">("full");
  const [adelanto, setAdelanto] = useState<string>("");
  const [adelantoTouched, setAdelantoTouched] = useState(false);

  useEffect(() => {
    document.title = "Cotizador de Pedidos — GangaLoo";
  }, []);

  // Fetch the market rate in the browser, 3 fallbacks, +0.8% markup.
  useEffect(() => {
    let cancelled = false;
    const apis: Array<() => Promise<number>> = [
      async () => (await (await fetch("https://open.er-api.com/v6/latest/USD")).json()).rates.DOP,
      async () => (await (await fetch("https://api.exchangerate-api.com/v4/latest/USD")).json()).rates.DOP,
      async () =>
        (
          await (
            await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json")
          ).json()
        ).usd.dop,
    ];
    (async () => {
      for (const api of apis) {
        try {
          const r = await api();
          if (!cancelled && r && r > 50) {
            const today = new Date().toLocaleDateString("es-DO", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });
            setRate((r * RATE_MARKUP).toFixed(2));
            setRateSource("🏦 Tasa de referencia Banreservas · Actualizado: " + today);
            return;
          }
        } catch {
          /* try next */
        }
      }
      if (!cancelled) {
        setRate(String(FALLBACK_RATE));
        setRateSource(`⚠️ Tasa aproximada RD$${FALLBACK_RATE} — verifica en Banreservas.com`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const r = parseFloat(rate) || FALLBACK_RATE;
  const rules = STORE_RULES[store];

  // Two-way USD <-> RD$ sync
  function onUsd(v: string) {
    setUsd(v);
    const n = parseFloat(v);
    setDop(!isNaN(n) && n > 0 ? (n * r).toFixed(0) : "");
  }
  function onDop(v: string) {
    setDop(v);
    const n = parseFloat(v);
    setUsd(!isNaN(n) && n > 0 ? (n / r).toFixed(2) : "");
  }
  function onRate(v: string) {
    setRate(v);
    const rr = parseFloat(v) || FALLBACK_RATE;
    const u = parseFloat(usd);
    const d = parseFloat(dop);
    if (!isNaN(u) && u > 0) setDop((u * rr).toFixed(0));
    else if (!isNaN(d) && d > 0) setUsd((d / rr).toFixed(2));
  }

  const calc = useMemo(() => {
    const dopNum = parseFloat(dop) || 0;
    const usdNum = parseFloat(usd) || 0;
    const subtotal = dopNum > 0 ? dopNum : usdNum * r;
    if (subtotal <= 0) return null;

    const subtotalUSD = subtotal / r;
    const fS = getCommission(subtotalUSD);
    const fB = rules.bank;
    const fT = rules.tax;
    const ship = rules.fleteAtDelivery ? 0 : rules.ship || 100;

    const sAmt = (subtotal * fS) / 100;
    const bAmt = (subtotal * fB) / 100;
    const tAmt = (subtotal * fT) / 100;
    const minFeeAmt =
      rules.minFee > 0 && subtotalUSD < rules.minFeeThresholdUSD ? rules.minFee : 0;

    const totalRaw = subtotal + sAmt + bAmt + tAmt + ship + minFeeAmt;
    const total = roundUp25(totalRaw);

    return { subtotal, subtotalUSD, fS, fB, fT, ship, sAmt, bAmt, tAmt, minFeeAmt, total };
  }, [dop, usd, r, rules]);

  const fin = useMemo(() => {
    if (!calc || payMode !== "half") return null;
    const raw =
      adelantoTouched && adelanto !== "" ? parseFloat(adelanto) || 0 : calc.total / 2;
    const ade = roundUp25(raw);
    const restante = Math.max(calc.total - ade, 0);
    const finCharge = restante * FINANCING_PCT;
    const alRecoger = roundUp25(restante + finCharge);
    const totalAcum = ade + alRecoger;
    const pct = calc.total > 0 ? Math.round((ade / calc.total) * 100) : 0;
    return { ade, restante, finCharge, alRecoger, totalAcum, pct };
  }, [calc, payMode, adelanto, adelantoTouched]);

  const lbsCost = (parseFloat(lbs) || 0) * FLETE_PER_LB;

  function sendWA() {
    if (!calc) return;
    const lines = [
      `*Cotización de pedido — ${store}*`,
      `Tasa aplicada: 1 USD = RD$ ${r.toFixed(2)}`,
      ``,
      `Subtotal: ${fmt(calc.subtotal)} ($${calc.subtotalUSD.toFixed(2)} USD)`,
      `Comisión de servicio (${calc.fS}%): ${fmt(calc.sAmt)}`,
    ];
    if (calc.fB > 0) lines.push(`Cargo bancario (${calc.fB}%): ${fmt(calc.bAmt)}`);
    if (calc.fT > 0) lines.push(`Impuesto importación (${calc.fT}%): ${fmt(calc.tAmt)}`);
    if (calc.minFeeAmt > 0) lines.push(`Cargo mínimo: ${fmt(calc.minFeeAmt)}`);
    if (rules.fleteAtDelivery)
      lines.push(`Flete: se paga al recibir (RD$${FLETE_PER_LB}/lb)`);
    else lines.push(`Flete / envío: ${fmt(calc.ship)}`);
    lines.push(`*TOTAL: ${fmt(calc.total)}*`);

    if (payMode === "half" && fin) {
      lines.push(``, `*Opción de pago 50/50:*`);
      lines.push(`Adelanto ahora: ${fmt(fin.ade)} (${fin.pct}%)`);
      lines.push(`Al recoger: ${fmt(fin.alRecoger)} (+20% financiero)`);
      lines.push(`Total acumulado: ${fmt(fin.totalAcum)}`);
    }
    window.open(
      `https://wa.me/${BUSINESS_WA}?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank",
      "noopener"
    );
  }

  return (
    <div className="gl-cotz">
      <style>{styles}</style>

      <nav className="cz-nav">
        <Link href="/" className="cz-logo">
          Ganga<span>Loo</span>
        </Link>
        <Link href="/tienda" className="cz-back">
          Tienda →
        </Link>
      </nav>

      <header className="cz-head">
        <h1>
          Cotizador de <em>Pedidos</em>
        </h1>
        <p>
          Ingresa el total de tu carrito en USD o RD$, calcula el precio final con
          flete y comisiones, y envíalo por WhatsApp.
        </p>
      </header>

      {/* RATE BAR */}
      <div className="cz-rate">
        <label>Tasa USD → RD$</label>
        <div className="cz-rate-input">
          <span>RD$</span>
          <input
            type="number"
            value={rate}
            min={1}
            step={0.25}
            onChange={(e) => onRate(e.target.value)}
          />
        </div>
        <span className="cz-rate-src">{rateSource}</span>
      </div>

      <div className="cz-body">
        {/* STORE TABS */}
        <div className="cz-tabs">
          {STORES.map((s) => (
            <button
              key={s}
              className={`cz-tab${store === s ? " on" : ""}`}
              onClick={() => setStore(s)}
            >
              {s === "Otra" ? "Otra tienda" : s}
            </button>
          ))}
        </div>

        {/* CART TOTAL */}
        <div className="cz-card">
          <h2 className="cz-label">Total del carrito</h2>
          <div className="cz-money-row">
            <span className="cz-flag">USD</span>
            <input
              className="cz-money"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={usd}
              onChange={(e) => onUsd(e.target.value)}
            />
          </div>
          <div className="cz-or">— o —</div>
          <div className="cz-money-row">
            <span className="cz-flag">RD$</span>
            <input
              className="cz-money"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={dop}
              onChange={(e) => onDop(e.target.value)}
            />
          </div>

          {rules.fleteAtDelivery && (
            <div className="cz-lbs">
              <label>Peso estimado (lbs) — flete RD${FLETE_PER_LB}/lb, se paga al recibir</label>
              <div className="cz-lbs-row">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="lbs"
                  value={lbs}
                  onChange={(e) => setLbs(e.target.value)}
                />
                <span className="cz-lbs-out">{fmt(lbsCost)}</span>
              </div>
            </div>
          )}
        </div>

        {/* RESULT */}
        {!calc ? (
          <div className="cz-empty">Ingresa un monto para ver tu cotización.</div>
        ) : (
          <div className="cz-card">
            <h2 className="cz-label">Desglose</h2>
            <div className="cz-breakdown">
              <Row
                label={`Subtotal carrito ($${calc.subtotalUSD.toFixed(2)} USD)`}
                val={fmt(calc.subtotal)}
              />
              <Row label={`Comisión de servicio (${calc.fS}%)`} val={fmt(calc.sAmt)} />
              {calc.fB > 0 && <Row label={`Cargo bancario (${calc.fB}%)`} val={fmt(calc.bAmt)} />}
              {calc.fT > 0 && (
                <Row label={`Impuesto importación (${calc.fT}%)`} val={fmt(calc.tAmt)} />
              )}
              {calc.minFeeAmt > 0 && (
                <Row label="Cargo mínimo (pedido menor $35 USD)" val={fmt(calc.minFeeAmt)} />
              )}
              {rules.fleteAtDelivery ? (
                <Row
                  label={`Flete (se paga al recibir · RD$${FLETE_PER_LB}/lb)`}
                  val="—"
                  muted
                />
              ) : (
                <Row label="Flete / envío" val={fmt(calc.ship)} />
              )}
              <Row label="Total a pagar" val={fmt(calc.total)} total />
            </div>

            <div className="cz-note">
              ℹ️ <strong>Cobro a domicilio:</strong> se cobra un adicional de{" "}
              <strong>RD$ {DELIVERY_FEE}</strong> para recogida del pago en tu dirección.
              Si pagas en tienda, no aplica.
            </div>

            {/* PAY MODE */}
            <div className="cz-paytabs">
              <button
                className={`cz-paytab${payMode === "full" ? " on" : ""}`}
                onClick={() => setPayMode("full")}
              >
                Pago completo
              </button>
              <button
                className={`cz-paytab${payMode === "half" ? " on" : ""}`}
                onClick={() => {
                  setPayMode("half");
                  if (!adelantoTouched && calc) setAdelanto(String(Math.round(calc.total / 2)));
                }}
              >
                Adelanto + financiero
              </button>
            </div>

            {payMode === "half" && fin && (
              <div className="cz-fin">
                <label className="cz-fin-label">¿Cuánto pagas de adelanto?</label>
                <div className="cz-money-row sm">
                  <span className="cz-flag">RD$</span>
                  <input
                    className="cz-money"
                    type="number"
                    inputMode="decimal"
                    value={adelanto}
                    onChange={(e) => {
                      setAdelantoTouched(true);
                      setAdelanto(e.target.value);
                    }}
                  />
                </div>

                <div className="cz-split">
                  <div className="cz-sbox now">
                    <div className="cz-slbl">Pagar ahora</div>
                    <div className="cz-samt">{fmt(fin.ade)}</div>
                    <div className="cz-snote">{fin.pct}% del total</div>
                  </div>
                  <div className="cz-sbox later">
                    <div className="cz-slbl">Al recoger</div>
                    <div className="cz-samt">{fmt(fin.alRecoger)}</div>
                    <div className="cz-snote">+20% financiero ({fmt(fin.finCharge)})</div>
                  </div>
                </div>

                <div className="cz-restante">
                  Restante: {fmt(fin.restante)} + 20% financiero ({fmt(fin.finCharge)}) ={" "}
                  {fmt(fin.alRecoger)} (redondeado)
                </div>

                <div className="cz-acum">
                  <div className="cz-acum-lbl">⚠️ Total acumulado a pagar</div>
                  <div className="cz-acum-amt">{fmt(fin.totalAcum)}</div>
                  <div className="cz-acum-sub">
                    ({fmt(fin.ade)} ahora + {fmt(fin.alRecoger)} al recoger)
                  </div>
                </div>
              </div>
            )}

            <button className="cz-wa" onClick={sendWA}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Enviar cotización por WhatsApp
            </button>
          </div>
        )}
      </div>

      <footer className="cz-footer">
        <p>© {new Date().getFullYear()} GangaLoo · Sosúa, Puerto Plata, Rep. Dom.</p>
      </footer>
    </div>
  );
}

function Row({
  label,
  val,
  total,
  muted,
}: {
  label: string;
  val: string;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`cz-row${total ? " total" : ""}${muted ? " muted" : ""}`}>
      <span>{label}</span>
      <span className="cz-row-val">{val}</span>
    </div>
  );
}

const styles = `
.gl-cotz{
  --brand:#002D62; --red:#CF142B; --gold:#c8a84b; --accent:#c8502a;
  --bg:#f4f1ec; --surface:#fff; --surface2:#f7f5f1; --border:#e3ddd2;
  --text:#1c2a3a; --muted:#6b6358; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  background:var(--bg); color:var(--text); min-height:100vh;
}
.gl-cotz *{ box-sizing:border-box; }
.gl-cotz a{ color:inherit; text-decoration:none; }

.cz-nav{ position:sticky; top:0; z-index:100; background:var(--brand); color:#fff;
  height:54px; padding:0 5vw; display:flex; align-items:center; justify-content:space-between; }
.cz-logo{ font-size:1.25rem; font-weight:800; color:#fff; }
.cz-logo span{ color:var(--gold); }
.cz-back{ font-size:.85rem; font-weight:600; color:rgba(255,255,255,.85); }
.cz-back:hover{ color:#fff; }

.cz-head{ text-align:center; padding:clamp(28px,6vw,44px) 5vw 18px; max-width:600px; margin:0 auto; }
.cz-head h1{ font-size:clamp(1.6rem,6vw,2.3rem); font-weight:800; color:var(--brand); }
.cz-head h1 em{ color:var(--red); font-style:normal; }
.cz-head p{ margin-top:10px; font-size:.92rem; color:var(--muted); line-height:1.6; }

.cz-rate{ background:#fffbe6; border-top:1px solid #f0e080; border-bottom:1px solid #f0e080;
  padding:10px 5vw; display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; }
.cz-rate label{ font-size:.82rem; color:#5a4a00; font-weight:600; }
.cz-rate-input{ display:flex; align-items:center; gap:6px; }
.cz-rate-input span{ font-size:.82rem; color:#5a4a00; font-family:var(--mono); }
.cz-rate-input input{ width:88px; padding:5px 9px; font-size:.9rem; font-family:var(--mono);
  font-weight:500; border:1px solid #d4c050; border-radius:7px; background:#fff; color:var(--text); }
.cz-rate-src{ font-size:.74rem; color:#a08800; width:100%; text-align:center; }

.cz-body{ max-width:620px; margin:0 auto; padding:22px 5vw 60px; }

.cz-tabs{ display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; margin-bottom:16px;
  scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.cz-tabs::-webkit-scrollbar{ display:none; }
.cz-tab{ flex-shrink:0; padding:9px 16px; border-radius:99px; border:1px solid var(--border);
  background:var(--surface); color:var(--muted); font-size:.85rem; font-weight:600; cursor:pointer;
  font-family:inherit; transition:all .15s; }
.cz-tab:hover{ border-color:var(--brand); color:var(--brand); }
.cz-tab.on{ background:var(--red); border-color:var(--red); color:#fff; }

.cz-card{ background:var(--surface); border:1px solid var(--border); border-radius:16px;
  padding:20px; margin-bottom:16px; }
.cz-label{ font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em;
  color:var(--muted); margin-bottom:14px; }

.cz-money-row{ display:flex; align-items:center; gap:12px; }
.cz-money-row.sm{ max-width:240px; }
.cz-flag{ flex-shrink:0; width:42px; font-size:.78rem; font-weight:700; color:var(--muted);
  font-family:var(--mono); }
.cz-money{ flex:1; width:100%; padding:14px 16px; font-size:1.4rem; font-weight:600;
  font-family:var(--mono); border:1px solid var(--border); border-radius:10px;
  background:var(--surface2); color:var(--text); }
.cz-money:focus{ outline:2px solid var(--brand); border-color:transparent; background:#fff; }
.cz-or{ text-align:center; font-size:.8rem; color:var(--muted); margin:8px 0; }

.cz-lbs{ margin-top:16px; padding-top:16px; border-top:1px solid var(--border); }
.cz-lbs label{ font-size:.8rem; color:var(--muted); display:block; margin-bottom:8px; }
.cz-lbs-row{ display:flex; align-items:center; gap:12px; }
.cz-lbs-row input{ width:110px; padding:10px 12px; font-size:1rem; font-family:var(--mono);
  border:1px solid var(--border); border-radius:9px; background:var(--surface2); color:var(--text); }
.cz-lbs-out{ font-size:1rem; font-weight:600; font-family:var(--mono); color:var(--accent); }

.cz-empty{ text-align:center; padding:36px 20px; color:var(--muted); font-size:.92rem;
  background:var(--surface); border:1px dashed var(--border); border-radius:16px; }

.cz-breakdown{ display:flex; flex-direction:column; }
.cz-row{ display:flex; justify-content:space-between; gap:12px; padding:11px 0;
  border-bottom:1px solid var(--surface2); font-size:.9rem; }
.cz-row span:first-child{ color:var(--muted); }
.cz-row-val{ font-family:var(--mono); font-weight:500; white-space:nowrap; }
.cz-row.muted{ color:var(--accent); font-size:.82rem; }
.cz-row.muted span:first-child{ color:var(--accent); }
.cz-row.total{ border-bottom:none; border-top:2px solid var(--border); margin-top:4px;
  padding-top:14px; font-size:1.05rem; font-weight:800; }
.cz-row.total span:first-child{ color:var(--brand); font-weight:800; }
.cz-row.total .cz-row-val{ color:var(--brand); font-weight:800; }

.cz-note{ margin-top:14px; padding:11px 14px; background:#fffbe6; border:1px solid #f0e080;
  border-radius:10px; font-size:.78rem; color:#5a4a00; line-height:1.55; }

.cz-paytabs{ display:flex; gap:8px; margin-top:18px; background:var(--surface2);
  padding:5px; border-radius:12px; }
.cz-paytab{ flex:1; padding:11px; border:none; background:transparent; border-radius:9px;
  font-family:inherit; font-size:.85rem; font-weight:600; color:var(--muted); cursor:pointer;
  transition:all .15s; }
.cz-paytab.on{ background:var(--surface); color:var(--brand); box-shadow:0 1px 4px rgba(0,0,0,.08); }

.cz-fin{ margin-top:16px; }
.cz-fin-label{ font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); display:block; margin-bottom:8px; }
.cz-split{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
.cz-sbox{ border-radius:12px; padding:14px; text-align:center; }
.cz-sbox.now{ background:#fff4ef; border:1px solid #f3c7b3; }
.cz-sbox.later{ background:var(--surface2); border:1px solid var(--border); }
.cz-slbl{ font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); }
.cz-sbox.now .cz-slbl{ color:var(--accent); }
.cz-samt{ font-size:1.15rem; font-weight:800; font-family:var(--mono); margin:5px 0 2px; }
.cz-sbox.now .cz-samt{ color:var(--accent); }
.cz-snote{ font-size:.7rem; color:var(--muted); }
.cz-restante{ margin-top:12px; padding:9px 12px; background:var(--surface2); border:1px solid var(--border);
  border-radius:8px; font-size:.76rem; color:var(--muted); }
.cz-acum{ margin-top:12px; background:#13213a; border:2px solid var(--accent); border-radius:12px;
  padding:16px; text-align:center; }
.cz-acum-lbl{ font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em;
  color:var(--accent); margin-bottom:5px; }
.cz-acum-amt{ font-size:1.7rem; font-weight:800; font-family:var(--mono); color:#fff; }
.cz-acum-sub{ font-size:.72rem; color:#a9b2c2; margin-top:4px; }

.cz-wa{ width:100%; margin-top:18px; display:flex; align-items:center; justify-content:center; gap:8px;
  background:#25D366; color:#fff; border:none; padding:15px; border-radius:12px;
  font-family:inherit; font-size:.95rem; font-weight:700; cursor:pointer;
  transition:background .15s,transform .15s; }
.cz-wa:hover{ background:#1da855; transform:translateY(-1px); }

.cz-footer{ text-align:center; padding:24px 5vw; font-size:.8rem; color:var(--muted);
  border-top:1px solid var(--border); }

@media (max-width:420px){
  .cz-split{ grid-template-columns:1fr; }
}
`;
