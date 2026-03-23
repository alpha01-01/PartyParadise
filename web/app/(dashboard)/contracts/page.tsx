"use client";

import { useState } from "react";
import Link from "next/link";
import api, { normaliseError } from "@/lib/api";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { usePdfDownload } from "@/hooks/usePdfDownload";
import { useContracts } from "@/hooks";
import type { ContractStatus } from "@/lib/types";
import { downloadCsv } from "@/lib/export";

// â”€â”€â”€ Mock data (replace with useContracts hook) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_BADGE: Record<ContractStatus, string> = {
  draft:     "pp-badge-neutral",
  sent:      "pp-badge-blue",
  signed:    "pp-badge-green",
  expired:   "pp-badge-red",
  cancelled: "pp-badge-neutral",
};

const FILTER_TABS: { value: ContractStatus | "all"; label: string }[] = [
  { value: "all",     label: "All" },
  { value: "draft",   label: "Draft" },
  { value: "sent",    label: "Sent" },
  { value: "signed",  label: "Signed" },
  { value: "expired", label: "Expired" },
];

export default function ContractsPage() {
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatus] = useState<ContractStatus | "all">("all");
  const [sending, setSending]   = useState<string | null>(null);

  const {
    contracts,
    total,
    loading,
    error,
    updateFilters,
    refresh,
  } = useContracts({ page_size: 20, status: "all" });

  const filtered = contracts.filter((c) => {
    const ms = statusFilter === "all" || c.status === statusFilter;
    const mq = !search ||
      c.reference.toLowerCase().includes(search.toLowerCase()) ||
      c.client_name.toLowerCase().includes(search.toLowerCase());
    return ms && mq;
  });

  const stats = {
    total:    total ?? contracts.length,
    signed:   contracts.filter((c) => c.status === "signed").length,
    awaiting: contracts.filter((c) => c.status === "sent").length,
    draft:    contracts.filter((c) => c.status === "draft").length,
  };

  async function handleSend(contractId: string) {
    setSending(contractId);
    try {
      await api.patch(`/contracts/${contractId}/send`);
      refresh();
    } catch (err) {
      console.error(normaliseError(err).message);
    } finally {
      setSending(null);
    }
  }

  function handleExport() {
    downloadCsv("contracts.csv", filtered.map((contract) => ({
      Reference: contract.reference,
      Client: contract.client_name,
      BookingId: contract.booking_id,
      Amount: contract.total_amount,
      Status: contract.status,
      SignedAt: contract.signed_at ?? "",
      CreatedAt: contract.created_at,
    })));
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Client Agreements</span>
          <h1 className="pp-page-title">Contracts</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Keep every booking agreement traceable from draft to signature, with a clean handoff into the signed record.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{stats.total} contracts in the pipeline</span>
            <span>{stats.signed} fully signed</span>
            <span>{stats.awaiting} waiting on client action</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <Link href="/contracts/new" className="pp-btn pp-btn-primary">
            New Contract
          </Link>
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
        </div>
      </section>

      <div className="pp-ops-summary-grid" style={{ marginBottom: 18 }}>
        <StatCard label="Total" value={String(stats.total)} sub="All contracts in this working set" />
        <StatCard label="Signed" value={String(stats.signed)} sub="Legally binding agreements" positive />
        <StatCard label="Awaiting" value={String(stats.awaiting)} sub="Sent to client for signature" gold={stats.awaiting > 0} />
        <StatCard label="Draft" value={String(stats.draft)} sub="Still being prepared" />
      </div>

      <div className="pp-toolbar-note">
        <span>Send draft contracts directly from this page, then track signature completion without losing booking context.</span>
        <span>Export downloads the currently filtered contract list as CSV.</span>
      </div>

      {/* Filters */}
      <div className="pp-filter-bar">
        <div className="pp-search-wrap">
          <SearchIcon />
          <input
            className="pp-search-input"
            placeholder="Search by contract reference or client"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pp-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              className={cn("pp-filter-tab", statusFilter === tab.value && "pp-filter-tab--active")}
              onClick={() => {
                setStatus(tab.value as ContractStatus | "all");
                updateFilters({ status: tab.value as ContractStatus | "all" });
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      {/* Table */}
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="pp-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Client</th>
              <th>Booking</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Signed</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 0 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="pp-skeleton" style={{ height: 56, margin: "1px 0" }} />
                  ))}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 24 }}>
                  <div className="pp-empty">
                    <div className="pp-empty-title">No contracts found</div>
                    <p className="pp-empty-sub">Try adjusting your filters or create one from a booking.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="pp-tr-clickable">
                  <td><span className="pp-ref">{c.reference}</span></td>
                  <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{c.client_name}</td>
                  <td style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>
                    <Link href={`/bookings/${c.booking_id}`} style={{ color: "var(--pp-text-2)", textDecoration: "none" }}>
                      View booking â†’
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>
                    {formatCurrency(c.total_amount)}
                  </td>
                  <td>
                    <span className={`pp-badge ${STATUS_BADGE[c.status]}`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ fontSize: 11.5, color: c.signed_at ? "var(--pp-green)" : "var(--pp-text-3)" }}>
                    {c.signed_at ? formatDate(c.signed_at, "short") : "â€”"}
                  </td>
                  <td style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>
                    {formatDate(c.created_at, "short")}
                  </td>
                  <td>
                    <div className="pp-row-actions" onClick={(e) => e.stopPropagation()}>
                      {c.status === "draft" && (
                        <button
                          className="pp-row-btn"
                          title="Send to client"
                          style={{ color: "var(--pp-blue, #7aa3e0)" }}
                          onClick={() => handleSend(c.id)}
                          disabled={sending === c.id}
                        >
                          <SendIcon />
                        </button>
                      )}
                      <Link href={`/contracts/${c.id}`} className="pp-row-btn" title="View">
                        <EyeIcon />
                      </Link>
                      <ContractPdfBtn contractId={c.id} reference={c.reference} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="pp-pagination">
          <span>Showing {filtered.length} of {total} contracts</span>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, positive, gold }: {
  label: string; value: string; sub: string; positive?: boolean; gold?: boolean;
}) {
  return (
    <div className={cn("pp-ops-summary-card", positive ? "pp-ops-summary-card--green" : gold ? "pp-ops-summary-card--gold" : undefined)}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value" style={{
        fontSize: 22,
        color: positive ? "var(--pp-green)" : gold ? "var(--pp-gold)" : undefined,
      }}>{value}</div>
      <div className="pp-ops-summary-detail">{sub}</div>
    </div>
  );
}

function ContractPdfBtn({ contractId, reference }: { contractId: string; reference: string }) {
  const { download, loading } = usePdfDownload();
  return (
    <button
      className="pp-row-btn"
      title="Download PDF"
      disabled={loading}
      onClick={(e) => { e.stopPropagation(); download(`/pdfs/contracts/${contractId}`, `Contract-${reference}.pdf`); }}
    >
      {loading ? <span style={{ fontSize: 9, color: "var(--pp-gold)" }}>â€¦</span> : <DownloadIcon />}
    </button>
  );
}

const SearchIcon   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const SendIcon     = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M12.5 1.5L1 6l5 2.5L8.5 13l4-11.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const EyeIcon      = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/></svg>;
const DownloadIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;

