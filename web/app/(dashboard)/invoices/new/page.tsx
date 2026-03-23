"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBookings } from "@/hooks/useBookings";
import { generateInvoiceFromBooking } from "@/hooks";
import api from "@/lib/api";
import { formatDate, formatCurrency, SERVICE_TYPE_LABELS } from "@/lib/utils";
import type { Booking } from "@/lib/types";

export default function NewInvoicePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { bookings, loading, error: bookingsError } = useBookings({ page_size: 50 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      `${b.client_name} ${b.reference}`.toLowerCase().includes(q)
    );
  }, [bookings, search]);

  async function handleCreate(booking: Booking) {
    setError(null);
    setCreatingId(booking.id);
    try {
      const { data: fullBooking } = await api.get<Booking>(`/bookings/${booking.id}`);
      if (!fullBooking.services || fullBooking.services.length === 0) {
        setError("This booking has no services yet. Add at least one service before invoicing.");
        return;
      }
      await generateInvoiceFromBooking(booking.id);
      router.push("/invoices");
    } catch (err: any) {
      setError(err?.message ?? "Failed to create invoice");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <>
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">Create Invoice</h1>
          <p className="pp-page-subtitle">
            Choose a booking to generate an invoice
          </p>
        </div>
        <Link href="/invoices" className="pp-btn pp-btn-ghost">
          Back to Invoices
        </Link>
      </div>

      {bookingsError && <div className="pp-alert pp-alert-error">{bookingsError}</div>}
      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <div className="pp-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="pp-search-wrap">
          <input
            className="pp-search-input"
            placeholder="Search by client or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="pp-skeleton" style={{ height: 56, margin: "1px 0" }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="pp-empty">
            <div className="pp-empty-icon">+</div>
            <div className="pp-empty-title">No bookings found</div>
            <p className="pp-empty-sub">Create a booking first, then generate an invoice.</p>
            <Link href="/bookings/new" className="pp-btn pp-btn-primary">
              Create Booking
            </Link>
          </div>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Event Date</th>
                <th>Service</th>
                <th>Estimated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.client_name}</div>
                    <div className="pp-text-muted">#{b.reference}</div>
                  </td>
                  <td>{formatDate(b.event_date)}</td>
                  <td>{SERVICE_TYPE_LABELS[b.service_type] ?? b.service_type.replace("_", " ")}</td>
                  <td>
                    {formatCurrency(
                      (b.services ?? []).reduce((sum, s) => sum + s.price, 0)
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="pp-btn pp-btn-primary"
                      onClick={() => handleCreate(b)}
                      disabled={creatingId === b.id}
                    >
                      {creatingId === b.id ? "Creating..." : "Generate Invoice"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

