"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useDashboard, useLowStockItems } from "@/hooks";
import { useBookings } from "@/hooks/useBookings";
import { useAuthStore } from "@/lib/auth";
import {
  formatCurrency,
  formatDate,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  SERVICE_TYPE_LABELS,
  initials,
  cn,
} from "@/lib/utils";
import type { Booking } from "@/lib/types";

// ─── Greeting ─────────────────────────────────────────────────
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const firstName = mounted
    ? user?.full_name?.split(" ")[0] ?? "there"
    : "there";
  const greet = mounted ? greeting() : "Welcome";
  const today = mounted ? todayLabel() : "";

  const { data: summary, loading: summaryLoading } = useDashboard();
  const { bookings, loading: bookingsLoading } = useBookings({ page_size: 5 });
  const { items: lowStock, loading: stockLoading } = useLowStockItems();
  const recentActivity = buildActivityFromBookings(bookings);

  return (
    <>
      {/* ── Page header ── */}
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">
            {greet}, {firstName} ✦
          </h1>
          <p className="pp-page-subtitle">
            {today}
            {summary && summary.upcoming_bookings > 0 && (
              <> &nbsp;·&nbsp; {summary.upcoming_bookings} upcoming events</>
            )}
            {summary && summary.overdue_invoices > 0 && (
              <> &nbsp;·&nbsp; <span style={{ color: "var(--pp-red)" }}>{summary.overdue_invoices} overdue invoices</span></>
            )}
          </p>
        </div>
        <PeriodSelect />
      </div>

      {/* ── Stat cards ── */}
      <div className="pp-stats-grid">
        <StatCard
          label="Revenue · This Month"
          value={formatCurrency(summary?.revenue_this_month, { compact: true })}
          delta={summaryLoading ? null : { label: "vs last month", dir: "up" }}
          icon="₵"
          loading={summaryLoading}
          highlight
        />
        <StatCard
          label="Bookings · This Month"
          value={String(summary?.bookings_this_month ?? "—")}
          delta={
            summary
              ? { label: `${summary.upcoming_bookings} upcoming`, dir: "up" }
              : null
          }
          icon={<CalIcon />}
          loading={summaryLoading}
        />
        <StatCard
          label="Outstanding Invoices"
          value={String(summary?.outstanding_invoices ?? "—")}
          delta={
            summary?.overdue_invoices
              ? { label: `${summary.overdue_invoices} overdue`, dir: "down" }
              : { label: "all current", dir: "up" }
          }
          icon={<ReceiptIcon />}
          loading={summaryLoading}
        />
        <StatCard
          label="New Leads · This Month"
          value={String(summary?.new_leads_this_month ?? "—")}
          delta={{ label: "3 awaiting follow-up", dir: "neutral" }}
          icon={<UsersIcon />}
          loading={summaryLoading}
        />
      </div>

      {/* ── Row 2: bookings table + upcoming ── */}
      <div className="pp-dashboard-two-col">
        {/* Recent bookings */}
        <div className="pp-card" style={{ padding: 0 }}>
          <div className="pp-card-header">
            <span className="pp-card-title">Recent Bookings</span>
            <Link href="/bookings" className="pp-card-link">View all →</Link>
          </div>
          {bookingsLoading ? (
            <SkeletonRows rows={5} />
          ) : bookings.length === 0 ? (
            <div className="pp-empty" style={{ padding: "18px" }}>
              <div className="pp-empty-title">No bookings yet</div>
              <p className="pp-empty-sub">Create your first booking to get started.</p>
              <Link href="/bookings/new" className="pp-btn pp-btn-primary" style={{ marginTop: 8 }}>
                + New Booking
              </Link>
            </div>
          ) : (
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Client</th>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.slice(0, 5).map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming events */}
        <UpcomingEvents bookings={bookings} />
      </div>

      {/* ── Row 3: revenue chart, activity, staff + stock ── */}
      <div className="pp-dashboard-three-col">
        <RevenueChart revenueThisMonth={summary?.revenue_this_month ?? null} loading={summaryLoading} />
        <ActivityFeed items={recentActivity} loading={bookingsLoading} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <StaffToday />
          <LowStockCard items={lowStock} loading={stockLoading} />
        </div>
      </div>

      {/* ── Quick actions ── */}
      <QuickActions />
    </>
  );
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({
  label,
  value,
  delta,
  icon,
  loading,
  highlight = false,
}: {
  label: string;
  value: string;
  delta: { label: string; dir: "up" | "down" | "neutral" } | null;
  icon: React.ReactNode;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("pp-stat", highlight && "pp-stat--gold")}>
      <div className={cn("pp-stat-icon", highlight ? "pp-stat-icon--gold" : "pp-stat-icon--blue")}>
        {icon}
      </div>
      <div className="pp-stat-label">{label}</div>
      {loading ? (
        <div className="pp-skeleton" style={{ height: 28, width: 80, margin: "4px 0" }} />
      ) : (
        <div className="pp-stat-value">{value}</div>
      )}
      {delta && !loading && (
        <div className={cn("pp-stat-delta", `pp-stat-delta--${delta.dir}`)}>
          {delta.dir === "up" && "↑ "}
          {delta.dir === "down" && "↓ "}
          {delta.label}
        </div>
      )}
    </div>
  );
}

