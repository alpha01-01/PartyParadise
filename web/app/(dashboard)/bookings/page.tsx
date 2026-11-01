"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useBookings, useCalendarBookings, updateBookingStatus } from "@/hooks/useBookings";
import {
  formatDate,
  formatCurrency,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  SERVICE_TYPE_LABELS,
  initials,
  cn,
} from "@/lib/utils";
import type { Booking, BookingStatus, ServiceType } from "@/lib/types";
import { downloadCsv } from "@/lib/export";

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: BookingStatus }) {
  const color = BOOKING_STATUS_COLORS[status] ?? "neutral";
  return (
    <span className={`pp-badge pp-badge-${color}`}>
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Service type pill ────────────────────────────────────────
const SVC_CLASS: Record<ServiceType, string> = {
  decor:             "svc-decor",
  photobooth_360:    "svc-360",
  photobooth_rental: "svc-rental",
  combo:             "svc-combo",
};

function ServicePill({ type }: { type: ServiceType }) {
  return (
    <span className={`pp-service-pill ${SVC_CLASS[type]}`}>
      {SERVICE_TYPE_LABELS[type]}
    </span>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────
const FILTER_TABS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all",         label: "All" },
  { value: "inquiry",     label: "Inquiry" },
  { value: "quoted",      label: "Quoted" },
  { value: "confirmed",   label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
];

// ─── Page ─────────────────────────────────────────────────────
export default function BookingsPage() {
  const [view, setView] = useState<"table" | "calendar">("table");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );

  const {
    bookings,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters,
    goToPage,
    refresh,
  } = useBookings({ page_size: 20 });

  useEffect(() => {
    if (error) {
      console.error("Bookings load error:", error);
    }
  }, [error]);

  const calResult = useCalendarBookings(
    view === "calendar" ? calMonth : ""
  );

  const visibleRevenue = bookings.reduce(
    (sum, booking) => sum + (booking.services?.reduce((svcSum, service) => svcSum + service.price, 0) ?? 0),
    0
  );
  const confirmedCount = bookings.filter((booking) => booking.status === "confirmed").length;
  const inquiryCount = bookings.filter((booking) => booking.status === "inquiry").length;
  const nextBooking = [...bookings]
    .filter((booking) => new Date(`${booking.event_date}T00:00:00`).getTime() >= Date.now() - 86400000)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0] ?? null;

  function openDrawer(b: Booking) {
    setSelectedBooking(b);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setTimeout(() => setSelectedBooking(null), 300);
  }

  function handleExport() {
    downloadCsv("bookings.csv", bookings.map((booking) => ({
      Reference: booking.reference,
      Client: booking.client_name ?? "Client",
      Status: BOOKING_STATUS_LABELS[booking.status],
      Service: SERVICE_TYPE_LABELS[booking.service_type],
      EventDate: booking.event_date,
      EventType: booking.event_type ?? "",
      Venue: booking.venue_name ?? "",
      Total: booking.services?.reduce((sum, service) => sum + service.price, 0) ?? 0,
    })));
  }

  async function handleStatusChange(id: string, status: BookingStatus) {
    try {
      await updateBookingStatus(id, { status });
      refresh();
      if (selectedBooking?.id === id) {
        setSelectedBooking((b) => b ? { ...b, status } : b);
      }
    } catch (e) {
      console.error(e);
    }
  }
  return (
    <>
      <section className="pp-bookings-hero">
        <div className="pp-bookings-hero-copy">
          <span className="pp-bookings-kicker">Operations Hub</span>
          <h1 className="pp-page-title">Bookings</h1>
          <p className="pp-page-subtitle">
            Track event flow, spot upcoming pressure points, and move from inquiry to completed delivery without losing context.
          </p>
          <div className="pp-bookings-glance">
            <span>{total} visible bookings</span>
            <span>{confirmedCount} confirmed</span>
            <span>{bookings.filter((b) => b.status === "in_progress").length} in progress</span>
            <span>{nextBooking ? `Next: ${nextBooking.client_name ?? "Client"} on ${formatDate(nextBooking.event_date, "short")}` : "No upcoming event in view"}</span>
          </div>
        </div>
        <div className="pp-header-actions">
          <div className="pp-view-toggle">
            <button
              className={cn("pp-view-btn", view === "table" && "pp-view-btn--active")}
              onClick={() => setView("table")}
              title="Table view"
            >
              <TableIcon />
            </button>
            <button
              className={cn("pp-view-btn", view === "calendar" && "pp-view-btn--active")}
              onClick={() => setView("calendar")}
              title="Calendar view"
            >
              <CalIcon />
            </button>
          </div>
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>
            <ExportIcon /> Export CSV
          </button>
          <Link href="/bookings/new" className="pp-btn pp-btn-primary">
            <PlusIcon /> New Booking
          </Link>
        </div>
      </section>

      <section className="pp-bookings-stats">
        <div className="pp-stat pp-stat--gold">
          <span className="pp-stat-label">Pipeline Revenue</span>
          <span className="pp-stat-value">{formatCurrency(visibleRevenue)}</span>
          <span className="pp-stat-delta">Visible bookings total</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-label">Confirmed Events</span>
          <span className="pp-stat-value">{confirmedCount}</span>
          <span className="pp-stat-delta pp-stat-delta--up">Ready for delivery planning</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-label">Fresh Inquiries</span>
          <span className="pp-stat-value">{inquiryCount}</span>
          <span className="pp-stat-delta">Needs quoting and follow-up</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-label">Next Event</span>
          <span className="pp-stat-value" style={{ fontSize: nextBooking ? 20 : 18 }}>
            {nextBooking ? formatDate(nextBooking.event_date, "short") : "No event"}
          </span>
          <span className="pp-stat-delta">
            {nextBooking ? `${nextBooking.client_name ?? "Client"} ? ${SERVICE_TYPE_LABELS[nextBooking.service_type]}` : "Create or confirm a booking"}
          </span>
        </div>
      </section>

      {/* Filter bar */}
      <div className="pp-filter-bar">
        <div className="pp-search-wrap">
          <SearchIcon />
          <input
            className="pp-search-input"
            placeholder="Search bookings or clients…"
            defaultValue={filters.search ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              // Debounce via a simple timeout
              clearTimeout((window as any).__searchTimeout);
              (window as any).__searchTimeout = setTimeout(
                () => updateFilters({ search: val }),
                350
              );
            }}
          />
        </div>
        <div className="pp-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              className={cn(
                "pp-filter-tab",
                (filters.status ?? "all") === tab.value && "pp-filter-tab--active"
              )}
              onClick={() => updateFilters({ status: tab.value === "all" ? undefined : tab.value as BookingStatus })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      <div className="pp-bookings-toolbar-note">
        <span>Exports download the bookings currently on screen.</span>
        <span>{view === "calendar" ? "Calendar view is best for spotting operational clashes." : "Table view is best for quick client and status triage."}</span>
      </div>

      {error && (
        <div className="pp-alert pp-alert-error">
          <strong>We could not refresh this booking view.</strong>
          <span>{error}</span>
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      {view === "calendar" && calResult.error && (
        <div className="pp-alert pp-alert-error">
          <strong>Calendar view hit a snag.</strong>
          <span>{calResult.error}</span>
        </div>
      )}

      {/* ── Content ── */}
      {view === "table" ? (
        <TableView
          bookings={bookings}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onOpen={openDrawer}
          onPageChange={goToPage}
        />
      ) : (
        <CalendarView
          bookings={calResult.bookings}
          loading={calResult.loading}
          month={calMonth}
          onMonthChange={setCalMonth}
          onOpen={openDrawer}
        />
      )}

      {/* ── Drawer ── */}
      <BookingDrawer
        booking={selectedBooking}
        open={drawerOpen}
        onClose={closeDrawer}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}

// ─── Table view ───────────────────────────────────────────────
function TableView({
  bookings,
  loading,
  page,
  totalPages,
  onOpen,
  onPageChange,
}: {
  bookings: Booking[];
  loading: boolean;
  page: number;
  totalPages: number;
  onOpen: (b: Booking) => void;
  onPageChange: (p: number) => void;
}) {
  if (loading) {
    return (
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="pp-skeleton" style={{ height: 52, margin: "1px 0" }} />
        ))}
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-icon">📋</div>
        <div className="pp-empty-title">No bookings found</div>
        <p className="pp-empty-sub">Try a different status filter or create a new event to start filling the pipeline.</p>
      </div>
    );
  }

  return (
    <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="pp-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Client</th>
            <th>Event</th>
            <th>Service</th>
            <th>Date</th>
            <th>Total</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr
              key={b.id}
              className="pp-tr-clickable"
              onClick={() => onOpen(b)}
            >
              <td>
                <span className="pp-ref">{b.reference}</span>
              </td>
              <td>
                <div className="pp-client-cell">
                  <div className="pp-client-av">
                    {initials(b.client_name ?? "?")}
                  </div>
                  <span>{b.client_name ?? "Client"}</span>
                </div>
              </td>
              <td>
                <div style={{ color: "var(--pp-text)" }}>{b.event_type ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                  {b.venue_name?.split(",")[0]}
                </div>
              </td>
              <td>
                <ServicePill type={b.service_type} />
              </td>
              <td style={{ whiteSpace: "nowrap", color: "var(--pp-text)" }}>
                {formatDate(b.event_date, "short")}
              </td>
              <td className="pp-amount-cell">
                {formatCurrency(b.services?.reduce((s, sv) => s + sv.price, 0))}
              </td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td>
                <div
                  className="pp-row-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="pp-row-btn"
                    title="View"
                    onClick={() => onOpen(b)}
                  >
                    <EyeIcon />
                  </button>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="pp-row-btn"
                    title="Edit"
                  >
                    <EditIcon />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="pp-pagination">
        <span>Page {page} of {totalPages}</span>
        <div className="pp-pg-btns">
          <button
            className="pp-pg-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            ‹
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                className={cn("pp-pg-btn", page === p && "pp-pg-btn--active")}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            );
          })}
          <button
            className="pp-pg-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────
