"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api, { normaliseError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import type { Contract } from "@/lib/types";

export default function ContractDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { download, loading: pdfLoading } = usePdfDownload();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<Contract>(`/contracts/${id}`);
        if (!cancelled) setContract(data);
      } catch (err) {
        if (!cancelled) setError(normaliseError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleSend() {
    if (!contract) return;
    setSending(true);
    try {
      const { data: sent } = await api.patch(`/contracts/${contract.id}/send`);
      if (!sent.email_sent) {
        window.prompt("The email was not delivered. Copy this signing link for the client:", sent.signing_url);
      }
      const { data } = await api.get<Contract>(`/contracts/${contract.id}`);
      setContract(data);
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="pp-card">
        <div className="pp-skeleton" style={{ height: 18, width: 180, marginBottom: 10 }} />
        <div className="pp-skeleton" style={{ height: 12, width: 240 }} />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-icon">⚠️</div>
        <div className="pp-empty-title">Contract not found</div>
        <p className="pp-empty-sub">{error ?? "This contract doesn't exist or was removed."}</p>
        <Link href="/contracts" className="pp-btn pp-btn-primary" style={{ marginTop: 10 }}>
          Back to Contracts
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">Contract {contract.reference}</h1>
          <p className="pp-page-subtitle">
            {contract.client_name} · {formatDate(contract.event_date, "long")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {contract.status === "draft" && (
            <button className="pp-btn pp-btn-primary" onClick={handleSend} disabled={sending}>
              {sending ? "Sending..." : "Send to Client"}
            </button>
          )}
          <button
            className="pp-btn pp-btn-ghost"
            onClick={() => download(`/pdfs/contracts/${contract.id}`, `Contract-${contract.reference}.pdf`)}
            disabled={pdfLoading}
          >
            {pdfLoading ? "Preparing..." : "Download PDF"}
          </button>
          <Link href={`/bookings/${contract.booking_id}`} className="pp-btn pp-btn-ghost">
            View Booking
          </Link>
        </div>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <div className="pp-card" style={{ marginBottom: 14 }}>
        <div className="pp-detail-grid">
          <div className="pp-detail-item">
            <span className="pp-detail-label">Status</span>
            <span className="pp-detail-value">{contract.status}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Total Amount</span>
            <span className="pp-detail-value">{formatCurrency(contract.total_amount)}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Deposit</span>
            <span className="pp-detail-value">
              {formatCurrency(contract.deposit_amount ?? 0, { showEmpty: true })}
            </span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Venue</span>
            <span className="pp-detail-value">{contract.venue ?? "—"}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Signed</span>
            <span className="pp-detail-value">{contract.signed_at ? formatDate(contract.signed_at, "short") : "—"}</span>
          </div>
          <div className="pp-detail-item">
            <span className="pp-detail-label">Created</span>
            <span className="pp-detail-value">{formatDate(contract.created_at, "short")}</span>
          </div>
        </div>
      </div>

      {contract.body && (
        <div className="pp-card">
          <div className="pp-card-header">
            <span className="pp-card-title">Contract Body</span>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", padding: "14px 18px", fontSize: 12.5, color: "var(--pp-text-2)" }}>
            {contract.body}
          </pre>
        </div>
      )}
    </>
  );
}
