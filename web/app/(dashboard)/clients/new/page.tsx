"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/hooks";
import type { ClientStatus, ClientType } from "@/lib/types";

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    whatsapp: "",
    source: "",
    status: "lead" as ClientStatus,
    client_type: "individual" as ClientType,
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.first_name || !form.last_name) {
      setError("First and last name are required.");
      return;
    }
    setLoading(true);
    try {
      const client = await createClient({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        whatsapp: form.whatsapp || undefined,
        source: form.source || undefined,
        status: form.status,
        client_type: form.client_type,
        notes: form.notes || undefined,
      });
      router.push(`/clients/${client.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">Add Client</h1>
          <p className="pp-page-subtitle">Create a new client profile</p>
        </div>
        <Link href="/clients" className="pp-btn pp-btn-ghost">Back to Clients</Link>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="pp-card" style={{ maxWidth: 720 }}>
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label">First name <span className="pp-required">*</span></label>
            <input className="pp-input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Last name <span className="pp-required">*</span></label>
            <input className="pp-input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label">Email</label>
            <input className="pp-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Phone</label>
            <input className="pp-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label">WhatsApp</label>
            <input className="pp-input" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Source</label>
            <input className="pp-input" value={form.source} onChange={(e) => set("source", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label">Status</label>
            <select className="pp-input" value={form.status} onChange={(e) => set("status", e.target.value as ClientStatus)}>
              <option value="lead">Lead</option>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="past">Past</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Client type</label>
            <select className="pp-input" value={form.client_type ?? "individual"} onChange={(e) => set("client_type", e.target.value as ClientType)}>
              <option value="individual">Individual</option>
              <option value="corporate">Corporate</option>
              <option value="planner">Planner</option>
            </select>
          </div>
        </div>

        <div className="pp-field" style={{ marginTop: 12 }}>
          <label className="pp-field-label">Notes</label>
          <textarea className="pp-input" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="pp-btn pp-btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Create Client"}
          </button>
          <Link href="/clients" className="pp-btn pp-btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
