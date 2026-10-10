import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

const ROWS = [
  ["Brand identity system", "1", "2,400.00"],
  ["Report template design", "3", "1,350.00"],
  ["Data integration", "6", "1,080.00"],
  ["Print calibration", "2", "320.00"],
] as const;
const TOTAL = 5150;
const OUTPUTS = ["PDF", "DOCX", "XLSX", "ZPL"] as const;
/** Phase at which each piece appears: header, customer, four rows, total, stamp, outputs. */
const STEP = { header: 1, customer: 2, rows: 3, total: 7, stamp: 8, outputs: 9 } as const;
const LAST_PHASE = 13;
/** Once the visitor edits the data, hold the finished page so their change is the only thing moving. */
const HOLD_PHASE = STEP.outputs + OUTPUTS.length - 1;
const DEFAULT_CUSTOMER = "Acme Corporation";
const PHASE_MS = 620;

/** The hero's signature loop: JSON fields stream into a sheet of paper that assembles itself, then leaves as files. */
export function HeroScene() {
  const reduced = prefersReducedMotion();
  const [customer, setCustomer] = useState(DEFAULT_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const still = reduced || touched;
  const [phase, setPhase] = useState(reduced ? HOLD_PHASE : 0);
  const [total, setTotal] = useState(reduced ? TOTAL : 0);
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (still) { setPhase(HOLD_PHASE); setTotal(TOTAL); return; }
    const timer = window.setInterval(() => setPhase((current) => (current >= LAST_PHASE ? 0 : current + 1)), PHASE_MS);
    return () => window.clearInterval(timer);
  }, [still]);

  useEffect(() => {
    if (still) return;
    if (phase < STEP.total) { setTotal(0); return; }
    if (phase !== STEP.total) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setTotal(Math.round(TOTAL * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, still]);

  // Tilt the stage toward the pointer. Writes CSS variables only; layout never changes.
  useEffect(() => {
    const element = scene.current;
    if (!element || reduced || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        element.style.setProperty("--tilt-x", `${((event.clientY - box.top) / box.height - 0.5) * -8}deg`);
        element.style.setProperty("--tilt-y", `${((event.clientX - box.left) / box.width - 0.5) * 10}deg`);
      });
    };
    const leave = () => { element.style.setProperty("--tilt-x", "0deg"); element.style.setProperty("--tilt-y", "0deg"); };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [reduced]);

  const shown = (step: number) => (phase >= step ? "is-on" : "");
  const active = (from: number, to = from) => (phase >= from && phase <= to ? "is-active" : "");

  const edit = (value: string) => { setTouched(true); setCustomer(value.slice(0, 32)); };
  const shownCustomer = customer.trim() || "Your customer";

  return <div className={`hero-try ${touched ? "is-touched" : ""}`}>
  <div className="hero-scene" ref={scene} aria-hidden="true" data-phase={phase}>
    <div className="scene-json">
      <div className="scene-card-bar"><i /><i /><i /><span>invoice.json</span></div>
      <pre>
        <span>{"{"}</span>
        <span className={active(STEP.header)}>{"  "}<b>"company"</b>: <em>"Northwind Studio"</em>,</span>
        <span className={touched ? "is-active" : active(STEP.customer)}>{"  "}<b>"customer"</b>: <em>"{shownCustomer}"</em>,</span>
        <span className={active(STEP.rows, STEP.rows + ROWS.length - 1)}>{"  "}<b>"items"</b>: [ <small>{ROWS.length} rows</small> ],</span>
        <span className={active(STEP.total)}>{"  "}<b>"total"</b>: <em className="num">5150.00</em>,</span>
        <span className={active(STEP.stamp)}>{"  "}<b>"status"</b>: <em>"paid"</em></span>
        <span>{"}"}</span>
      </pre>
    </div>

    <svg className="scene-beams" viewBox="0 0 400 300" preserveAspectRatio="none">
      <defs>
        <linearGradient id="beam-gradient" x1="0" x2="1"><stop offset="0" stopColor="var(--hero-blue)" stopOpacity="0" /><stop offset=".5" stopColor="var(--hero-blue)" /><stop offset="1" stopColor="var(--hero-lime)" /></linearGradient>
      </defs>
      {["M0 70 C 140 70, 220 110, 400 120", "M0 150 C 150 150, 230 150, 400 150", "M0 230 C 140 230, 220 190, 400 180"].map((d, index) => <g key={d}>
        <path d={d} className="beam-track" />
        <path d={d} className="beam-flow" style={{ animationDelay: `${index * -0.6}s` }} />
      </g>)}
    </svg>

    <div className="scene-stage">
      <div className="scene-paper">
        <div className={`paper-head ${shown(STEP.header)}`}><span className="paper-logo" /><div><strong>Northwind Studio</strong><small>INVOICE · INV-1042</small></div><span className="paper-date">10 Oct 2026</span></div>
        <div className={`paper-customer ${shown(STEP.customer)}`}><small>BILLED TO</small><strong><span className="paper-type" key={touched ? "live" : "loop"}>{shownCustomer}</span></strong></div>
        <div className="paper-table">
          <div className="paper-row paper-row-head"><span>Description</span><span>Qty</span><span>Amount</span></div>
          {ROWS.map(([label, qty, amount], index) => phase >= STEP.rows + index
            ? <div key={label} className="paper-row is-on"><span>{label}</span><span>{qty}</span><span>{amount}</span></div>
            : <div key={`ghost-${label}`} className="paper-row paper-ghost"><i /><i /><i /></div>)}
        </div>
        <div className={`paper-total ${shown(STEP.total)}`}><span>Total due</span><strong>{total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>
        <div className="paper-barcode">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ width: `${1 + ((index * 7) % 3)}px` }} />)}</div>
        <div className={`paper-stamp ${shown(STEP.stamp)}`}>PAID</div>
        <div className={`paper-scan ${phase > 0 && phase < STEP.stamp ? "is-on" : ""}`} />
      </div>
      <div className="scene-outputs">{OUTPUTS.map((format, index) => <span key={format} className={shown(STEP.outputs + index)}><i />{format}</span>)}</div>
    </div>
  </div>
  <label className="hero-try-input">
    <span className="hero-try-label"><span className="hero-try-dot" />{touched ? "That's data binding. Same template, your values." : "Try it: change the customer"}</span>
    <input data-testid="hero-try-customer" value={customer} onChange={(event) => edit(event.target.value)} onFocus={() => setTouched(true)} placeholder="Type a company name" spellCheck={false} autoComplete="off" aria-label="Customer name shown on the sample invoice" />
  </label>
  </div>;
}
