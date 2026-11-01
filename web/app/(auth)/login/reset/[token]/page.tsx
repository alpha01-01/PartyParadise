"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api, { normaliseError } from "@/lib/api";

export default function ResetPasswordPage() {
  const params = useParams();
  const token = params.token as string;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 8 characters, with a capital letter and a number");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page login-page--centered">
      <div className="login-form-wrap">
        {done ? (
          <>
            <header className="login-form-header">
              <h1 className="login-form-title">Password updated</h1>
              <p className="login-form-sub">You can now sign in with your new password.</p>
            </header>
            <Link href="/login" className="login-submit" style={{ textDecoration: "none" }}>
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <header className="login-form-header">
              <h1 className="login-form-title">Choose a password</h1>
              <p className="login-form-sub">Use at least 8 characters, with a capital letter and a number.</p>
            </header>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="login-error" role="alert">
                  <span className="login-error-dot" />
                  {error}
                </div>
              )}
              <div className="login-field">
                <label className="login-field-label" htmlFor="password">New password</label>
                <input
                  id="password"
                  className="login-input"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="login-field">
                <label className="login-field-label" htmlFor="confirm">Confirm password</label>
                <input
                  id="confirm"
                  className="login-input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
