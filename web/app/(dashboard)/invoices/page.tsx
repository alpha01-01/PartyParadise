"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useInvoices,
  useInvoice,
  recordPayment,
  sendInvoice,
  generateInvoiceFromBooking,
} from "@/hooks";
import { useDashboard } from "@/hooks";
import {
  formatCurrency,
  formatDate,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  cn,
  initials,
} from "@/lib/utils";
import api, { normaliseError } from "@/lib/api";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import type { Invoice, InvoiceStatus, PaymentMethod } from "@/lib/types";
import { downloadCsv } from "@/lib/export";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FILTER_TABS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "draft",    label: "Draft" },
  { value: "sent",     label: "Sent" },
  { value: "partial",  label: "Partial" },
  { value: "paid",     label: "Paid" },
  { value: "overdue",  label: "Overdue" },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  "momo_mtn", "momo_vodafone", "momo_airteltigo",
  "bank_transfer", "cash", "paystack", "cheque",
];

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function InvoicesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);

  const { data: summary } = useDashboard();

  const {
    invoices,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters,
    goToPage,
    refresh,
  } = useInvoices({ page_size: 20 });

  const selected = invoices.find((i) => i.id === selectedId) ?? null;

  // Aggregate stats from current data
  const stats = {
    outstanding: invoices
      .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
      .reduce((s, i) => s + i.amount_due, 0),
    overdue: invoices
      .filter((i) => i.status === "overdue")
      .reduce((s, i) => s + i.amount_due, 0),
    collected: invoices.reduce((s, i) => s + i.amount_paid, 0),
    drafts: invoices.filter((i) => i.status === "draft").length,
    overdueCount: invoices.filter((i) => i.status === "overdue").length,
    outstandingCount: invoices.filter((i) =>
      ["sent", "partial", "overdue"].includes(i.status)
    ).length,
  };

  function handleExport() {
    downloadCsv("invoices.csv", invoices.map((invoice) => ({
      Reference: invoice.reference,
      Client: invoice.client_name ?? invoice.client_id,
      Status: INVOICE_STATUS_LABELS[invoice.status],
      Total: invoice.total_amount,
      Paid: invoice.amount_paid,
      Balance: invoice.amount_due,
      DueDate: invoice.due_date ?? "",
      IssuedAt: invoice.issued_at ?? "",
    })));
  }

  function handleSearchChange(val: string) {
    setSearch(val);
    clearTimeout((window as any).__invSearchTimeout);
    (window as any).__invSearchTimeout = setTimeout(
      () => updateFilters({ search: val }),
      350
    );
  }

  async function handleDeleteInvoice(id: string, reference: string) {
    if (!confirm(`Delete invoice ${reference}? This cannot be undone.`)) return;
    try {
      await api.delete(`/invoicing/invoices/${id}`);
      if (selectedId === id) setSelectedId(null);
      refresh();
    } catch (err) {
      alert(normaliseError(err).message);
    }
  }

  async function handleSendInvoice(invoiceId: string) {
    try {
      await sendInvoice(invoiceId);
      refresh();
    } catch (err) {
      console.error(normaliseError(err).message);
    }
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Revenue Operations</span>
          <h1 className="pp-page-title">Invoices</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Move from quote to cash with a tighter view of what is drafted, sent, overdue, and already collected.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{total} invoices in this view</span>
            <span>{stats.outstandingCount} awaiting payment</span>
            <span>{stats.overdueCount} overdue and needing follow-up</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
          <Link href="/invoices/new" className="pp-btn pp-btn-primary">
            <PlusIcon /> New Invoice
          </Link>
        </div>
      </section>

      {/* Summary stats */}
      <div className="pp-ops-summary-grid pp-ops-summary-grid--dense">
        <StatCard
          label="Total Outstanding"
          value={formatCurrency(stats.outstanding)}
          sub={`${stats.outstandingCount} invoices`}
          highlight
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(stats.overdue)}
          sub={`${stats.overdueCount} past due`}
          danger={stats.overdueCount > 0}
        />
        <StatCard
          label="Collected This Month"
          value={formatCurrency(stats.collected)}
          sub={`${invoices.filter((i) => i.status === "paid").length} paid`}
          positive
        />
        <StatCard
          label="Draft"
          value={String(stats.drafts)}
          sub="Not yet sent"
        />
      </div>

      <div className="pp-toolbar-note">
        <span>Open any invoice to record payments, send the draft, download the PDF, or delete draft-only duplicates.</span>
        <span>Export downloads the invoices currently visible in the table as a CSV handoff file.</span>
      </div>

      {/* Filter bar */}
      <div className="pp-filter-bar">
        <div className="pp-search-wrap">
          <SearchIcon />
          <input
            className="pp-search-input"
            placeholder="Search by invoice reference, booking, or client"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
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
              onClick={() =>
                updateFilters({
                  status: tab.value === "all" ? undefined : (tab.value as InvoiceStatus),
                })
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      {/* Main layout */}
      <div className={cn("pp-inv-layout", selected && "pp-inv-layout--with-panel")}>
        {/* Table */}
        <div>
          {loading ? (
            <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="pp-skeleton" style={{ height: 56, margin: "1px 0" }} />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="pp-card pp-empty">
              <div className="pp-empty-icon">ðŸ§¾</div>
              <div className="pp-empty-title">No invoices found</div>
              <p className="pp-empty-sub">Adjust your filters or create a new invoice</p>
            </div>
          ) : (
            <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Progress</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      invoice={inv}
                      selected={selectedId === inv.id}
                      onSelect={() => setSelectedId((p) => p === inv.id ? null : inv.id)}
                      onRecordPayment={() => {
                        setSelectedId(inv.id);
                        setShowPayModal(true);
                      }}
                      onSend={() => handleSendInvoice(inv.id)}
                      onDelete={() => handleDeleteInvoice(inv.id, inv.reference)}
                    />
                  ))}
                </tbody>
              </table>
              <div className="pp-pagination">
                <span>Showing {invoices.length} of {total} invoices</span>
                <div className="pp-pg-btns">
                  <button className="pp-pg-btn" onClick={() => goToPage(page - 1)} disabled={page <= 1}>â€¹</button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                    <button
                      key={i + 1}
                      className={cn("pp-pg-btn", page === i + 1 && "pp-pg-btn--active")}
                      onClick={() => goToPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button className="pp-pg-btn" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>â€º</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <InvoiceDetailPanel
            invoice={selected}
            onClose={() => setSelectedId(null)}
            onRecordPayment={() => setShowPayModal(true)}
            onSend={() => handleSendInvoice(selected.id)}
            onDelete={() => handleDeleteInvoice(selected.id, selected.reference)}
            onRefresh={refresh}
          />
        )}
      </div>

      {/* Record payment modal */}
      {showPayModal && selected && (
        <RecordPaymentModal
          invoice={selected}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => {
            setShowPayModal(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

// â”€â”€â”€ Invoice row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InvoiceRow({
  invoice: inv,
  selected,
  onSelect,
  onRecordPayment,
  onSend,
  onDelete,
}: {
  invoice: Invoice;
  selected: boolean;
  onSelect: () => void;
  onRecordPayment: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  const color = INVOICE_STATUS_COLORS[inv.status] ?? "neutral";
  const pct = inv.total_amount > 0
    ? Math.round((inv.amount_paid / inv.total_amount) * 100)
    : 0;
  const isOverdue = inv.status === "overdue";
  const daysLeft = inv.due_date
    ? Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <tr
      className={cn("pp-tr-clickable", selected && "pp-tr-selected")}
      onClick={onSelect}
    >
      <td><span className="pp-ref">{inv.reference}</span></td>
      <td>
        <div className="pp-client-cell">
          <div className="pp-client-av" style={{ fontSize: 9 }}>
            {initials(inv.client_name ?? inv.reference)}
          </div>
          <span style={{ fontSize: 12.5 }}>
            {inv.client_name ?? `${inv.client_id.slice(0, 8)}...`}
          </span>
        </div>
      </td>
      <td className="pp-amount-cell">{formatCurrency(inv.total_amount)}</td>
      <td style={{ color: "var(--pp-green)", fontWeight: 500 }}>
        {inv.amount_paid > 0 ? formatCurrency(inv.amount_paid) : "â€”"}
      </td>
      <td style={{
        fontWeight: 600,
        color: inv.amount_due === 0
          ? "var(--pp-green)"
          : isOverdue
            ? "var(--pp-red)"
            : "var(--pp-gold)",
      }}>
        {inv.amount_due === 0 ? "âœ“ Settled" : formatCurrency(inv.amount_due)}
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 64, height: 4, background: "var(--pp-surface3, #232019)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: 2,
              background: pct === 100
                ? "var(--pp-green)"
                : isOverdue
                  ? "var(--pp-red)"
                  : "var(--pp-gold)",
            }} />
          </div>
          <span style={{ fontSize: 10.5, color: "var(--pp-text-3)" }}>{pct}%</span>
        </div>
      </td>
      <td style={{
        fontSize: 11.5,
        color: isOverdue
          ? "var(--pp-red)"
          : daysLeft !== null && daysLeft <= 5
            ? "var(--pp-gold)"
            : undefined,
        fontWeight: isOverdue ? 500 : undefined,
      }}>
        {inv.due_date ? formatDate(inv.due_date, "short") : "â€”"}
        {isOverdue && " (overdue)"}
      </td>
      <td>
        <span className={`pp-badge pp-badge-${color}`}>
          {INVOICE_STATUS_LABELS[inv.status]}
        </span>
      </td>
      <td>
        <div className="pp-row-actions" onClick={(e) => e.stopPropagation()}>
          <button className="pp-row-btn" onClick={onSelect} title="View">
            <EyeIcon />
          </button>
          {["sent", "partial", "overdue"].includes(inv.status) && (
            <button
              className="pp-row-btn"
              onClick={onRecordPayment}
              title="Record payment"
              style={{ color: "var(--pp-green)" }}
            >
              <CoinIcon />
            </button>
          )}
          {inv.status === "draft" && (
            <button
              className="pp-row-btn"
              onClick={onSend}
              title="Send invoice"
              style={{ color: "var(--pp-blue, #7aa3e0)" }}
            >
              <SendIcon />
            </button>
          )}
          {["draft", "cancelled"].includes(inv.status) && (
            <button
              className="pp-row-btn pp-row-btn--danger"
              onClick={onDelete}
              title="Delete invoice"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// â”€â”€â”€ Detail panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InvoiceDetailPanel({
  invoice: inv,
  onClose,
  onRecordPayment,
  onSend,
  onDelete,
  onRefresh,
}: {
  invoice: Invoice;
  onClose: () => void;
  onRecordPayment: () => void;
  onSend: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const { invoice: full, payments, loading } = useInvoice(inv.id);
  const data = full ?? inv;

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <div className="pp-dp-ref">{data.reference}</div>
        <div className="pp-dp-name" style={{ fontSize: 16 }}>
          Invoice &nbsp;
          <span className={`pp-badge pp-badge-${INVOICE_STATUS_COLORS[data.status] ?? "neutral"}`}>
            {INVOICE_STATUS_LABELS[data.status]}
          </span>
        </div>

        {/* Amount cards */}
        <div className="pp-inv-amount-grid">
          <div className="pp-inv-amount-card">
            <div className="pp-inv-amount-label">Invoice Total</div>
            <div className="pp-inv-amount-value">{formatCurrency(data.total_amount)}</div>
          </div>
          <div className="pp-inv-amount-card">
            <div className="pp-inv-amount-label">Balance Due</div>
            <div
              className="pp-inv-amount-value"
              style={{ color: data.amount_due === 0 ? "var(--pp-green)" : data.status === "overdue" ? "var(--pp-red)" : "var(--pp-gold)" }}
            >
              {data.amount_due === 0 ? "âœ“ Settled" : formatCurrency(data.amount_due)}
            </div>
          </div>
        </div>

        <div className="pp-dp-actions">
          {["sent", "partial", "overdue"].includes(data.status) && (
            <button className="pp-btn pp-btn-primary" onClick={onRecordPayment}>
              Record Payment
            </button>
          )}
          {data.status === "draft" && (
            <button className="pp-btn pp-btn-primary" onClick={onSend}>
              Send Invoice
            </button>
          )}
          {["draft", "cancelled"].includes(data.status) && (
            <button
              className="pp-btn pp-btn-ghost"
              onClick={onDelete}
              style={{ color: "var(--pp-red)", borderColor: "rgba(224,90,74,0.2)" }}
            >
              Delete Invoice
            </button>
          )}
          <DownloadPdfButton invoiceId={data.id} reference={data.reference} />
          {data.status !== "paid" && data.status !== "cancelled" && (
            <button className="pp-btn pp-btn-ghost">Send Reminder</button>
          )}
        </div>
      </div>

      <div className="pp-dp-body">
        {/* Invoice info */}
        <div className="pp-dp-section">
          <div className="pp-dp-section-header">
            <span className="pp-dp-section-title">Details</span>
          </div>
          <DpField label="Booking"   value={data.booking_id ? `BK-â€¦${data.booking_id.slice(-4)}` : "â€”"} />
          <DpField label="Issued"    value={data.issued_at ? formatDate(data.issued_at) : "Not yet sent"} />
          <DpField label="Due date"  value={data.due_date ? formatDate(data.due_date) : "â€”"} />
          <DpField label="Subtotal"  value={formatCurrency(data.subtotal)} />
          {data.discount_amount > 0 && (
            <DpField label="Discount" value={`âˆ’${formatCurrency(data.discount_amount)}`} />
          )}
          {data.tax_amount > 0 && (
            <DpField label="Tax" value={formatCurrency(data.tax_amount)} />
          )}
        </div>

        {/* Line items */}
        {data.items && data.items.length > 0 && (
          <div className="pp-dp-section">
            <div className="pp-dp-section-header">
              <span className="pp-dp-section-title">Line Items</span>
            </div>
            {data.items.map((item) => (
              <div key={item.id} className="pp-li-row">
                <div>
                  <div style={{ fontSize: 12.5, color: "var(--pp-text-2)" }}>{item.description}</div>
                  {item.quantity > 1 && (
                    <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                      {item.quantity} Ã— {formatCurrency(item.unit_price)}
                    </div>
                  )}
                </div>
                <span style={{ fontWeight: 500, color: "var(--pp-text)" }}>
                  {formatCurrency(item.total_price)}
                </span>
              </div>
            ))}
            <div className="pp-li-total">
              <span>Total</span>
              <span className="pp-li-total-value">{formatCurrency(data.total_amount)}</span>
            </div>
          </div>
        )}

        {/* Payments */}
        <div className="pp-dp-section">
          <div className="pp-dp-section-header">
            <span className="pp-dp-section-title">
              Payments ({loading ? "â€¦" : payments.length})
            </span>
          </div>
          {loading ? (
            <div className="pp-skeleton" style={{ height: 40, margin: "8px 18px" }} />
          ) : payments.length === 0 ? (
            <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>
              No payments recorded yet
            </p>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="pp-payment-row">
                <div className="pp-payment-dot" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--pp-text)" }}>
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
                    {formatDate(p.paid_at)} &nbsp;Â·&nbsp; {p.reference ?? "â€”"}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-green)" }}>
                  +{formatCurrency(p.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Record payment modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RecordPaymentModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(invoice.amount_due));
  const [method, setMethod] = useState<PaymentMethod>("momo_mtn");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [providerRef, setProviderRef] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !date) {
      setError("Amount and date are required");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (amountNum > invoice.amount_due) {
      setError(`Amount cannot exceed balance due (${formatCurrency(invoice.amount_due)})`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await recordPayment(invoice.id, {
        amount: amountNum,
        method,
        paid_at: date,
        provider_ref: providerRef || undefined,
        notes: notes || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(normaliseError(err).message);
      setLoading(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">Record Payment</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="pp-modal-intro">
          <div>
            <div className="pp-modal-intro-kicker">Payment Capture</div>
            <p className="pp-modal-intro-copy">
              Record the exact amount received so the invoice balance, finance reporting, and client account history stay in sync.
            </p>
          </div>
        </div>

        {/* Invoice summary */}
        <div className="pp-modal-invoice-summary pp-modal-invoice-summary--premium">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
            <span style={{ color: "var(--pp-text-2)", fontSize: 12 }}>{invoice.reference}</span>
            <span style={{ color: "var(--pp-text)", fontWeight: 500, fontSize: 12 }}>
              {invoice.client_name ?? "Client"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "var(--pp-text-3)", fontSize: 12 }}>Balance due</span>
            <span style={{ color: "var(--pp-gold)", fontWeight: 600, fontSize: 12 }}>
              {formatCurrency(invoice.amount_due)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="pp-modal-body">
            {error && (
              <div className="pp-field-error" style={{ marginBottom: 4 }}>{error}</div>
            )}

            <div className="pp-field">
              <label className="pp-field-label">
                Amount (GHS) <span className="pp-required">*</span>
              </label>
              <input
                className="pp-input"
                type="number"
                min="0.01"
                step="0.01"
                max={invoice.amount_due}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">
                Payment method <span className="pp-required">*</span>
              </label>
              <select
                className="pp-input"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] ?? m}</option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <label className="pp-field-label">
                Date received <span className="pp-required">*</span>
              </label>
              <input
                className="pp-input"
                type="date"
                value={date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Transaction reference (optional)</label>
              <input
                className="pp-input"
                placeholder="e.g. MoMo transaction ID"
                value={providerRef}
                onChange={(e) => setProviderRef(e.target.value)}
              />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Notes (optional)</label>
              <textarea
                className="pp-input"
                rows={2}
                placeholder="Any extra context the finance team should keep with this payment"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ resize: "none" }}
              />
            </div>
          </div>

          <div className="pp-modal-footer">
            <button
              type="button"
              className="pp-btn pp-btn-ghost"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={cn("pp-btn pp-btn-primary", loading && "pp-btn--loading")}
              style={{ flex: 2, justifyContent: "center" }}
              disabled={loading}
            >
              {loading && <span className="pp-spinner" />}
              <span>Record Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â”€â”€â”€ Small components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({
  label, value, sub, highlight = false, danger = false, positive = false,
}: {
  label: string; value: string; sub: string;
  highlight?: boolean; danger?: boolean; positive?: boolean;
}) {
  return (
    <div className={cn(
      "pp-ops-summary-card",
      highlight && "pp-ops-summary-card--gold",
      danger && "pp-ops-summary-card--danger",
    )}>
      <div className="pp-ops-summary-label">{label}</div>
      <div
        className="pp-ops-summary-value"
        style={{ color: positive ? "var(--pp-green)" : danger ? "var(--pp-red)" : undefined }}
      >
        {value}
      </div>
      <div className="pp-ops-summary-detail">{sub}</div>
    </div>
  );
}

function DpField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 12.5 }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ color: "var(--pp-text)", fontSize: 12 }}>{value}</span>
    </div>
  );
}

// â”€â”€â”€ Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ PDF download button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DownloadPdfButton({ invoiceId, reference }: { invoiceId: string; reference: string }) {
  const { download, loading } = usePdfDownload();
  return (
    <button
      className={cn("pp-btn pp-btn-ghost", loading && "pp-btn--loading")}
      onClick={() => download(`/pdfs/invoices/${invoiceId}`, `Invoice-${reference}.pdf`)}
      disabled={loading}
    >
      {loading && <span className="pp-spinner" style={{ borderTopColor: "var(--pp-text)", borderColor: "var(--pp-border2)" }} />}
      <span>Download PDF</span>
    </button>
  );
}

const PlusIcon  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const SearchIcon= () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const EyeIcon   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/></svg>;
const CoinIcon  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v11M3.5 9.5c0 1.1 1.57 2 3.5 2s3.5-.9 3.5-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3.5 7c0 1.1 1.57 2 3.5 2s3.5-.9 3.5-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><ellipse cx="7" cy="4.5" rx="3.5" ry="2" stroke="currentColor" strokeWidth="1.3"/></svg>;
const SendIcon  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M12.5 1.5L1 6l5 2.5L8.5 13l4-11.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M5.5 2.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M4 4l.5 7h5L10 4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;




