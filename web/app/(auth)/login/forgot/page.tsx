"use client";

import { useState } from "react";
import Link from "next/link";
import api, { normaliseError } from "@/lib/api";

type View = "form" | "sent";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setView("sent");
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }

  if (view === "sent") {
    return (
      <div className="login-page login-page--centered">
        <div className="login-form-wrap">
          <Logo />
          <div className="login-success">
            <div className="login-success-icon">✉</div>
            <h2 className="login-form-title" style={{ textAlign: "center" }}>
              Check your inbox
            </h2>
            <p className="login-form-sub" style={{ textAlign: "center" }}>
              If <strong style={{ color: "var(--pp-text)" }}>{email}</strong> has an
              account, we sent it a reset link.
              <br />
              Check your spam folder if you don't see it.
            </p>
          </div>
          <Link href="/login" className="login-submit" style={{ marginTop: 28, textDecoration: "none" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page login-page--centered">
      <div className="login-form-wrap">
        <Logo />
        <header className="login-form-header">
          <h2 className="login-form-title">Reset your password</h2>
          <p className="login-form-sub">
            Enter your email and we'll send a reset link
          </p>
        </header>

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
              className="login-input"
              placeholder="kofi@partyparadise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
          </div>

          <button
            type="submit"
            className={`login-submit${loading ? " login-submit--loading" : ""}`}
            disabled={loading || !email}
          >
            {loading && <span className="login-spinner" />}
            <span>Send reset link</span>
          </button>
        </form>

        <p className="login-switch" style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/login" className="login-forgot">← Back to sign in</Link>
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
        <div className="login-logo-sub">Event Management</div>
      </div>
    </div>
  );
}
