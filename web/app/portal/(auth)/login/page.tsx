"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { portalApi, setPortalAccessToken, setPortalRefreshToken } from "@/lib/api";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await portalApi.post<{
        access_token: string;
        refresh_token: string;
      }>("/portal/auth/login", { email, password });

      setPortalAccessToken(data.access_token);
      setPortalRefreshToken(data.refresh_token);
      router.replace("/portal/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ?? "Invalid email or password";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page login-page--centered">
      <div className="login-form-wrap">
        <Logo />

        <header className="login-form-header">
          <h2 className="login-form-title">Client portal</h2>
          <p className="login-form-sub">
            Access your bookings, invoices & contracts
          </p>
        </header>

        <div className="login-tabs">
          <Link href="/login" className="login-tab">Staff</Link>
          <span className="login-tab login-tab--active">Client Portal</span>
        </div>

        {error && (
          <div className="login-error" role="alert">
            <span className="login-error-dot" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-field-label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              className={`login-input${error ? " login-input--error" : ""}`}
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label className="login-field-label" htmlFor="password">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className={`login-input${error ? " login-input--error" : ""}`}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoComplete="current-password"
                style={{ paddingRight: 42 }}
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? "◎" : "○"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`login-submit${loading ? " login-submit--loading" : ""}`}
            disabled={loading || !email || !password}
            style={{ marginTop: 8 }}
          >
            {loading && <span className="login-spinner" />}
            <span>Sign in to portal</span>
          </button>
        </form>

        <p className="login-switch">
          Staff member?{" "}
          <Link href="/login" className="login-forgot">Staff login →</Link>
        </p>

        <p className="login-switch" style={{ marginTop: 8 }}>
          First time here?{" "}
          <span style={{ color: "var(--pp-text-2)" }}>
            Contact us to get your invitation link.
          </span>
        </p>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="login-logo" style={{ marginBottom: 32 }}>
      <div className="login-logo-mark"><span>P</span></div>
      <div>
        <div className="login-logo-name">PartyParadise</div>
        <div className="login-logo-sub">Client Portal</div>
      </div>
    </div>
  );
}
