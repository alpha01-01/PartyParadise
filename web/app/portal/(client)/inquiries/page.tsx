"use client";

import { useState } from "react";
import { normaliseError, portalApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { PageHeading, PortalList, statusLabel, usePortalData } from "../portalData";

type PortalInquiry = {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

const EMPTY_FORM = { subject: "", preferred_date: "", venue: "", message: "" };

export default function PortalInquiriesPage() {
  const { data, loading, error, reload } = usePortalData<PortalInquiry[]>("/portal/inquiries");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function setField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setFormError("Add a subject and a message");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await portalApi.post("/portal/inquiries", {
        subject: form.subject,
        message: form.message,
        venue: form.venue || undefined,
        preferred_date: form.preferred_date || undefined,
      });
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      setFormError(normaliseError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading title="Enquiries" subtitle="Ask about a new event or service." />
      <form className="pp-card" style={{ display: "grid", gap: 12 }} onSubmit={handleSubmit}>
        {formError && <div className="pp-alert pp-alert-error">{formError}</div>}
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="subject">Subject</label>
          <input id="subject" className="pp-input" value={form.subject} onChange={(e) => setField("subject", e.target.value)} />
        </div>
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="preferred_date">Preferred date</label>
            <input id="preferred_date" className="pp-input" type="date" value={form.preferred_date} onChange={(e) => setField("preferred_date", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="venue">Venue</label>
            <input id="venue" className="pp-input" value={form.venue} onChange={(e) => setField("venue", e.target.value)} />
          </div>
        </div>
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="message">Message</label>
          <textarea id="message" className="pp-input" rows={4} value={form.message} onChange={(e) => setField("message", e.target.value)} />
        </div>
        <div>
          <button type="submit" className="pp-btn pp-btn-primary" disabled={saving}>
            {saving ? "Sending..." : "Send enquiry"}
          </button>
        </div>
      </form>

      <PortalList loading={loading} error={error} empty={!data?.length && "No enquiries yet"}>
        <table className="pp-table">
          <thead>
            <tr><th>Subject</th><th>Sent</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data?.map((inquiry) => (
              <tr key={inquiry.id}>
                <td>{inquiry.subject}</td>
                <td>{formatDate(inquiry.created_at, "short")}</td>
                <td>{statusLabel(inquiry.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PortalList>
    </>
  );
}