// ─── Booking row ──────────────────────────────────────────────
function BookingRow({ booking: b }: { booking: Booking }) {
  const color = BOOKING_STATUS_COLORS[b.status] ?? "neutral";
  return (
    <tr className="pp-tr-clickable">
      <td><span className="pp-ref">{b.reference}</span></td>
      <td>
        <div className="pp-client-cell">
          <div className="pp-client-av">{initials(b.client_name ?? "?")}</div>
          <span>{b.client_name ?? "Client"}</span>
        </div>
      </td>
      <td>{b.event_type ?? SERVICE_TYPE_LABELS[b.service_type]}</td>
      <td style={{ color: "var(--pp-text)", whiteSpace: "nowrap" }}>
        {formatDate(b.event_date, "short")}
      </td>
      <td>
        <span className={`pp-badge pp-badge-${color}`}>
          {BOOKING_STATUS_LABELS[b.status]}
        </span>
      </td>
    </tr>
  );
}

// ─── Upcoming events ──────────────────────────────────────────
const EVENT_COLORS: Record<string, string> = {
  wedding: "var(--pp-gold)",
  birthday: "var(--pp-green)",
  corporate: "var(--pp-blue, #7aa3e0)",
  bridal_shower: "var(--pp-gold)",
  graduation: "var(--pp-green)",
  other: "var(--pp-text-3)",
};

