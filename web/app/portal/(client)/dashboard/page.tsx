"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type PortalDashboard = {
  upcoming_bookings: Array<{
    id: string;
    reference: string;
    event_date: string;
    status: string;
  }>;
  unpaid_invoices_count: number;
  unpaid_total: number;
  unread_notifications: number;
};

type PortalInvoice = {
  id: string;
  reference: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  due_date: string | null;
};

type PortalContract = {
  id: string;
  reference: string;
  status: string;
  event_date: string | null;
  total_amount: number;
  sent_at: string | null;
  signed_at: string | null;
};

type PortalNotification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function PortalDashboardPage() {
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [dashboardResponse, invoiceResponse, contractResponse, notificationResponse] = await Promise.all([
          portalApi.get<PortalDashboard>("/portal/dashboard"),
          portalApi.get<PortalInvoice[]>("/portal/invoices"),
          portalApi.get<PortalContract[]>("/portal/contracts"),
          portalApi.get<PortalNotification[]>("/portal/notifications"),
        ]);

        if (cancelled) return;
        setDashboard(dashboardResponse.data);
        setInvoices(invoiceResponse.data ?? []);
        setContracts(contractResponse.data ?? []);
        setNotifications(notificationResponse.data ?? []);
      } catch (err) {
        if (cancelled) return;
        const message = (err as { message?: string }).message ?? "Unable to load portal dashboard";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px" }}>
        <div className="pp-card">
          <div className="pp-skeleton" style={{ height: 18, width: 220, marginBottom: 10 }} />
          <div className="pp-skeleton" style={{ height: 12, width: 320 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <div className="pp-card pp-empty">
          <div className="pp-empty-icon">Portal</div>
          <div className="pp-empty-title">Portal unavailable</div>
          <p className="pp-empty-sub">{error}</p>
          <Link href="/portal/login" className="pp-btn pp-btn-primary" style={{ marginTop: 12 }}>Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Client Portal</span>
          <h1 className="pp-page-title">Your event workspace</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Track upcoming bookings, outstanding invoices, contracts, and account notifications in one place.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{dashboard?.upcoming_bookings.length ?? 0} upcoming bookings</span>
            <span>{dashboard?.unpaid_invoices_count ?? 0} unpaid invoices</span>
            <span>{dashboard?.unread_notifications ?? 0} unread notifications</span>
          </div>
        </div>
      </section>

      <div className="pp-ops-summary-grid">
        <SummaryCard label="Upcoming Bookings" value={String(dashboard?.upcoming_bookings.length ?? 0)} detail="Your next confirmed or active events" />
        <SummaryCard label="Unpaid Invoices" value={String(dashboard?.unpaid_invoices_count ?? 0)} detail="Invoices still awaiting payment" tone="gold" />
        <SummaryCard label="Outstanding Total" value={formatCurrency(dashboard?.unpaid_total ?? 0, { showEmpty: true })} detail="Current unpaid invoice balance" tone="green" />
        <SummaryCard label="Unread Notifications" value={String(dashboard?.unread_notifications ?? 0)} detail="Messages and reminders for your events" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <section className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Upcoming bookings</span>
              <span className="pp-card-link">Events on your calendar</span>
            </div>
            {dashboard?.upcoming_bookings.length ? (
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.upcoming_bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.reference}</td>
                      <td>{formatDate(booking.event_date, "short")}</td>
                      <td>{booking.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pp-empty" style={{ padding: "18px 20px" }}>
                <div className="pp-empty-title">No upcoming bookings</div>
                <p className="pp-empty-sub">When your next event is scheduled, it will show up here.</p>
              </div>
            )}
          </section>

          <section className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Invoices</span>
              <span className="pp-card-link">Billing snapshot</span>
            </div>
            {invoices.length ? (
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.reference}</td>
                      <td>{invoice.status}</td>
                      <td>{invoice.due_date ? formatDate(invoice.due_date, "short") : "-"}</td>
                      <td>{formatCurrency(invoice.amount_due, { showEmpty: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pp-empty" style={{ padding: "18px 20px" }}>
                <div className="pp-empty-title">No invoices available</div>
                <p className="pp-empty-sub">Invoices issued to your account will be listed here.</p>
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <section className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Contracts</span>
              <span className="pp-card-link">Recent agreements</span>
            </div>
            {contracts.length ? (
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{contract.reference}</td>
                      <td>{contract.status}</td>
                      <td>{contract.event_date ? formatDate(contract.event_date, "short") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pp-empty" style={{ padding: "18px 20px" }}>
                <div className="pp-empty-title">No contracts yet</div>
                <p className="pp-empty-sub">Contracts shared with you will appear here once prepared.</p>
              </div>
            )}
          </section>

          <section className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Notifications</span>
              <span className="pp-card-link">Recent client updates</span>
            </div>
            {notifications.length ? (
              <div style={{ display: "grid" }}>
                {notifications.slice(0, 8).map((notification) => (
                  <div key={notification.id} style={{ padding: "14px 18px", borderTop: "1px solid var(--pp-border)" }}>
                    <div style={{ fontWeight: 600, color: "var(--pp-text)" }}>{notification.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--pp-text-2)" }}>{notification.message}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--pp-text-3)" }}>
                      {formatDate(notification.created_at, "short")} {notification.is_read ? "· Read" : "· Unread"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pp-empty" style={{ padding: "18px 20px" }}>
                <div className="pp-empty-title">No notifications</div>
                <p className="pp-empty-sub">Reminders and event updates will appear here.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "gold" | "green" }) {
  return (
    <div className={tone ? `pp-ops-summary-card pp-ops-summary-card--${tone}` : "pp-ops-summary-card"}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value">{value}</div>
      <div className="pp-ops-summary-sub">{detail}</div>
    </div>
  );
}
