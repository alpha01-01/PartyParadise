"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBooking, updateBooking } from "@/hooks/useBookings";
import { formatCurrency, cn } from "@/lib/utils";
import type { Booking, ServiceType } from "@/lib/types";

export default function EditBookingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { booking, loading, error, refresh } = useBooking(id);
  const [form, setForm] = useState<Partial<Booking>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (booking) setForm(booking);
  }, [booking]);

  function updateField<K extends keyof Booking>(key: K, value: Booking[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSubmitError(null);
    try {
      await updateBooking(id, form);
      refresh();
      router.push(`/bookings/${id}`);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to update booking");
    }
    setSaving(false);
  }

  if (loading) return <div>Loading...</div>;
  if (error || !booking) return <div>Error loading booking.</div>;

  return (
    <div className="pp-card" style={{ maxWidth: 600, margin: "32px auto" }}>
      <h2>Edit Booking</h2>

      {/* Contract/Invoice existence */}
      <div style={{ marginBottom: 18, padding: 12, background: "var(--pp-surface2)", borderRadius: 8, border: "1px solid var(--pp-border2)", fontSize: 14 }}>
        <div style={{ marginBottom: 6 }}>
          <strong>Invoice:</strong> {booking.invoice ? (
            <>
              <span style={{ color: "var(--pp-green)", fontWeight: 500 }}>Exists</span> —
              {"id" in booking.invoice && "reference" in booking.invoice ? (
                <a href={`/invoices/${(booking.invoice as any).id}`} style={{ color: "var(--pp-gold)", textDecoration: "underline", marginLeft: 6 }}>View {(booking.invoice as any).reference}</a>
              ) : (
                <span style={{ color: "var(--pp-text-3)" }}>Invoice details unavailable</span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--pp-text-3)" }}>No invoice yet</span>
          )}
        </div>
        <div>
          <strong>Contract:</strong> {booking.contract ? (
            <>
              <span style={{ color: "var(--pp-green)", fontWeight: 500 }}>Exists</span> —
              {"id" in booking.contract && "reference" in booking.contract ? (
                <a href={`/contracts/${(booking.contract as any).id}`} style={{ color: "var(--pp-gold)", textDecoration: "underline", marginLeft: 6 }}>View {(booking.contract as any).reference}</a>
              ) : (
                <span style={{ color: "var(--pp-text-3)" }}>Contract details unavailable</span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--pp-text-3)" }}>No contract yet</span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label>
          Event Type
          <input
            className="pp-input"
            value={form.event_type || ""}
            onChange={e => updateField("event_type", e.target.value)}
          />
        </label>
        <label>
          Event Date
          <input
            className="pp-input"
            type="date"
            value={form.event_date || ""}
            onChange={e => updateField("event_date", e.target.value)}
          />
        </label>
        <label>
          Venue Name
          <input
            className="pp-input"
            value={form.venue_name || ""}
            onChange={e => updateField("venue_name", e.target.value)}
          />
        </label>
        <label>
          Guest Count
          <input
            className="pp-input"
            type="number"
            value={form.guest_count || ""}
            onChange={e => updateField("guest_count", Number(e.target.value))}
          />
        </label>
        {/* Add more fields as needed */}
        {submitError && <div className="pp-error">{submitError}</div>}
        <button className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")}
          type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
