"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import api, { setPortalAccessToken, normaliseError } from "@/lib/api";

export default function PortalSetupPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function validate(): string | null {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter";
    if (!/[0-9]/.test(password)) return "Include at least one number";
    if (password !== confirm) return "Passwords do not match";
    return null;
  }

  // Password strength score 0-4
  function strength(): number {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["", "#e05a4a", "#f5c842", "#7aa3e0", "#4caf7d"];
  const s = strength();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError(null);

    try {
      await api.post(`/portal/auth/setup/${token}`, { password });
      setSuccess(true);
      // Auto-redirect after 2.5s
      setTimeout(() => router.replace("/portal/login"), 2500);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{css}</style>

      <div className="bg">
        <div className="bg-grid" />
        <div className="bg-glow" />
      </div>

      <div className="setup-shell">
        <div className="setup-logo">
          <div className="setup-logo-mark"><span>P</span></div>
          <span className="setup-logo-name">PartyParadise</span>
        </div>

        <div className="setup-card">
          {success ? (
            <div className="setup-success">
              <div className="setup-success-icon">
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <path d="M5 13l6 6L21 7" stroke="#4caf7d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="setup-success-title">Account activated!</h2>
              <p className="setup-success-sub">
                Your portal account is ready. Redirecting you to login…
              </p>
              <Link href="/portal/login" className="setup-login-btn">
                Go to login →
              </Link>
            </div>
          ) : (
            <>
              <div className="setup-header">
                <h1 className="setup-title">Set your password</h1>
                <p className="setup-sub">
                  You've been invited to PartyParadise. Create a password to access your client portal.
                </p>
              </div>

              {error && (
                <div className="setup-error">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="setup-field">
                  <label className="setup-label">New password</label>
                  <div className="setup-input-wrap">
                    <input
                      className="setup-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="setup-pw-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" strokeWidth="1.3"/>
                        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                        {!showPassword && <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
                      </svg>
                    </button>
                  </div>

                  {/* Strength meter */}
                  {password.length > 0 && (
                    <div className="setup-strength">
                      <div className="setup-strength-bars">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="setup-strength-bar"
                            style={{
                              background: i <= s ? strengthColor[s] : "#232019",
                              transition: "background 0.3s",
                            }}
                          />
                        ))}
                      </div>
                      <span className="setup-strength-label" style={{ color: strengthColor[s] }}>
                        {strengthLabel[s]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="setup-field">
                  <label className="setup-label">Confirm password</label>
                  <div className="setup-input-wrap">
                    <input
                      className={`setup-input ${confirm && confirm !== password ? "setup-input--error" : ""}`}
                      type={showPassword ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    />
                    {confirm && confirm === password && (
                      <span className="setup-match-icon">
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7l3 3 5-6" stroke="#4caf7d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </div>
                </div>

                {/* Requirements */}
                <div className="setup-reqs">
                  {[
                    { label: "At least 8 characters", met: password.length >= 8 },
                    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
                    { label: "One number", met: /[0-9]/.test(password) },
                  ].map((req) => (
                    <div key={req.label} className="setup-req">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        {req.met ? (
                          <path d="M2 6l3 3 5-6" stroke="#4caf7d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        ) : (
                          <circle cx="6" cy="6" r="4" stroke="#5c5444" strokeWidth="1.2"/>
                        )}
                      </svg>
                      <span style={{ color: req.met ? "#9c9278" : "#5c5444" }}>{req.label}</span>
                    </div>
                  ))}
                </div>

                <button type="submit" className="setup-submit" disabled={loading}>
                  {loading ? (
                    <><span className="setup-spinner" /> Setting up account…</>
                  ) : (
                    <>Activate my account <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></>
                  )}
                </button>
              </form>

              <p className="setup-footer">
                Already have an account? <Link href="/portal/login" className="setup-link">Sign in</Link>
              </p>
            </>
          )}
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

  .bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
  .bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(245,200,66,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(245,200,66,0.025) 1px, transparent 1px); background-size: 48px 48px; }
  .bg-glow { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(245,200,66,0.06) 0%, transparent 70%); top: -150px; left: 50%; transform: translateX(-50%); }

  .setup-shell { position: relative; z-index: 1; width: 100%; max-width: 420px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
  .setup-logo { display: flex; align-items: center; gap: 10px; }
  .setup-logo-mark { width: 32px; height: 32px; border-radius: 8px; background: #f5c842; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 18px rgba(245,200,66,0.2); }
  .setup-logo-mark span { font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 800; color: #0e0d0b; }
  .setup-logo-name { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: #f0ead8; letter-spacing: -0.02em; }

  .setup-card { width: 100%; background: #141310; border: 1px solid rgba(255,220,100,0.08); border-radius: 14px; padding: 36px 32px; box-shadow: 0 24px 60px rgba(0,0,0,0.5); }

  .setup-success { text-align: center; padding: 12px 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .setup-success-icon { width: 60px; height: 60px; border-radius: 50%; background: rgba(76,175,125,0.1); border: 1.5px solid rgba(76,175,125,0.25); display: flex; align-items: center; justify-content: center; }
  .setup-success-title { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; color: #f0ead8; letter-spacing: -0.02em; }
  .setup-success-sub { font-size: 13px; color: #9c9278; max-width: 260px; line-height: 1.6; }
  .setup-login-btn { margin-top: 8px; padding: 10px 24px; border-radius: 6px; background: #f5c842; color: #0e0d0b; font-size: 13.5px; font-weight: 600; display: inline-block; }

  .setup-header { margin-bottom: 24px; }
  .setup-title { font-family: 'Syne', sans-serif; font-size: 21px; font-weight: 700; color: #f0ead8; letter-spacing: -0.03em; margin-bottom: 5px; }
  .setup-sub { font-size: 13px; color: #9c9278; line-height: 1.6; }

  .setup-error { display: flex; align-items: center; gap: 8px; background: rgba(224,90,74,0.1); border: 1px solid rgba(224,90,74,0.2); border-radius: 6px; padding: 10px 14px; font-size: 12.5px; color: #e05a4a; margin-bottom: 18px; }

  .setup-field { margin-bottom: 16px; }
  .setup-label { display: block; font-size: 12px; font-weight: 500; color: #9c9278; margin-bottom: 6px; letter-spacing: 0.02em; }
  .setup-input-wrap { position: relative; }
  .setup-input { width: 100%; padding: 10px 36px 10px 12px; background: #1c1a16; border: 1px solid rgba(255,220,100,0.14); border-radius: 6px; color: #f0ead8; font-size: 13.5px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
  .setup-input:focus { border-color: #c49a20; box-shadow: 0 0 0 3px rgba(245,200,66,0.08); }
  .setup-input::placeholder { color: #5c5444; }
  .setup-input--error { border-color: rgba(224,90,74,0.4) !important; }
  .setup-pw-btn { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; color: #5c5444; padding: 4px; border-radius: 4px; display: flex; transition: color 0.2s; }
  .setup-pw-btn:hover { color: #9c9278; }
  .setup-match-icon { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); display: flex; }

  .setup-strength { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .setup-strength-bars { display: flex; gap: 4px; flex: 1; }
  .setup-strength-bar { flex: 1; height: 3px; border-radius: 2px; }
  .setup-strength-label { font-size: 11px; font-weight: 500; min-width: 36px; text-align: right; }

  .setup-reqs { display: flex; flex-direction: column; gap: 5px; margin: 4px 0 20px; }
  .setup-req { display: flex; align-items: center; gap: 6px; font-size: 12px; }

  .setup-submit { width: 100%; padding: 11px; border-radius: 6px; background: #f5c842; color: #0e0d0b; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
  .setup-submit:hover:not(:disabled) { background: #ffd54f; box-shadow: 0 0 22px rgba(245,200,66,0.18); }
  .setup-submit:disabled { opacity: 0.6; cursor: not-allowed; }

  @keyframes setup-spin { to { transform: rotate(360deg); } }
  .setup-spinner { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.2); border-top-color: #0e0d0b; border-radius: 50%; animation: setup-spin 0.7s linear infinite; }

  .setup-footer { margin-top: 20px; text-align: center; font-size: 12px; color: #5c5444; }
  .setup-link { color: #c49a20; transition: color 0.2s; }
  .setup-link:hover { color: #f5c842; }
`;