function CalendarView({
  bookings,
  loading,
  month,
  onMonthChange,
  onOpen,
}: {
  bookings: Booking[];
  loading: boolean;
  month: string;
  onMonthChange: (m: string) => void;
  onOpen: (b: Booking) => void;
}) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return (
      <div className="pp-card" style={{ padding: 18 }}>
        <div style={{ fontSize: 12, color: "var(--pp-text-3)" }}>
          Calendar unavailable — invalid month.
        </div>
      </div>
    );
  }
  const [year, mo] = month.split("-").map(Number);
  const date = new Date(year, mo - 1, 1);

  const prevMonth = () => {
    const d = new Date(year, mo - 2, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };
  const nextMonth = () => {
    const d = new Date(year, mo, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };

  const firstDayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
  const daysInMonth = new Date(year, mo, 0).getDate();
  const today = new Date();

  const cells: { day: number; isOther: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ day: new Date(year, mo - 1, -firstDayOfWeek + i + 1).getDate(), isOther: true, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      isOther: false,
      isToday: today.getDate() === d && today.getMonth() === mo - 1 && today.getFullYear() === year,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstDayOfWeek - daysInMonth + 1, isOther: true, isToday: false });

  function bookingsOnDay(day: number) {
    return bookings.filter((b) => {
      const d = new Date(b.event_date + "T00:00:00");
      return d.getDate() === day && d.getMonth() === mo - 1 && d.getFullYear() === year;
    });
  }

  return (
    <div className="pp-card" style={{ padding: 16 }}>
      <div className="pp-cal-header">
        <span className="pp-cal-title">
          {date.toLocaleDateString("en-GH", { month: "long", year: "numeric" })}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="pp-cal-nav-btn" onClick={prevMonth}>‹</button>
          <button className="pp-cal-nav-btn" onClick={nextMonth}>›</button>
        </div>
      </div>
      <div className="pp-cal-days-header">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="pp-cal-day-label">{d}</div>
        ))}
      </div>
      <div className="pp-cal-days">
        {cells.map((c, i) => {
          const dayBookings = c.isOther ? [] : bookingsOnDay(c.day);
          return (
            <div
              key={i}
              className={cn(
                "pp-cal-day",
                c.isToday && "pp-cal-day--today",
                c.isOther && "pp-cal-day--other"
              )}
            >
              <div className="pp-cal-day-num">{c.day}</div>
              {dayBookings.slice(0, 2).map((b) => {
                const name = b.client_name?.trim() || "Client";
                const first = name.split(" ")[0] || "Client";
                return (
                <div
                  key={b.id}
                  className={`pp-cal-event pp-cal-event--${b.service_type}`}
                  onClick={() => onOpen(b)}
                  title={`${name} — ${SERVICE_TYPE_LABELS[b.service_type]}`}
                >
                  {first} · {SERVICE_TYPE_LABELS[b.service_type]}
                </div>
                );
              })}
              {dayBookings.length > 2 && (
                <div className="pp-cal-more">+{dayBookings.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Booking detail drawer ────────────────────────────────────
function BookingDrawer({
  booking,
  open,
  onClose,
  onStatusChange,
}: {
  booking: Booking | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: BookingStatus) => void;
}) {
  const NEXT_STATUSES: Partial<Record<BookingStatus, BookingStatus[]>> = {
    inquiry:     ["quoted", "cancelled"],
    quoted:      ["confirmed", "cancelled"],
    confirmed:   ["in_progress", "cancelled"],
    in_progress: ["completed"],
  };

  return (
    <>
      <div
        className={cn("pp-drawer-overlay", open && "pp-drawer-overlay--open")}
        onClick={onClose}
      />
      <div className={cn("pp-drawer", open && "pp-drawer--open")}>
        {booking && (
          <>
            <div className="pp-drawer-header">
              <div>
                <div className="pp-drawer-ref">{booking.reference}</div>
                <div className="pp-drawer-name">{booking.client_name ?? "Client"}</div>
                <StatusBadge status={booking.status} />
              </div>
              <button className="pp-drawer-close" onClick={onClose}>
                <CloseIcon />
              </button>
            </div>

            <div className="pp-drawer-body">
              {/* Event details */}
              <section>
                <div className="pp-drawer-section-title">Event Details</div>
                <div className="pp-detail-grid">
                  <div className="pp-detail-item">
                    <span className="pp-detail-label">Event Type</span>
                    <span className="pp-detail-value">{booking.event_type ?? "—"}</span>
                  </div>
                  <div className="pp-detail-item">
                    <span className="pp-detail-label">Date</span>
                    <span className="pp-detail-value">{formatDate(booking.event_date, "long")}</span>
                  </div>
                  <div className="pp-detail-item">
                    <span className="pp-detail-label">Service</span>
                    <ServicePill type={booking.service_type} />
                  </div>
                  <div className="pp-detail-item">
                    <span className="pp-detail-label">Venue</span>
                    <span className="pp-detail-value">{booking.venue_name ?? "—"}</span>
                  </div>
                  {booking.guest_count && (
                    <div className="pp-detail-item">
                      <span className="pp-detail-label">Guests</span>
                      <span className="pp-detail-value">{booking.guest_count}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Services */}
              {(booking.services?.length ?? 0) > 0 && (
                <section>
                  <div className="pp-drawer-section-title">Services & Pricing</div>
                  <div className="pp-services-list">
                    {booking.services!.map((s) => (
                      <div key={s.id} className="pp-service-row">
                        <span className="pp-service-name">{s.service}</span>
                        <span className="pp-service-price">{formatCurrency(s.price)}</span>
                      </div>
                    ))}
                    <div className="pp-total-row">
                      <span>Total</span>
                      <span className="pp-total-value">
                        {formatCurrency(booking.services!.reduce((s, sv) => s + sv.price, 0))}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              {/* Crew */}
              <section>
                <div className="pp-drawer-section-title">
                  Crew {(booking.staff?.length ?? 0) > 0 ? `(${booking.staff!.length})` : ""}
                </div>
                {!booking.staff?.length ? (
                  <p style={{ fontSize: 12, color: "var(--pp-text-3)" }}>No crew assigned</p>
                ) : (
                  <div className="pp-staff-list">
                    {booking.staff!.map((s) => (
                      <div key={s.user_id} className="pp-staff-row">
                        <div className="pp-staff-av">{initials(s.full_name)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5, color: "var(--pp-text)", fontWeight: 500 }}>
                            {s.full_name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{s.role}</div>
                        </div>
                        {s.report_time && (
                          <span style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                            Report {s.report_time}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Status transitions */}
              {NEXT_STATUSES[booking.status] && (
                <section>
                  <div className="pp-drawer-section-title">Move To</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {NEXT_STATUSES[booking.status]!.map((s) => (
                      <button
                        key={s}
                        className={cn(
                          "pp-btn",
                          s === "cancelled" ? "pp-btn-danger" : "pp-btn-ghost"
                        )}
                        style={{ fontSize: 12 }}
                        onClick={() => onStatusChange(booking.id, s)}
                      >
                        {BOOKING_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="pp-drawer-actions">
              <Link
                href={`/invoices/new?booking=${booking.id}`}
                className="pp-btn pp-btn-primary"
              >
                Generate Invoice
              </Link>
              <Link href={`/bookings/${booking.id}`} className="pp-btn pp-btn-ghost">
                Full Details
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────
const TableIcon  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="5.5" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="10" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>;
const CalIcon    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5.5h12M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
const ExportIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const PlusIcon   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const EyeIcon    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/></svg>;
const EditIcon   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const CloseIcon  = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
