"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useClient, updateClient } from "@/hooks";
import type { ClientStatus, ClientType } from "@/lib/types";

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const { client, loading, error } = useClient(id);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!client) return;
    setForm({
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      whatsapp: client.whatsapp ?? "",
      source: client.source ?? "",
      status: client.status ?? "lead",
      client_type: client.client_type ?? "individual",
      notes: client.notes ?? "",
    });
  }, [client]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setSubmitError("First and last name are required.");
      return;
    }

    setSaving(true);
    try {
      await updateClient(id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        source: form.source.trim() || undefined,
        status: form.status,
        client_type: form.client_type,
        notes: form.notes.trim() || undefined,
      });
      router.push(`/clients/${id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update client";
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="pp-card">
        <div className="pp-skeleton" style={{ height: 20, width: 220, marginBottom: 10 }} />
        <div className="pp-skeleton" style={{ height: 12, width: 320 }} />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-icon">Edit</div>
        <div className="pp-empty-title">Client not found</div>
        <p className="pp-empty-sub">{error ?? "This client no longer exists."}</p>
        <Link href="/clients" className="pp-btn pp-btn-primary" style={{ marginTop: 10 }}>
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Relationship Editing</span>
          <h1 className="pp-page-title">Edit Client</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Refine the contact profile, lifecycle status, and internal notes so bookings, invoices, and portal access stay aligned.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{client.first_name} {client.last_name}</span>
            <span>{form.status.replace(/_/g, " ")}</span>
            <span>{form.client_type}</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <Link href={`/clients/${id}`} className="pp-btn pp-btn-ghost">Back to profile</Link>
        </div>
      </section>

      {submitError && <div className="pp-alert pp-alert-error">{submitError}</div>}

      <div className="pp-toolbar-note">
        <span>Keep the relationship record current here so the rest of the workspace reads from one reliable client profile.</span>
        <span>Use notes for internal context only; everything else should stay ready for quoting, delivery, and finance handoff.</span>
      </div>

      <form onSubmit={handleSubmit} className="pp-edit-shell">
        <div className="pp-edit-grid">
          <section className="pp-card pp-edit-card">
            <div className="pp-card-header">
              <span className="pp-card-title">Core Identity</span>
              <span className="pp-card-link">Who this relationship belongs to</span>
            </div>
            <div className="pp-edit-card-body">
              <div className="pp-row-2">
                <div className="pp-field">
                  <label className="pp-field-label">First name <span className="pp-required">*</span></label>
                  <input className="pp-input" value={form.first_name} onChange={(event) => setField("first_name", event.target.value)} />
                </div>
                <div className="pp-field">
                  <label className="pp-field-label">Last name <span className="pp-required">*</span></label>
                  <input className="pp-input" value={form.last_name} onChange={(event) => setField("last_name", event.target.value)} />
                </div>
              </div>

              <div className="pp-row-2" style={{ marginTop: 12 }}>
                <div className="pp-field">
                  <label className="pp-field-label">Email</label>
                  <input className="pp-input" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
                </div>
                <div className="pp-field">
                  <label className="pp-field-label">Phone</label>
                  <input className="pp-input" value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
                </div>
              </div>

              <div className="pp-row-2" style={{ marginTop: 12 }}>
                <div className="pp-field">
                  <label className="pp-field-label">WhatsApp</label>
                  <input className="pp-input" value={form.whatsapp} onChange={(event) => setField("whatsapp", event.target.value)} />
                </div>
                <div className="pp-field">
                  <label className="pp-field-label">Source</label>
                  <input className="pp-input" value={form.source} onChange={(event) => setField("source", event.target.value)} placeholder="Referral, Instagram, walk-in, planner..." />
                </div>
              </div>
            </div>
          </section>

          <section className="pp-card pp-edit-card">
            <div className="pp-card-header">
              <span className="pp-card-title">Relationship Settings</span>
              <span className="pp-card-link">Lifecycle, type, and internal context</span>
            </div>
            <div className="pp-edit-card-body">
              <div className="pp-row-2">
                <div className="pp-field">
                  <label className="pp-field-label">Status</label>
                  <select className="pp-input" value={form.status} onChange={(event) => setField("status", event.target.value as ClientStatus)}>
                    <option value="lead">Lead</option>
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="past">Past</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div className="pp-field">
                  <label className="pp-field-label">Client type</label>
                  <select className="pp-input" value={form.client_type} onChange={(event) => setField("client_type", event.target.value as ClientType)}>
                    <option value="individual">Individual</option>
                    <option value="corporate">Corporate</option>
                    <option value="planner">Planner</option>
                  </select>
                </div>
              </div>

              <div className="pp-field" style={{ marginTop: 12 }}>
                <label className="pp-field-label">Internal notes</label>
                <textarea
                  className="pp-input"
                  rows={6}
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  placeholder="Preferences, negotiation context, event style cues, payment expectations, or anything the team should remember."
                />
              </div>
            </div>
          </section>
        </div>

        <div className="pp-edit-actions">
          <button className="pp-btn pp-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/clients/${id}`} className="pp-btn pp-btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