function UpcomingEvents({ bookings }: { bookings: Booking[] }) {
  const upcoming = bookings
    .filter((b) => ["confirmed", "in_progress"].includes(b.status))
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 5);

  if (bookings.length === 0) {
    return (
      <div className="pp-card" style={{ padding: 0 }}>
        <div className="pp-card-header">
          <span className="pp-card-title">Upcoming Events</span>
          <Link href="/bookings?view=calendar" className="pp-card-link">Calendar →</Link>
        </div>
        <div className="pp-empty" style={{ padding: "18px" }}>
          <div className="pp-empty-title">No bookings yet</div>
          <p className="pp-empty-sub">Upcoming events will appear once bookings are created.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Upcoming Events</span>
        <Link href="/bookings?view=calendar" className="pp-card-link">Calendar →</Link>
      </div>
      <div>
        {upcoming.length === 0 ? (
          <p style={{ padding: "20px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>
            No upcoming events
          </p>
        ) : (
          upcoming.map((b) => {
            const color = EVENT_COLORS[b.event_type?.toLowerCase() ?? "other"] ?? EVENT_COLORS.other;
            return (
              <Link
                key={b.id}
                href={`/bookings/${b.id}`}
                className="pp-upcoming-item"
              >
                <div className="pp-upcoming-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--pp-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.client_name ?? "Client"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                    {SERVICE_TYPE_LABELS[b.service_type]}
                    {b.venue_name ? ` · ${b.venue_name.split(",")[0]}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--pp-text-3)", whiteSpace: "nowrap" }}>
                  {formatDate(b.event_date, "short")}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────
function RevenueChart({
  revenueThisMonth,
  loading,
}: {
  revenueThisMonth: number | null;
  loading: boolean;
}) {
  const value = revenueThisMonth ?? 0;
  const max = Math.max(value, 1);
  const h = Math.round((value / max) * 58) + 8;
  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Revenue Trend</span>
        <Link href="/reports" className="pp-card-link">Reports →</Link>
      </div>
      {loading ? (
        <div style={{ padding: "16px 18px 18px" }}>
          <div className="pp-skeleton" style={{ height: 86, width: "100%" }} />
        </div>
      ) : revenueThisMonth ? (
        <div>
          <div style={{ padding: "16px 18px 4px", display: "flex", alignItems: "flex-end", gap: 4, height: 90 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div
                style={{
                  width: "100%", height: h,
                  borderRadius: "3px 3px 0 0",
                  background: "var(--pp-gold)",
                  transition: "height 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                }}
                title={`GHS ${value.toLocaleString()}`}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 18px 14px", fontSize: 10, color: "var(--pp-text-3)" }}>
            <span>This month</span>
            <span>GHS {value.toLocaleString()}</span>
          </div>
        </div>
      ) : (
        <p style={{ padding: "18px", fontSize: 12, color: "var(--pp-text-3)" }}>
          No revenue data yet
        </p>
      )}
    </div>
  );
}
// ─── Activity feed ────────────────────────────────────────────
type ActivityItem = { color: string; text: ReactNode; time: string };

function ActivityFeed({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Recent Activity</span>
        <span className="pp-card-link">All →</span>
      </div>
      <div>
        {loading ? (
          <div style={{ padding: "12px 18px" }}>
            <div className="pp-skeleton" style={{ height: 14, width: "70%", marginBottom: 8 }} />
            <div className="pp-skeleton" style={{ height: 14, width: "55%", marginBottom: 8 }} />
            <div className="pp-skeleton" style={{ height: 14, width: "62%" }} />
          </div>
        ) : items.length === 0 ? (
          <div className="pp-empty" style={{ padding: "18px" }}>
            <div className="pp-empty-title">No recent activity</div>
            <p className="pp-empty-sub">Actions like bookings, invoices, and updates will show here.</p>
          </div>
        ) : (
          items.map((a, i) => (
            <div key={i} className="pp-activity-item">
              <div className="pp-activity-dot" style={{ background: a.color }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--pp-text-2)", lineHeight: 1.4 }}>{a.text}</div>
                <div style={{ fontSize: 10.5, color: "var(--pp-text-3)", marginTop: 1 }}>{a.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
// ─── Staff today ──────────────────────────────────────────────
function StaffToday() {
  const placeholders = [
    { name: "No staff assigned", role: "Tap Staff to schedule shifts" },
  ];
  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Staff Today</span>
        <Link href="/staff" className="pp-card-link">Schedules →</Link>
      </div>
      <div>
        {placeholders.map((p, i) => (
          <div key={i} className="pp-staff-row-mini">
            <div className="pp-client-av" style={{ width: 26, height: 26 }}>—</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "var(--pp-text)", fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{p.role}</div>
            </div>
            <span className="pp-badge pp-badge-neutral">Today</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildActivityFromBookings(bookings: Booking[]): ActivityItem[] {
  return bookings.slice(0, 5).map((b) => {
    const color =
      b.status === "confirmed"
        ? "var(--pp-gold)"
        : b.status === "in_progress"
        ? "var(--pp-green)"
        : "var(--pp-text-3)";
    return {
      color,
      text: (
        <>
          Booking <strong>{b.reference}</strong> for{" "}
          <strong>{b.client_name ?? "Client"}</strong> is{" "}
          <strong>{b.status.replace("_", " ")}</strong>
        </>
      ),
      time: formatDate(b.event_date, "short"),
    };
  });
}
// ─── Low stock ────────────────────────────────────────────────
function LowStockCard({
  items,
  loading,
}: {
  items: Array<{ id: string; name: string; category: string; quantity_in_stock: number; reorder_level: number }>;
  loading: boolean;
}) {
  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Low Stock</span>
        <Link href="/inventory?low_stock=true" className="pp-card-link">Inventory →</Link>
      </div>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <div className="pp-empty" style={{ padding: "16px 18px" }}>
          <div className="pp-empty-title">All stocked up</div>
          <p className="pp-empty-sub">No items are below their reorder level.</p>
        </div>
      ) : (
        <div>
          {items.slice(0, 4).map((item) => {
            const pct = Math.min(100, Math.round((item.quantity_in_stock / item.reorder_level) * 100));
            const isCrit = item.quantity_in_stock <= Math.floor(item.reorder_level * 0.3);
            return (
              <div key={item.id} className="pp-stock-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--pp-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{item.category ?? "General"}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isCrit ? "var(--pp-red)" : "var(--pp-gold)" }}>
                    {item.quantity_in_stock} left
                  </span>
                  <div style={{ width: 52, height: 4, background: "var(--pp-surface3, #232019)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: isCrit ? "var(--pp-red)" : "var(--pp-gold)", borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "New Booking",     href: "/bookings/new",   icon: "+",  cls: "pp-qa-icon--gold" },
  { label: "Create Invoice",  href: "/invoices/new",   icon: "₵",  cls: "pp-qa-icon--blue" },
  { label: "Record Payment",  href: "/invoices",       icon: "✓",  cls: "pp-qa-icon--green" },
  { label: "Stock Purchase",  href: "/inventory/new",  icon: "↓",  cls: "pp-qa-icon--gray" },
];

function QuickActions() {
  return (
    <div className="pp-card" style={{ padding: 0, marginBottom: 4 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Quick Actions</span>
      </div>
      <div className="pp-quick-actions">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} className="pp-qa-btn">
            <div className={cn("pp-qa-icon", a.cls)}>{a.icon}</div>
            {a.label}
          </Link>
        ))}
        <Link href="/clients/new" className="pp-qa-btn">
          <div className={cn("pp-qa-icon", "pp-qa-icon--blue")}>+</div>
          Add Client
        </Link>
      </div>
    </div>
  );
}

// ─── Period select ────────────────────────────────────────────
function PeriodSelect() {
  const [period, setPeriod] = useState("this_month");
  return (
    <select
      value={period}
      onChange={(e) => setPeriod(e.target.value)}
      className="pp-period-select"
    >
      <option value="this_month">This month</option>
      <option value="last_month">Last month</option>
      <option value="this_quarter">This quarter</option>
      <option value="this_year">This year</option>
    </select>
  );
}

// ─── Skeleton rows ────────────────────────────────────────────
function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div style={{ padding: "4px 0" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="pp-skeleton" style={{ height: 44, margin: "1px 0" }} />
      ))}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────
function CalIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 5h12M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function ReceiptIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 1v12l2-1.4 2 1.4 2-1.4 2 1.4 1.5-12H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
}
function UsersIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="5.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 12c0-2.48 2.02-4.5 4.5-4.5S10 9.52 10 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}



