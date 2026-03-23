"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api, { setPortalAccessToken } from "@/lib/api";
import { normaliseError } from "@/lib/api";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = "Email is required";
    if (!password) errs.password = "Password is required";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post("/portal/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });

      setPortalAccessToken(data.access_token);
      if (typeof window !== "undefined") {
        localStorage.setItem("pp_portal_refresh", data.refresh_token);
      }

      router.replace("/portal/dashboard");
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{css}</style>

      <div className="lp-bg">
        <div className="lp-grid" />
        <div className="lp-glow" />
      </div>

      <div className="pl-shell">
        {/* Logo */}
        <div className="pl-logo">
          <div className="pl-logo-mark"><span>P</span></div>
          <span className="pl-logo-name">PartyParadise</span>
        </div>

        <div className="pl-card">
          <div className="pl-header">
            <h1 className="pl-title">Client portal</h1>
            <p className="pl-sub">
              View your bookings, invoices, and event documents
            </p>
          </div>

          {error && (
            <div className="pl-error">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="pl-field">
              <label className="pl-label">Email address</label>
              <div className="pl-input-wrap">
                <svg className="pl-input-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M2 6l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  className={`pl-input ${fieldErrors.email ? "pl-input--error" : ""}`}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {fieldErrors.email && <span className="pl-field-error">{fieldErrors.email}</span>}
            </div>

            <div className="pl-field">
              <label className="pl-label">Password</label>
              <div className="pl-input-wrap">
                <svg className="pl-input-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  <circle cx="8" cy="10.5" r="1" fill="currentColor"/>
                </svg>
                <input
                  className={`pl-input ${fieldErrors.password ? "pl-input--error" : ""}`}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pl-pw-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" strokeWidth="1.3"/>
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && <span className="pl-field-error">{fieldErrors.password}</span>}
            </div>

            <button type="submit" className="pl-submit" disabled={loading}>
              {loading ? (
                <><span className="pl-spinner" /> Signing in…</>
              ) : (
                <>Access my portal <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></>
              )}
            </button>
          </form>

          <div className="pl-divider"><span>or</span></div>

          <Link href="/login" className="pl-back-btn">
            ← Staff login
          </Link>

          <p className="pl-footer">
            No account? Ask your event coordinator to invite you.
          </p>
        </div>
      </div>
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap');
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0e0d0b; font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  a { text-decoration: none; }
  button { cursor: pointer; font: inherit; border: none; }

  .lp-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
  .lp-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(245,200,66,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(245,200,66,0.025) 1px, transparent 1px); background-size: 48px 48px; }
  .lp-glow { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(245,200,66,0.06) 0%, transparent 70%); top: -150px; left: 50%; transform: translateX(-50%); }

  .pl-shell { position: relative; z-index: 1; width: 100%; max-width: 420px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 24px; }

  .pl-logo { display: flex; align-items: center; gap: 10px; }
  .pl-logo-mark { width: 32px; height: 32px; border-radius: 8px; background: #f5c842; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 18px rgba(245,200,66,0.2); }
  .pl-logo-mark span { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 800; color: #0e0d0b; line-height: 1; }
  .pl-logo-name { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: #f0ead8; letter-spacing: -0.02em; }

  .pl-card { width: 100%; background: #141310; border: 1px solid rgba(255,220,100,0.08); border-radius: 14px; padding: 36px 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.5); }

  .pl-header { margin-bottom: 26px; }
  .pl-title { font-family: 'Syne', sans-serif; font-size: 21px; font-weight: 700; color: #f0ead8; letter-spacing: -0.03em; margin-bottom: 4px; }
  .pl-sub { font-size: 13px; color: #9c9278; }

  .pl-error { display: flex; align-items: center; gap: 8px; background: rgba(224,90,74,0.1); border: 1px solid rgba(224,90,74,0.2); border-radius: 6px; padding: 10px 14px; font-size: 12.5px; color: #e05a4a; margin-bottom: 18px; }

  .pl-field { margin-bottom: 15px; }
  .pl-label { display: block; font-size: 12px; font-weight: 500; color: #9c9278; margin-bottom: 6px; letter-spacing: 0.02em; }
  .pl-input-wrap { position: relative; }
  .pl-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #5c5444; pointer-events: none; }
  .pl-input { width: 100%; padding: 10px 12px 10px 36px; background: #1c1a16; border: 1px solid rgba(255,220,100,0.14); border-radius: 6px; color: #f0ead8; font-size: 13.5px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
  .pl-input:focus { border-color: #c49a20; box-shadow: 0 0 0 3px rgba(245,200,66,0.08); }
  .pl-input::placeholder { color: #5c5444; }
  .pl-input--error { border-color: rgba(224,90,74,0.5) !important; }
  .pl-field-error { font-size: 11.5px; color: #e05a4a; margin-top: 4px; display: block; }
  .pl-pw-btn { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; color: #5c5444; padding: 4px; border-radius: 4px; display: flex; transition: color 0.2s; }
  .pl-pw-btn:hover { color: #9c9278; }

  .pl-submit { width: 100%; margin-top: 20px; padding: 11px; border-radius: 6px; background: #f5c842; color: #0e0d0b; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
  .pl-submit:hover:not(:disabled) { background: #ffd54f; box-shadow: 0 0 22px rgba(245,200,66,0.18); }
  .pl-submit:disabled { opacity: 0.6; cursor: not-allowed; }

  @keyframes pl-spin { to { transform: rotate(360deg); } }
  .pl-spinner { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.2); border-top-color: #0e0d0b; border-radius: 50%; animation: pl-spin 0.7s linear infinite; }

  .pl-divider { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: #5c5444; font-size: 11.5px; }
  .pl-divider::before, .pl-divider::after { content: ''; flex: 1; height: 1px; background: rgba(255,220,100,0.08); }

  .pl-back-btn { display: block; width: 100%; padding: 10px; border-radius: 6px; background: transparent; color: #9c9278; font-size: 13px; border: 1px solid rgba(255,220,100,0.12); text-align: center; transition: all 0.2s; }
  .pl-back-btn:hover { background: #1c1a16; color: #f0ead8; }

  .pl-footer { margin-top: 18px; text-align: center; font-size: 11.5px; color: #5c5444; }
`;
