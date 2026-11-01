"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (error) clearError();
  }, [email, password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await login({ email, password });
      router.replace("/");
    } catch {
      // error handled by store
    }
  }

  return (
    <div className="login-page">
      <aside className="login-left">
        <div className="dot-grid" />
        <div className="login-left-inner">
          <Logo />
          <div className="login-brand">
            <h1 className="login-brand-title">
              Run your events<br />with <em>confidence</em>
            </h1>
            <p className="login-brand-desc">
              Everything you need to manage bookings, clients, invoices, and your team — in one place.
            </p>
            <ul className="login-features">
              {FEATURES.map(({ label }) => (
                <li key={label} className="login-feature">
                  <div className="login-feature-dot">✦</div>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="login-left-footer">© 2025 PartyParadise · Accra, Ghana</p>
        </div>
      </aside>

      <main className="login-right">
        <div className="login-form-wrap">
          <header className="login-form-header">
            <h2 className="login-form-title">Welcome back</h2>
            <p className="login-form-sub">Sign in to your staff account</p>
          </header>

          {error && (
            <div className="login-error" role="alert" aria-live="polite">
              <span className="login-error-dot" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label className="login-field-label" htmlFor="email">Email address</label>
              <div className="login-field-wrap">
                <input
                  id="email"
                  type="email"
                  className={`login-input${error ? " login-input--error" : ""}`}
                  placeholder="kofi@partyparadise.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-field-label" htmlFor="password">Password</label>
              <div className="login-field-wrap" style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`login-input${error ? " login-input--error" : ""}`}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "◎" : "○"}
                </button>
              </div>
            </div>

            <div className="login-row">
              <Link href="/login/forgot" className="login-forgot">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className={`login-submit${isLoading ? " login-submit--loading" : ""}`}
              disabled={isLoading || !email || !password}
            >
              {isLoading && <span className="login-spinner" />}
              <span>Sign in</span>
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div className="login-logo">
      <div className="login-logo-mark"><span>P</span></div>
      <div>
        <div className="login-logo-name">PartyParadise</div>
        <div className="login-logo-sub">Event Management</div>
      </div>
    </div>
  );
}

const FEATURES = [
  { label: "Client & booking management" },
  { label: "Invoicing & payment tracking" },
  { label: "Inventory & equipment tracking" },
  { label: "Reports & profitability insights" },
];
