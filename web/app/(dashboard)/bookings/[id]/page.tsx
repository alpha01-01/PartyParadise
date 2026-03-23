"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useBooking, updateBookingStatus, addBookingNote, assignStaff, allocateEquipment } from "@/hooks/useBookings";
import { formatCurrency, formatDate, BOOKING_STATUS_LABELS, SERVICE_TYPE_LABELS, cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/types";

// â”€â”€â”€ Status pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STATUS_STEPS: BookingStatus[] = [
  "inquiry", "quoted", "confirmed", "in_progress", "completed",
];

const STATUS_COLORS: Record<BookingStatus, string> = {
  inquiry:     "pp-badge-neutral",
  quoted:      "pp-badge-gold",
  confirmed:   "pp-badge-green",
  in_progress: "pp-badge-blue",
  completed:   "pp-badge-neutral",
  cancelled:   "pp-badge-red",
};

const NEXT_STATUS: Partial<Record<BookingStatus, BookingStatus>> = {
  inquiry:     "quoted",
  quoted:      "confirmed",
  confirmed:   "in_progress",
  in_progress: "completed",
};

const PREV_STATUS: Partial<Record<BookingStatus, BookingStatus>> = {
  quoted:      "inquiry",
  confirmed:   "quoted",
  in_progress: "confirmed",
};

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function BookingDetailPage() {
  const params        = useParams();
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const id            = params.id as string;

  const { booking, loading, error, refresh } = useBooking(id);
  const [noteText, setNoteText]       = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [advancing, setAdvancing]     = useState(false);
  const [showCreatedBanner]           = useState(searchParams.get("created") === "true");

  async function handleAdvance(newStatus: BookingStatus) {
    setAdvancing(true);
    try {
      await updateBookingStatus(id, newStatus);
      refresh();
    } catch { /* noop */ }
    setAdvancing(false);
  }

  async function handlePostNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setPostingNote(true);
    try {
      await addBookingNote(id, { note: noteText, is_internal: true });
      setNoteText("");
      refresh();
    } catch { /* noop */ }
    setPostingNote(false);
  }

  if (loading) return <LoadingState />;
  if (error || !booking) return <ErrorState error={error} />;

  const currentStepIdx = STATUS_STEPS.indexOf(booking.status);
  const nextStatus  = NEXT_STATUS[booking.status];
  const prevStatus  = PREV_STATUS[booking.status];
  const isCancelled = booking.status === "cancelled";

  return (
    <>
      {/* Created success banner */}
      {showCreatedBanner && (
        <div style={{
          padding: "10px 16px", marginBottom: 14,
          background: "rgba(76,175,125,0.08)", border: "1px solid rgba(76,175,125,0.2)",
          borderRadius: "var(--pp-radius-sm)", fontSize: 13, color: "var(--pp-green)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          âœ“ Booking <strong>{booking.reference}</strong> created successfully
        </div>
      )}

      {/* Header card */}
      <div className="pp-bk-header">
        <div className="pp-bk-ref">{booking.reference}</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 className="pp-bk-title">
              {booking.client_name} â€” {booking.event_type ?? SERVICE_TYPE_LABELS[booking.service_type]}
            </h1>
            <div className="pp-bk-meta">
              {booking.event_date && (
                <div className="pp-bk-meta-item">
                  <CalIcon /> {formatDate(booking.event_date, "long")}
                </div>
              )}
              {booking.venue_name && (
                <div className="pp-bk-meta-item">
                  <PinIcon /> {booking.venue_name}
                </div>
              )}
              {booking.guest_count && (
                <div className="pp-bk-meta-item">
                  <UsersIcon /> {booking.guest_count} guests
                </div>
              )}
            </div>
            <span className={`pp-badge ${STATUS_COLORS[booking.status]}`}>
              {BOOKING_STATUS_LABELS[booking.status]}
            </span>
          </div>
          <div className="pp-bk-actions">
            <Link href={`/invoices/new?booking=${id}`} className="pp-btn pp-btn-primary">
              Generate Invoice
            </Link>
            <Link href={`/contracts?booking=${id}`} className="pp-btn pp-btn-ghost">
              Generate Contract
            </Link>
            <Link href={`/bookings/${id}/edit`} className="pp-btn pp-btn-ghost">
              Edit
            </Link>
            {!isCancelled && (
              <button
                className="pp-btn pp-btn-ghost"
                style={{ color: "var(--pp-red)", borderColor: "rgba(224,90,74,0.2)" }}
                onClick={() => handleAdvance("cancelled" as BookingStatus)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status timeline */}
      {!isCancelled && (
        <div className="pp-card pp-bk-timeline">
          <div className="pp-bk-steps">
            {STATUS_STEPS.map((step, i) => {
              const isDone   = i < currentStepIdx;
              const isActive = i === currentStepIdx;
              const isFuture = i > currentStepIdx;
              return (
                <div key={step} style={{ display: "flex", alignItems: "center", flex: i < STATUS_STEPS.length - 1 ? "auto" : "0" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className={cn(
                      "pp-step-dot",
                      isDone   && "pp-step-dot--done",
                      isActive && "pp-step-dot--active",
                      isFuture && "pp-step-dot--future",
                    )}>
                      {isDone ? "âœ“" : i + 1}
                    </div>
                    <div className={cn(
                      "pp-step-label",
                      isDone   && "pp-step-label--done",
                      isActive && "pp-step-label--active",
                    )}>
                      {BOOKING_STATUS_LABELS[step]}
                    </div>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={cn("pp-step-connector", isDone && "pp-step-connector--done")} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Advance / retreat buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 12 }}>
            {prevStatus && (
              <button
                className="pp-btn pp-btn-ghost"
                style={{ fontSize: 11.5 }}
                onClick={() => handleAdvance(prevStatus)}
                disabled={advancing}
              >
                â† Move to {BOOKING_STATUS_LABELS[prevStatus]}
              </button>
            )}
            {nextStatus && (
              <button
                className={cn("pp-btn pp-btn-primary", advancing && "pp-btn--loading")}
                style={{ fontSize: 11.5 }}
                onClick={() => handleAdvance(nextStatus)}
                disabled={advancing}
              >
                {advancing && <span className="pp-spinner" />}
                <span>Advance to {BOOKING_STATUS_LABELS[nextStatus]} â†’</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main two-col layout */}
      <div className="pp-booking-detail-layout">
        {/* Left: services, staff, equipment, notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Services */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Services & Pricing</span>
              <button className="pp-card-link">+ Add Service</button>
            </div>
            {booking.services?.length > 0 ? (
              <>
                {booking.services.map((s) => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 18px", borderBottom: "1px solid var(--pp-border)", fontSize: 12.5 }}>
                    <span style={{ color: "var(--pp-text-2)" }}>{s.service}</span>
                    <span style={{ fontWeight: 500, color: "var(--pp-text)" }}>{formatCurrency(s.price)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", background: "rgba(245,200,66,0.04)", fontWeight: 600, fontSize: 13 }}>
                  <span style={{ color: "var(--pp-text)" }}>Total</span>
                  <span style={{ fontFamily: "var(--pp-font-display)", fontSize: 16, color: "var(--pp-gold)" }}>
                    {formatCurrency(booking.services.reduce((s, i) => s + Number(i.price), 0))}
                  </span>
                </div>
              </>
            ) : (
              <p style={{ padding: "14px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>No services added yet. Add services to price this booking accurately.</p>
            )}
          </div>

          {/* Staff */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Staff Assigned</span>
              <button className="pp-card-link">+ Assign</button>
            </div>
            <div style={{ padding: "10px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {booking.staff?.length > 0 ? (
                booking.staff.map((s) => (
                  <span key={s.id} className="pp-chip">
                    <span className="pp-chip-av">{s.user_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase()}</span>
                    {s.user_name}
                    <span style={{ color: "var(--pp-text-3)", fontSize: 11 }}>Â· {s.role}</span>
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--pp-text-3)" }}>No staff assigned yet. Assign team members before the event date.</span>
              )}
              <button className="pp-chip pp-chip-add">+ Add staff</button>
            </div>
          </div>

          {/* Equipment */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Equipment</span>
              <button className="pp-card-link">+ Allocate</button>
            </div>
            <div style={{ padding: "10px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {booking.equipment?.length > 0 ? (
                booking.equipment.map((e) => (
                  <span key={e.id} className="pp-chip">{e.equipment_name}</span>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--pp-text-3)" }}>No equipment allocated yet</span>
              )}
              <button className="pp-chip pp-chip-add">+ Add equipment</button>
            </div>
          </div>

          {/* Notes */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Notes</span>
            </div>
            {booking.notes?.length > 0 ? (
              booking.notes.map((n) => (
                <div key={n.id} style={{ padding: "10px 18px", borderBottom: "1px solid var(--pp-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--pp-text-3)", fontWeight: 500 }}>
                      {n.user_name ?? "Staff"}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--pp-text-3)" }}>
                      {formatDate(n.created_at, "short")}
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--pp-text-2)" }}>{n.note}</p>
                </div>
              ))
            ) : (
              <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>No notes yet. Add internal updates for the team here.</p>
            )}
            <form onSubmit={handlePostNote} style={{ padding: "12px 18px", display: "flex", gap: 8, borderTop: "1px solid var(--pp-border)" }}>
              <input
                className="pp-input"
                placeholder="Add a noteâ€¦"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ flex: 1, fontSize: 12.5 }}
              />
              <button
                type="submit"
                className={cn("pp-btn pp-btn-primary", postingNote && "pp-btn--loading")}
                style={{ fontSize: 12, flexShrink: 0 }}
                disabled={postingNote || !noteText.trim()}
              >
                {postingNote ? <span className="pp-spinner" /> : null}
                <span>Post</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right: client, invoice, contract, event details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Client card */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Client</span>
              <Link href={`/clients/${booking.client_id}`} className="pp-card-link">Full profile â†’</Link>
            </div>
            <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
              <div className="pp-client-av" style={{ width: 36, height: 36, fontSize: 11 }}>
                {booking.client_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--pp-text)" }}>{booking.client_name}</div>
                <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                  {booking.client_phone ?? ""}
                </div>
              </div>
            </div>
          </div>

          {/* Invoice summary */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Invoice</span>
              <Link href={`/invoices?booking=${id}`} className="pp-card-link">View â†’</Link>
            </div>
            {booking.invoice ? (
              <>
                <DpField label="Reference" value={booking.invoice.reference} />
                <DpField label="Total"     value={formatCurrency(booking.invoice.total_amount)} />
                <DpField label="Paid"      value={formatCurrency(booking.invoice.amount_paid)} gold />
                <DpField label="Balance"   value={formatCurrency(booking.invoice.amount_due)}  danger={booking.invoice.amount_due > 0} />
                {booking.invoice.due_date && (
                  <DpField label="Due" value={formatDate(booking.invoice.due_date, "short")} />
                )}
              </>
            ) : (
              <div style={{ padding: "12px 18px" }}>
                <p style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 10 }}>
                  No invoice generated yet for this booking
                </p>
                <Link href={`/invoices/new?booking=${id}`} className="pp-btn pp-btn-ghost" style={{ fontSize: 12, width: "100%", justifyContent: "center" }}>
                  Generate Invoice
                </Link>
              </div>
            )}
          </div>

          {/* Contract summary */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Contract</span>
              <Link href={`/contracts?booking=${id}`} className="pp-card-link">View â†’</Link>
            </div>
            {booking.contract ? (
              <>
                <DpField label="Reference" value={booking.contract.reference} />
                <DpField
                  label="Status"
                  value={booking.contract.status === "signed" ? "Signed âœ“" : booking.contract.status}
                  gold={booking.contract.status === "signed"}
                />
                {booking.contract.signed_at && (
                  <DpField label="Signed" value={formatDate(booking.contract.signed_at, "short")} />
                )}
              </>
            ) : (
              <div style={{ padding: "12px 18px" }}>
                <p style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 10 }}>
                  No contract generated yet for this booking
                </p>
                <Link
                  href={`/contracts/new?booking=${id}`}
                  className="pp-btn pp-btn-ghost"
                  style={{ fontSize: 12, width: "100%", justifyContent: "center" }}
                >
                  Generate Contract
                </Link>
              </div>
            )}
          </div>

          {/* Event details */}
          <div className="pp-card" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Event Details</span>
            </div>
            <DpField label="Service type" value={SERVICE_TYPE_LABELS[booking.service_type]} />
            {booking.event_type && <DpField label="Event type" value={booking.event_type} />}
            {booking.guest_count && <DpField label="Guest count" value={String(booking.guest_count)} />}
            {booking.start_time && <DpField label="Start time" value={booking.start_time} />}
            {booking.end_time && <DpField label="End time" value={booking.end_time} />}
            {booking.venue_address && <DpField label="Address" value={booking.venue_address} />}
            {booking.special_requests && (
              <div style={{ padding: "8px 18px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--pp-text-3)", marginBottom: 4 }}>Special requests</div>
                <p style={{ fontSize: 12.5, color: "var(--pp-text-2)", lineHeight: 1.6 }}>
                  {booking.special_requests}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DpField({ label, value, gold, danger }: { label: string; value: string; gold?: boolean; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 18px", fontSize: 12.5, borderBottom: "1px solid var(--pp-border)" }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ color: danger ? "var(--pp-red)" : gold ? "var(--pp-green)" : "var(--pp-text)", fontSize: 12, fontWeight: gold || danger ? 500 : undefined }}>
        {value}
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="pp-skeleton" style={{ height: 80, borderRadius: "var(--pp-radius)" }} />
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="pp-card pp-empty">
      <div className="pp-empty-icon">âš ï¸</div>
      <div className="pp-empty-title">Booking not found</div>
      <p className="pp-empty-sub">{error ?? "This booking doesn't exist or was removed."}</p>
      <Link href="/bookings" className="pp-btn pp-btn-ghost" style={{ marginTop: 12 }}>â† Back to bookings</Link>
    </div>
  );
}

const CalIcon   = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 4.5h12M4 1v1.5M10 1v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
const PinIcon   = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1C5.07 1 3.5 2.57 3.5 4.5c0 2.67 3.5 6.5 3.5 6.5s3.5-3.83 3.5-6.5C10.5 2.57 8.93 1 7 1z" stroke="currentColor" strokeWidth="1.2"/></svg>;
const UsersIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="5.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 12c0-2.48 2.02-4.5 4.5-4.5S10 9.52 10 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;

