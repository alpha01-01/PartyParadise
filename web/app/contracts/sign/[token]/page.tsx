"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────
interface ContractData {
  reference: string;
  client_name: string;
  event_date: string;
  venue: string | null;
  total_amount: number;
  deposit_amount: number | null;
  body: string;
  status: "sent" | "signed" | "expired";
}

type SigMode = "type" | "draw";
type PageState = "loading" | "ready" | "signing" | "success" | "expired" | "error";

// ─── Page ─────────────────────────────────────────────────────
export default function ContractSignPage() {
  const params = useParams();
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>("loading");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [sigMode, setSigMode] = useState<SigMode>("type");
  const [typedSig, setTypedSig] = useState("");
  const [hasDrawing, setHasDrawing] = useState(false);
  const [consent1, setConsent1] = useState(false);
  const [consent2, setConsent2] = useState(false);
  const [consent3, setConsent3] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [signedAt, setSignedAt] = useState<Date | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Fetch contract data on mount
  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/contracts/sign/${token}`
        );
        if (res.status === 404) {
          setPageState("expired");
          return;
        }
        if (!res.ok) throw new Error("Failed to load contract");
        const data = await res.json();
        setContract(data);

        if (data.status === "signed") {
          setPageState("success");
        } else if (data.status === "expired") {
          setPageState("expired");
        } else {
          setPageState("ready");
        }
      } catch {
        setPageState("error");
      }
    }
    fetchContract();
  }, [token]);

  // Init canvas when draw mode selected
  useEffect(() => {
    if (sigMode !== "draw" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#f0ead8";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function getPos(e: MouseEvent | Touch): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function onStart(e: MouseEvent) {
      drawingRef.current = true;
      lastPosRef.current = getPos(e);
    }
    function onMove(e: MouseEvent) {
      if (!drawingRef.current) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPosRef.current = pos;
      setHasDrawing(true);
    }
    function onEnd() { drawingRef.current = false; }

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      drawingRef.current = true;
      lastPosRef.current = getPos(e.touches[0]);
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (!drawingRef.current) return;
      const pos = getPos(e.touches[0]);
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPosRef.current = pos;
      setHasDrawing(true);
    }

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("mouseleave", onEnd);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("mouseleave", onEnd);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [sigMode]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  function canSign(): boolean {
    if (!consent1 || !consent2 || !consent3) return false;
    if (sigMode === "type") return typedSig.trim().length >= 2;
    return hasDrawing;
  }

  function getSignatureData(): string {
    if (sigMode === "type") return typedSig.trim();
    return canvasRef.current?.toDataURL("image/png") ?? "";
  }

  async function handleSign() {
    if (!canSign()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/contracts/sign/${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature_data: getSignatureData() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to submit signature");
      }
      setSignedAt(new Date());
      setPageState("success");
    } catch (err: unknown) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  // ── Render states ──────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <PageShell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px", gap: 16 }}>
          <div className="pp-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <p style={{ color: "var(--pp-text-2)", fontSize: 14 }}>Loading your contract…</p>
        </div>
      </PageShell>
    );
  }

  if (pageState === "error") {
    return (
      <PageShell>
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontFamily: "var(--pp-font-display, Syne)", fontSize: 22, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ color: "var(--pp-text-2)", fontSize: 14 }}>
            We couldn't load this contract. The link may be invalid.
          </p>
        </div>
      </PageShell>
    );
  }

  if (pageState === "expired") {
    return (
      <PageShell reference={contract?.reference}>
        <ContractCard contract={contract!}>
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div className="pp-sign-state-icon" style={{ background: "rgba(224,90,74,0.1)", borderColor: "rgba(224,90,74,0.25)", margin: "0 auto 18px" }}>
              ⏱
            </div>
            <h2 className="pp-sign-state-title">Link has expired</h2>
            <p className="pp-sign-state-sub">
              This signing link has expired. Please contact PartyParadise to receive a new link.
            </p>
          </div>
        </ContractCard>
      </PageShell>
    );
  }

  if (pageState === "success") {
    return (
      <PageShell reference={contract?.reference}>
        <ContractCard contract={contract!}>
          <div style={{ textAlign: "center", padding: "48px 24px", animation: "pp-fade-up 0.5s ease" }}>
            <div className="pp-sign-state-icon" style={{ background: "rgba(76,175,125,0.1)", borderColor: "rgba(76,175,125,0.3)", margin: "0 auto 18px" }}>
              ✓
            </div>
            <h2 className="pp-sign-state-title">Contract signed!</h2>
            <p className="pp-sign-state-sub">
              Thank you, <strong>{contract?.client_name}</strong>. Your service agreement has been signed and recorded.
            </p>
            <div className="pp-sign-success-detail">
              <SuccessRow label="Reference"   value={contract?.reference ?? "—"} />
              <SuccessRow label="Signed by"   value={contract?.client_name ?? "—"} />
              <SuccessRow label="Signed at"   value={signedAt?.toLocaleString("en-GH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) ?? "—"} />
              <SuccessRow label="Event date"  value={contract?.event_date ? formatDate(contract.event_date, "long") : "—"} />
              <SuccessRow label="Total value" value={formatCurrency(contract?.total_amount)} gold />
              {contract?.deposit_amount && (
                <SuccessRow label="Deposit due" value={formatCurrency(contract.deposit_amount)} />
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--pp-text-3)", marginTop: 18 }}>
              PartyParadise will be in touch to confirm your deposit.
            </p>
          </div>
        </ContractCard>
      </PageShell>
    );
  }

  // ── Main signing view ──────────────────────────────────────
  return (
    <PageShell reference={contract?.reference}>
      {/* Status banner */}
      <div className="pp-sign-banner">
        <div className="pp-sign-banner-icon">✍</div>
        <div>
          <strong>Awaiting your signature</strong> &nbsp;·&nbsp;
          This agreement is ready for review and signing. The link expires <strong>7 days</strong> after it was sent.
        </div>
      </div>

      {/* Contract body */}
      <ContractCard contract={contract!}>
        <ContractBody contract={contract!} />
      </ContractCard>

      {/* Signature panel */}
      <div className="pp-sign-panel">
        <div className="pp-sign-panel-header">
          <span className="pp-sign-panel-title">Your Signature</span>
          {/* Tab toggle */}
          <div className="pp-sig-tabs">
            <button
              className={`pp-sig-tab${sigMode === "type" ? " pp-sig-tab--active" : ""}`}
              onClick={() => setSigMode("type")}
            >
              Type
            </button>
            <button
              className={`pp-sig-tab${sigMode === "draw" ? " pp-sig-tab--active" : ""}`}
              onClick={() => { setSigMode("draw"); setHasDrawing(false); }}
            >
              Draw
            </button>
          </div>
        </div>

        <div className="pp-sign-panel-body">
          {sigMode === "type" ? (
            <>
              <label className="pp-sign-field-label" htmlFor="type-your-full-legal-nam-1">
                Type your full legal name to sign
              </label>
              <input id="type-your-full-legal-nam-1"
                className="pp-sig-input"
                placeholder="Your full name"
                value={typedSig}
                onChange={(e) => setTypedSig(e.target.value)}
                maxLength={100}
                autoFocus
              />
              {typedSig.trim().length >= 2 && (
                <div className="pp-sig-preview">
                  <div className="pp-sig-preview-label">Signature preview</div>
                  <div className="pp-sig-preview-text">{typedSig}</div>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="pp-sign-field-label">
                Draw your signature in the box below
              </label>
              <canvas
                ref={canvasRef}
                className="pp-sig-canvas"
                width={760}
                height={120}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6, gap: 8 }}>
                <button className="pp-btn pp-btn-ghost" onClick={clearCanvas} style={{ fontSize: 12 }}>
                  Clear
                </button>
              </div>
            </>
          )}

          <hr className="pp-divider" />

          {/* Consent checkboxes */}
          <div className="pp-consent-list">
            <ConsentItem
              checked={consent1}
              onChange={setConsent1}
              label={<>I have read and agree to the <strong>terms and conditions</strong> of this service agreement</>}
            />
            <ConsentItem
              checked={consent2}
              onChange={setConsent2}
              label={<>I agree to the <strong>payment terms</strong> including the deposit of <strong>{formatCurrency(contract?.deposit_amount)}</strong> and cancellation policy</>}
            />
            <ConsentItem
              checked={consent3}
              onChange={setConsent3}
              label={<>I understand that my <strong>typed name / drawn signature</strong> constitutes a legally binding electronic signature</>}
            />
          </div>

          {error && (
            <div className="pp-sign-error">{error}</div>
          )}

          <button
            className={`pp-sign-submit${submitting ? " pp-btn--loading" : ""}`}
            disabled={!canSign() || submitting}
            onClick={handleSign}
          >
            {submitting ? (
              <span className="pp-spinner" style={{ borderTopColor: "#0e0d0b", borderColor: "rgba(14,13,11,0.25)" }} />
            ) : (
              <>
                <CheckIcon />
                Sign Agreement
              </>
            )}
          </button>

          <p className="pp-sign-legal-note">
            Your signature, IP address, and timestamp will be recorded as legal evidence of this agreement.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function PageShell({ children, reference }: { children: React.ReactNode; reference?: string }) {
  return (
    <>
      <style>{css}</style>
      <nav className="pp-sign-topbar">
        <div className="pp-sign-logo">
          <div className="pp-sign-logo-mark"><span>P</span></div>
          <span className="pp-sign-logo-name">PartyParadise</span>
        </div>
        {reference && (
          <span className="pp-sign-ref-pill">{reference}</span>
        )}
      </nav>
      <div className="pp-sign-page">
        {children}
      </div>
    </>
  );
}

function ContractCard({ contract, children }: { contract: ContractData; children: React.ReactNode }) {
  return (
    <div className="pp-sign-card">
      <div className="pp-sign-card-header">
        <div className="pp-sign-card-ref">{contract.reference}</div>
        <h1 className="pp-sign-card-title">Service Agreement</h1>
        <div className="pp-sign-card-meta">
          <span>{contract.client_name}</span>
          <span>·</span>
          <span>{contract.event_date ? formatDate(contract.event_date, "long") : "—"}</span>
          {contract.venue && <><span>·</span><span>{contract.venue}</span></>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ContractBody({ contract }: { contract: ContractData }) {
  // Render the contract body text — this is the stored body from the DB
  // with all tokens already replaced by the backend
  return (
    <div className="pp-sign-card-body">
      <div
        className="pp-contract-text"
        dangerouslySetInnerHTML={{
          // The body is plain text stored in the DB, and may hold staff-typed
          // terms, so it is escaped before line breaks become markup.
          __html: contract.body
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/\n\n/g, "</p><p>")
            .replace(/\n/g, "<br/>"),
        }}
      />
    </div>
  );
}

function ConsentItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <div className="pp-consent-item" onClick={() => onChange(!checked)}>
      <div className={`pp-consent-cb${checked ? " pp-consent-cb--checked" : ""}`}>
        {checked && <CheckIcon small />}
      </div>
      <div className="pp-consent-label">{label}</div>
    </div>
  );
}

function SuccessRow({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="pp-success-row">
      <span className="pp-success-row-label">{label}</span>
      <span className="pp-success-row-value" style={{ color: gold ? "var(--pp-gold)" : undefined }}>
        {value}
      </span>
    </div>
  );
}

function CheckIcon({ small }: { small?: boolean }) {
  const s = small ? 10 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
      <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── CSS ──────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');

  :root {
    --pp-bg: #0e0d0b;
    --pp-surface: #141310;
    --pp-surface2: #1c1a16;
    --pp-surface3: #232019;
    --pp-border: rgba(255,220,100,0.08);
    --pp-border2: rgba(255,220,100,0.16);
    --pp-gold: #f5c842;
    --pp-gold-dim: #c49a20;
    --pp-gold-glow: rgba(245,200,66,0.12);
    --pp-text: #f0ead8;
    --pp-text-2: #9c9278;
    --pp-text-3: #5c5444;
    --pp-red: #e05a4a;
    --pp-green: #4caf7d;
    --pp-font-display: 'Syne', sans-serif;
    --pp-font-body: 'DM Sans', sans-serif;
    --pp-font-serif: 'Playfair Display', serif;
    --pp-radius: 12px;
    --pp-radius-sm: 7px;
    --pp-transition: 0.2s cubic-bezier(0.4,0,0.2,1);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--pp-bg);
    color: var(--pp-text);
    font-family: var(--pp-font-body);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }

  strong { font-weight: 600; }

  /* ── Topbar ── */
  .pp-sign-topbar {
    background: var(--pp-surface);
    border-bottom: 1px solid var(--pp-border);
    padding: 0 24px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .pp-sign-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pp-sign-logo-mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--pp-gold);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 14px var(--pp-gold-glow);
  }

  .pp-sign-logo-mark span {
    font-family: var(--pp-font-display);
    font-size: 15px;
    font-weight: 800;
    color: #0e0d0b;
    line-height: 1;
  }

  .pp-sign-logo-name {
    font-family: var(--pp-font-display);
    font-size: 14px;
    font-weight: 700;
    color: var(--pp-text);
    letter-spacing: -0.02em;
  }

  .pp-sign-ref-pill {
    font-size: 11.5px;
    color: var(--pp-text-3);
    padding: 3px 10px;
    background: var(--pp-surface2);
    border: 1px solid var(--pp-border);
    border-radius: 100px;
  }

  /* ── Page ── */
  .pp-sign-page {
    max-width: 780px;
    margin: 0 auto;
    padding: 28px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Status banner ── */
  .pp-sign-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--pp-radius-sm);
    background: rgba(245, 200, 66, 0.07);
    border: 1px solid rgba(245, 200, 66, 0.18);
    color: var(--pp-gold);
    font-size: 13px;
  }

  .pp-sign-banner-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(245, 200, 66, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 13px;
  }

  /* ── Contract card ── */
  .pp-sign-card {
    background: var(--pp-surface);
    border: 1px solid var(--pp-border);
    border-radius: var(--pp-radius);
    overflow: hidden;
  }

  .pp-sign-card-header {
    padding: 24px 28px 20px;
    border-bottom: 1px solid var(--pp-border);
    background: linear-gradient(135deg, var(--pp-surface) 60%, rgba(245,200,66,0.03));
  }

  .pp-sign-card-ref {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--pp-gold);
    margin-bottom: 6px;
  }

  .pp-sign-card-title {
    font-family: var(--pp-font-display);
    font-size: 22px;
    font-weight: 800;
    color: var(--pp-text);
    letter-spacing: -0.03em;
    margin-bottom: 6px;
  }

  .pp-sign-card-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--pp-text-3);
  }

  .pp-sign-card-body {
    padding: 28px;
  }

  /* ── Contract text ── */
  .pp-contract-text {
    font-family: var(--pp-font-serif);
    font-size: 14.5px;
    color: var(--pp-text-2);
    line-height: 1.9;
  }

  .pp-contract-text p { margin-bottom: 1em; }
  .pp-contract-text p:last-child { margin-bottom: 0; }

  /* ── Signature panel ── */
  .pp-sign-panel {
    background: var(--pp-surface);
    border: 1px solid var(--pp-border);
    border-radius: var(--pp-radius);
    overflow: hidden;
  }

  .pp-sign-panel-header {
    padding: 14px 22px;
    border-bottom: 1px solid var(--pp-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pp-sign-panel-title {
    font-family: var(--pp-font-display);
    font-size: 14px;
    font-weight: 700;
    color: var(--pp-text);
    letter-spacing: -0.01em;
  }

  .pp-sign-panel-body {
    padding: 22px;
  }

  /* ── Sig mode tabs ── */
  .pp-sig-tabs {
    display: flex;
    gap: 2px;
    background: var(--pp-surface2);
    border: 1px solid var(--pp-border);
    border-radius: var(--pp-radius-sm);
    padding: 3px;
  }

  .pp-sig-tab {
    padding: 5px 14px;
    border-radius: 5px;
    font-size: 12px;
    color: var(--pp-text-3);
    cursor: pointer;
    transition: all var(--pp-transition);
    background: none;
    border: none;
  }

  .pp-sig-tab:hover { color: var(--pp-text-2); }

  .pp-sig-tab--active {
    background: var(--pp-surface);
    color: var(--pp-text);
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  /* ── Signature input ── */
  .pp-sign-field-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--pp-text-2);
    margin-bottom: 8px;
  }

  .pp-sig-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--pp-surface2);
    border: 1.5px solid var(--pp-border2);
    border-radius: var(--pp-radius-sm);
    font-family: var(--pp-font-serif);
    font-size: 20px;
    font-style: italic;
    color: var(--pp-text);
    outline: none;
    letter-spacing: 0.02em;
    transition: border-color var(--pp-transition), box-shadow var(--pp-transition);
  }

  .pp-sig-input:focus {
    border-color: var(--pp-gold-dim);
    box-shadow: 0 0 0 3px rgba(245, 200, 66, 0.08);
  }

  .pp-sig-input::placeholder {
    color: var(--pp-text-3);
    font-style: normal;
    font-size: 14px;
  }

  /* ── Signature preview ── */
  .pp-sig-preview {
    margin-top: 12px;
    padding: 14px 18px;
    background: var(--pp-surface2);
    border: 1px solid var(--pp-border);
    border-radius: var(--pp-radius-sm);
  }

  .pp-sig-preview-label {
    font-size: 10px;
    color: var(--pp-text-3);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .pp-sig-preview-text {
    font-family: var(--pp-font-serif);
    font-size: 26px;
    color: var(--pp-text);
    font-style: italic;
    letter-spacing: 0.02em;
  }

  /* ── Signature canvas ── */
  .pp-sig-canvas {
    width: 100%;
    height: 120px;
    background: var(--pp-surface2);
    border: 1.5px solid var(--pp-border2);
    border-radius: var(--pp-radius-sm);
    cursor: crosshair;
    display: block;
    touch-action: none;
    transition: border-color var(--pp-transition);
  }

  .pp-sig-canvas:active { border-color: var(--pp-gold-dim); }

  /* ── Divider ── */
  .pp-divider {
    border: none;
    border-top: 1px solid var(--pp-border);
    margin: 20px 0;
  }

  /* ── Consent ── */
  .pp-consent-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 18px;
  }

  .pp-consent-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
  }

  .pp-consent-cb {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1.5px solid var(--pp-border2);
    background: var(--pp-surface2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    transition: all var(--pp-transition);
  }

  .pp-consent-cb--checked {
    background: var(--pp-gold);
    border-color: var(--pp-gold);
    color: #0e0d0b;
  }

  .pp-consent-label {
    font-size: 13px;
    color: var(--pp-text-2);
    line-height: 1.5;
  }

  /* ── Submit button ── */
  .pp-sign-submit {
    width: 100%;
    height: 52px;
    background: var(--pp-gold);
    color: #0e0d0b;
    font-family: var(--pp-font-display);
    font-size: 15px;
    font-weight: 700;
    border: none;
    border-radius: var(--pp-radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    letter-spacing: -0.01em;
    transition: all var(--pp-transition);
    position: relative;
  }

  .pp-sign-submit:hover:not(:disabled) {
    background: #ffd54f;
    box-shadow: 0 0 32px rgba(245, 200, 66, 0.2);
    transform: translateY(-1px);
  }

  .pp-sign-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .pp-sign-submit.pp-btn--loading span:not(.pp-spinner) { opacity: 0; }

  .pp-sign-legal-note {
    font-size: 11.5px;
    color: var(--pp-text-3);
    text-align: center;
    margin-top: 12px;
  }

  /* ── Error ── */
  .pp-sign-error {
    padding: 10px 14px;
    background: rgba(224, 90, 74, 0.08);
    border: 1px solid rgba(224, 90, 74, 0.2);
    border-radius: var(--pp-radius-sm);
    font-size: 12.5px;
    color: var(--pp-red);
    margin-bottom: 14px;
  }

  /* ── State screens ── */
  @keyframes pp-fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: none; }
  }

  .pp-sign-state-icon {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    border: 2px solid;
    margin-bottom: 18px;
  }

  .pp-sign-state-title {
    font-family: var(--pp-font-display);
    font-size: 24px;
    font-weight: 800;
    color: var(--pp-text);
    letter-spacing: -0.03em;
    margin-bottom: 8px;
  }

  .pp-sign-state-sub {
    font-size: 14px;
    color: var(--pp-text-2);
    max-width: 400px;
    line-height: 1.7;
    margin: 0 auto 24px;
  }

  .pp-sign-success-detail {
    background: var(--pp-surface2);
    border: 1px solid var(--pp-border);
    border-radius: var(--pp-radius-sm);
    padding: 14px 20px;
    text-align: left;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
  }

  .pp-success-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    font-size: 12.5px;
  }

  .pp-success-row-label { color: var(--pp-text-3); }
  .pp-success-row-value { color: var(--pp-text); font-weight: 500; font-size: 12px; }

  /* ── Shared utilities ── */
  .pp-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--pp-radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--pp-transition);
    text-decoration: none;
  }

  .pp-btn-ghost {
    background: transparent;
    color: var(--pp-text-2);
    border: 1px solid var(--pp-border2);
  }

  .pp-btn-ghost:hover {
    background: var(--pp-surface2);
    color: var(--pp-text);
  }

  @keyframes pp-spin { to { transform: rotate(360deg); } }

  .pp-spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(14,13,11,0.25);
    border-top-color: #0e0d0b;
    animation: pp-spin 0.7s linear infinite;
    position: absolute;
  }

  .pp-btn--loading { color: transparent !important; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .pp-sign-page { padding: 16px 14px 48px; }
    .pp-sign-card-header { padding: 18px 20px 14px; }
    .pp-sign-card-body { padding: 20px; }
    .pp-sign-panel-body { padding: 18px; }
    .pp-sign-card-title { font-size: 18px; }
    .pp-sig-preview-text { font-size: 22px; }
    .pp-sign-submit { height: 48px; font-size: 14px; }
  }
`;
