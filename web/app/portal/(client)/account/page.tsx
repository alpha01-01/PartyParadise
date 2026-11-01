"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearPortalTokens, normaliseError, portalApi } from "@/lib/api";
import { PageHeading } from "../portalData";

export default function PortalAccountPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await portalApi.post("/portal/auth/change-password", { current_password: current, password });
      clearPortalTokens();
      router.replace("/portal/login");
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="Account" subtitle="Change your password. You will sign in again afterwards." />
      <form className="pp-card" style={{ display: "grid", gap: 12, maxWidth: 420 }} onSubmit={handleSubmit}>
        {error && <div className="pp-alert pp-alert-error">{error}</div>}
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="current">Current password</label>
          <input id="current" className="pp-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="password">New password</label>
          <input id="password" className="pp-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="confirm">Confirm new password</label>
          <input id="confirm" className="pp-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div>
          <button type="submit" className="pp-btn pp-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Change password"}
          </button>
        </div>
      </form>
    </>
  );
}
