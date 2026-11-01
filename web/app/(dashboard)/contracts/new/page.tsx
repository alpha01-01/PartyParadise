"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBookings } from "@/hooks/useBookings";
import { createContract, useContractTemplates } from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Booking } from "@/lib/types";

export default function NewContractPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookingFromQuery = searchParams.get("booking");

  const { bookings, loading: bookingsLoading } = useBookings({ page_size: 50 });
  const { templates, loading: templatesLoading } = useContractTemplates();

  const [bookingId, setBookingId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [specialTerms, setSpecialTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bookingFromQuery) setBookingId(bookingFromQuery);
  }, [bookingFromQuery]);

  const selectedBooking = useMemo(() => {
    return bookings.find((b) => b.id === bookingId) ?? null;
  }, [bookings, bookingId]);

  const totalEstimate = useMemo(() => {
    if (!selectedBooking?.services?.length) return 0;
    return selectedBooking.services.reduce((sum, s) => sum + s.price, 0);
  }, [selectedBooking]);

  const templateOptions = useMemo(() => {
    if (!selectedBooking) return templates;
    return templates.filter((t) =>
      !t.service_type || t.service_type === selectedBooking.service_type
    );
  }, [templates, selectedBooking]);

  async function handleCreate() {
    if (!bookingId) {
      setError("Select a booking first.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload: {
        booking_id: string;
        template_id?: string;
        special_terms?: string;
        deposit_amount?: number;
      } = { booking_id: bookingId };
      if (templateId) payload.template_id = templateId;
      if (specialTerms.trim()) payload.special_terms = specialTerms.trim();
      if (depositAmount.trim()) payload.deposit_amount = Number(depositAmount);

      const contract = await createContract(payload);
      router.push(`/contracts/${contract.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create contract");
    } finally {
      setSaving(false);
    }
  }

  const loading = bookingsLoading || templatesLoading;

  return (
    <>
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">Create Contract</h1>
          <p className="pp-page-subtitle">
            Generate a contract from a confirmed booking
          </p>
        </div>
        <Link href="/contracts" className="pp-btn pp-btn-ghost">
          Back to Contracts
        </Link>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <div className="pp-card" style={{ padding: 18 }}>
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="booking-1">
              Booking <span className="pp-required">*</span>
            </label>
            <select id="booking-1"
              className="pp-input"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select booking...</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.client_name} • #{b.reference}
                </option>
              ))}
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field-label" htmlFor="template-1">Template</label>
            <select id="template-1"
              className="pp-input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={loading}
            >
              <option value="">Auto select (recommended)</option>
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.service_type ? ` • ${t.service_type.replace("_", " ")}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="deposit-amount-ghs-1">Deposit amount (GHS)</label>
            <input id="deposit-amount-ghs-1"
              className="pp-input"
              type="number"
              placeholder="Optional"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              min={0}
              step="0.01"
            />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="special-terms-1">Special terms</label>
            <input id="special-terms-1"
              className="pp-input"
              placeholder="Add any extra clauses"
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
            />
          </div>
        </div>

        {selectedBooking && (
          <div className="pp-card" style={{ marginTop: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Booking summary
            </div>
            <div className="pp-text-muted" style={{ fontSize: 13 }}>
              {selectedBooking.client_name} • #{selectedBooking.reference}
            </div>
            <div className="pp-row-3" style={{ marginTop: 12 }}>
              <div className="pp-card" style={{ padding: 12 }}>
                <div className="pp-text-muted">Event date</div>
                <div style={{ fontWeight: 600 }}>{formatDate(selectedBooking.event_date)}</div>
              </div>
              <div className="pp-card" style={{ padding: 12 }}>
                <div className="pp-text-muted">Service</div>
                <div style={{ fontWeight: 600 }}>{selectedBooking.service_type.replace("_", " ")}</div>
              </div>
              <div className="pp-card" style={{ padding: 12 }}>
                <div className="pp-text-muted">Estimate</div>
                <div style={{ fontWeight: 600 }}>{formatCurrency(totalEstimate)}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="pp-btn pp-btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? "Creating..." : "Create Contract"}
          </button>
          <Link href="/contracts" className="pp-btn pp-btn-ghost">
            Cancel
          </Link>
        </div>
      </div>

      {!loading && bookings.length === 0 && (
        <div className="pp-empty" style={{ marginTop: 16 }}>
          <div className="pp-empty-icon">+</div>
          <div className="pp-empty-title">No bookings available</div>
          <p className="pp-empty-sub">Create a booking first to generate a contract.</p>
          <Link href="/bookings/new" className="pp-btn pp-btn-primary">
            Create Booking
          </Link>
        </div>
      )}
    </>
  );
}
