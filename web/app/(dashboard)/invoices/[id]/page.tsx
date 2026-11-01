"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api, { normaliseError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import type { Invoice, Payment } from "@/lib/types";

function titleCase(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { download, loading: pdfLoading, error: pdfError } = usePdfDownload();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [invoiceResponse, paymentsResponse] = await Promise.all([
          api.get<Invoice>(`/invoicing/invoices/${id}`),
          api.get<Payment[]>(`/invoicing/invoices/${id}/payments`),
        ]);

        if (!cancelled) {
          setInvoice(invoiceResponse.data);
          setPayments(paymentsResponse.data ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(normaliseError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    [payments]
  );

  const balance = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(Number(invoice.amount_due ?? invoice.total_amount - totalPaid), 0);
  }, [invoice, totalPaid]);

  async function handleDelete() {
    if (!invoice) return;
    if (!window.confirm(`Delete invoice ${invoice.reference}? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/invoicing/invoices/${invoice.id}`);
      router.push("/invoices");
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="pp-card">
        <div className="pp-skeleton" style={{ height: 18, width: 200, marginBottom: 10 }} />
        <div className="pp-skeleton" style={{ height: 12, width: 260 }} />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-icon">Invoice</div>
        <div className="pp-empty-title">Invoice not found</div>
        <p className="pp-empty-sub">{error ?? "This invoice does not exist or was removed."}</p>
        <Link href="/invoices" className="pp-btn pp-btn-primary" style={{ marginTop: 10 }}>
          Back to invoices
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Invoice Detail</span>
          <h1 className="pp-page-title">Invoice {invoice.reference}</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            {invoice.client_name ?? "Client"} - due {formatDate(invoice.due_date ?? invoice.issued_at, "short")}
          </p>
          <div className="pp-ops-hero-meta">
            <span>{titleCase(invoice.status)}</span>
            <span>{invoice.booking_id ? "Linked to booking" : "Standalone invoice"}</span>
            <span>Created {formatDate(invoice.created_at, "short")}</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <button
            className="pp-btn pp-btn-ghost"
            onClick={() => download(`/pdfs/invoices/${invoice.id}`, `Invoice-${invoice.reference}.pdf`)}
            disabled={pdfLoading}
          >
            {pdfLoading ? "Preparing PDF..." : "Download PDF"}
          </button>
          {invoice.booking_id && (
            <Link href={`/bookings/${invoice.booking_id}`} className="pp-btn pp-btn-ghost">
              View booking
            </Link>
          )}
          {(invoice.status === "draft" || invoice.status === "cancelled") && (
            <button
              className="pp-btn pp-btn-ghost"
              style={{ color: "var(--pp-red)", borderColor: "rgba(224,90,74,0.2)" }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete invoice"}
            </button>
          )}
        </div>
      </section>

      {(error || pdfError) && <div className="pp-alert pp-alert-error">{error ?? pdfError}</div>}

      <div className="pp-ops-summary-grid" style={{ marginBottom: 14 }}>
        <DetailStat label="Invoice Total" value={formatCurrency(invoice.total_amount)} tone="gold" />
        <DetailStat label="Recorded Payments" value={formatCurrency(totalPaid, { showEmpty: true })} tone="green" />
        <DetailStat label="Balance Remaining" value={balance > 0 ? formatCurrency(balance) : "Settled"} tone={balance > 0 ? undefined : "green"} />
        <DetailStat label="Line Items" value={String(invoice.items?.length ?? 0)} />
      </div>

      <div className="pp-toolbar-note">
        <span>Draft and cancelled invoices can be removed here when duplicates are created during testing or admin cleanup.</span>
      </div>

      <section className="pp-card pp-invoice-focus-card" style={{ marginBottom: 14 }}>
        <div className="pp-card-header">
          <span className="pp-card-title">Billing Summary</span>
          <span className="pp-card-link">Commercial snapshot</span>
        </div>
        <div className="pp-detail-grid">
          <div className="pp-detail-item">
            <span className="pp-detail-label">Status</span>
            <span className="pp-detail-value">{titleCase(invoice.status)}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Client</span>
            <span className="pp-detail-value">{invoice.client_name ?? "-"}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Issued</span>
            <span className="pp-detail-value">{formatDate(invoice.issued_at ?? invoice.created_at)}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Due date</span>
            <span className="pp-detail-value">{formatDate(invoice.due_date ?? invoice.issued_at)}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Subtotal</span>
            <span className="pp-detail-value">{formatCurrency(invoice.subtotal, { showEmpty: true })}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Tax</span>
            <span className="pp-detail-value">{formatCurrency(invoice.tax_amount, { showEmpty: true })}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Discount</span>
            <span className="pp-detail-value">{formatCurrency(invoice.discount_amount, { showEmpty: true })}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Notes</span>
            <span className="pp-detail-value">{invoice.notes?.trim() || "No internal notes"}</span>
          </div>
        </div>
      </section>

      <section className="pp-card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div className="pp-card-header">
          <span className="pp-card-title">Line Items</span>
          <span className="pp-card-link">What the client is being billed for</span>
        </div>
        {invoice.items && invoice.items.length > 0 ? (
          <table className="pp-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unit_price, { showEmpty: true })}</td>
                  <td>{formatCurrency(item.total_price, { showEmpty: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="pp-empty" style={{ padding: "18px 20px" }}>
            <div className="pp-empty-title">No line items attached</div>
            <p className="pp-empty-sub">This invoice does not have detailed items yet, so finance only has the summary totals to work from.</p>
          </div>
        )}
      </section>

      <section className="pp-card pp-invoice-focus-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="pp-card-header">
          <span className="pp-card-title">Payments</span>
          <span className="pp-card-link">Recorded receipts against this invoice</span>
        </div>
        {payments.length > 0 ? (
          <table className="pp-table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Method</th>
                <th>Paid at</th>
                <th>Provider ref</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatCurrency(payment.amount, { showEmpty: true })}</td>
                  <td>{titleCase(payment.method)}</td>
                  <td>{formatDate(payment.paid_at, "short")}</td>
                  <td>{payment.provider_ref ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="pp-empty" style={{ padding: "18px 20px" }}>
            <div className="pp-empty-title">No payments recorded yet</div>
            <p className="pp-empty-sub">When payments are captured from the invoice workspace, they will appear here with method, date, and provider reference.</p>
          </div>
        )}
      </section>
    </>
  );
}

function DetailStat({ label, value, tone }: { label: string; value: string; tone?: "gold" | "green" }) {
  return (
    <div className={tone ? `pp-ops-summary-card pp-ops-summary-card--${tone}` : "pp-ops-summary-card"}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value">{value}</div>
    </div>
  );
}
