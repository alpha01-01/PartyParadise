"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useClients, addInteraction } from "@/hooks";
import { formatDate, initials, cn } from "@/lib/utils";
import type { Client, ClientStatus } from "@/lib/types";
import { downloadCsv } from "@/lib/export";

const STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead",
  prospect: "Prospect",
  active: "Active",
  past: "Past",
  lost: "Lost",
};

const STATUS_BADGE: Record<ClientStatus, string> = {
  lead: "pp-badge-neutral",
  prospect: "pp-badge-blue",
  active: "pp-badge-green",
  past: "pp-badge-gold",
  lost: "pp-badge-red",
};

const FILTER_TABS: { value: ClientStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
  { value: "lost", label: "Lost" },
];

const AVATAR_PALETTES = [
  { bg: "rgba(245,200,66,0.15)", border: "rgba(245,200,66,0.3)", text: "var(--pp-gold)" },
  { bg: "rgba(122,163,224,0.15)", border: "rgba(122,163,224,0.3)", text: "#7aa3e0" },
  { bg: "rgba(76,175,125,0.15)", border: "rgba(76,175,125,0.3)", text: "var(--pp-green)" },
  { bg: "rgba(217,122,176,0.15)", border: "rgba(217,122,176,0.3)", text: "#d97ab0" },
  { bg: "rgba(224,90,74,0.15)", border: "rgba(224,90,74,0.3)", text: "var(--pp-red)" },
];

function avatarPalette(id: string) {
  const char = id.charCodeAt(Math.max(id.length - 1, 0));
  return AVATAR_PALETTES[char % AVATAR_PALETTES.length];
}

function titleCase(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ClientsPage() {
  const [view, setView] = useState<"table" | "cards">("table");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { clients, total, page, totalPages, loading, error, filters, updateFilters, goToPage, refresh } = useClients({ page_size: 20 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateFilters({ search: search || undefined });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (selectedId && !clients.some((client) => client.id === selectedId)) {
      setSelectedId(null);
    }
  }, [clients, selectedId]);

  const selected = clients.find((client) => client.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const activeCount = clients.filter((client) => client.status === "active").length;
    const leadCount = clients.filter((client) => client.status === "lead").length;
    const whatsappReady = clients.filter((client) => !!client.whatsapp).length;
    const withEmail = clients.filter((client) => !!client.email).length;
    return { activeCount, leadCount, whatsappReady, withEmail };
  }, [clients]);

  function handleExport() {
    downloadCsv(
      "clients.csv",
      clients.map((client) => ({
        Name: `${client.first_name} ${client.last_name}`.trim(),
        Email: client.email ?? "",
        Phone: client.phone ?? "",
        Status: STATUS_LABELS[client.status],
        Source: client.source ?? "",
        WhatsApp: client.whatsapp ?? "",
        Tags: (client.tags ?? []).map((tag) => tag.name).join("; "),
        CreatedAt: client.created_at,
      }))
    );
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Client Relationships</span>
          <h1 className="pp-page-title">Clients</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Manage discovery, follow-up, and service relationships from one calm workspace instead of scattered notes and chat threads.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{total} total records</span>
            <span>{stats.activeCount} active relationships</span>
            <span>{stats.leadCount} fresh leads</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <div className="pp-view-toggle">
            <button className={cn("pp-view-btn", view === "table" && "pp-view-btn--active")} onClick={() => setView("table")} title="Table view">
              <TableIcon />
            </button>
            <button className={cn("pp-view-btn", view === "cards" && "pp-view-btn--active")} onClick={() => setView("cards")} title="Card view">
              <GridIcon />
            </button>
          </div>
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
          <Link href="/clients/new" className="pp-btn pp-btn-primary">New Client</Link>
        </div>
      </section>

      <div className="pp-ops-summary-grid">
        <SummaryCard label="Active Relationships" value={String(stats.activeCount)} detail="Clients currently in delivery or recurring conversations" tone="gold" />
        <SummaryCard label="Leads To Convert" value={String(stats.leadCount)} detail="Fresh opportunities that still need discovery or quoting" />
        <SummaryCard label="WhatsApp Ready" value={String(stats.whatsappReady)} detail="Contacts you can reach instantly from the field or office" tone="green" />
        <SummaryCard label="Email On File" value={String(stats.withEmail)} detail="Profiles ready for invoices, contracts, and portal access" />
      </div>

      <div className="pp-filter-bar">
        <div className="pp-search-wrap">
          <SearchIcon />
          <input className="pp-search-input" placeholder="Search clients, source, or contact info" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="pp-filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              className={cn("pp-filter-tab", (filters.status ?? "all") === tab.value && "pp-filter-tab--active")}
              onClick={() => updateFilters({ status: tab.value === "all" ? undefined : tab.value })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pp-toolbar-note">
        <span>Select a client to review contact readiness, notes, and the next operational move without leaving the list.</span>
        <span>Export downloads the visible client set for handoff, backup, or offline review.</span>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <div className={cn("pp-clients-layout", selected && "pp-clients-layout--with-panel")}>
        <div>
          {loading ? (
            <SkeletonList />
          ) : view === "table" ? (
            <TableView clients={clients} selectedId={selectedId} page={page} totalPages={totalPages} total={total} onSelect={(id) => setSelectedId((current) => (current === id ? null : id))} onPageChange={goToPage} />
          ) : (
            <CardsView clients={clients} selectedId={selectedId} onSelect={(id) => setSelectedId((current) => (current === id ? null : id))} />
          )}
        </div>

        {selected && <ClientDetailPanel client={selected} onClose={() => setSelectedId(null)} onRefresh={refresh} />}
      </div>
    </>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "gold" | "green" }) {
  return (
    <div className={cn("pp-ops-summary-card", tone && `pp-ops-summary-card--${tone}`)}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value">{value}</div>
      <div className="pp-ops-summary-detail">{detail}</div>
    </div>
  );
}

function TableView({ clients, selectedId, page, totalPages, total, onSelect, onPageChange }: { clients: Client[]; selectedId: string | null; page: number; totalPages: number; total: number; onSelect: (id: string) => void; onPageChange: (page: number) => void; }) {
  if (!clients.length) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-title">No clients found</div>
        <p className="pp-empty-sub">Adjust your filters or add a new client to start building the relationship pipeline.</p>
      </div>
    );
  }

  return (
    <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="pp-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Status</th>
            <th>Source</th>
            <th>Tags</th>
            <th>Contact</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <ClientRow key={client.id} client={client} selected={selectedId === client.id} onSelect={() => onSelect(client.id)} />
          ))}
        </tbody>
      </table>
      <div className="pp-pagination">
        <span>Showing {clients.length} of {total} clients</span>
        <div className="pp-pg-btns">
          <button className="pp-pg-btn" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Prev</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
            const value = index + 1;
            return (
              <button key={value} className={cn("pp-pg-btn", page === value && "pp-pg-btn--active")} onClick={() => onPageChange(value)}>
                {value}
              </button>
            );
          })}
          <button className="pp-pg-btn" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next</button>
        </div>
      </div>
    </div>
  );
}

function ClientRow({ client, selected, onSelect }: { client: Client; selected: boolean; onSelect: () => void }) {
  const palette = avatarPalette(client.id);
  const name = `${client.first_name} ${client.last_name}`.trim();
  const tags = client.tags ?? [];
  const contact = client.whatsapp ?? client.phone ?? client.email ?? "No contact";

  return (
    <tr className={cn("pp-tr-clickable", selected && "pp-tr-selected")} onClick={onSelect}>
      <td>
        <div className="pp-client-cell">
          <div className="pp-client-av" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>{initials(name)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pp-text)" }}>{name}</div>
            <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{client.email ?? "No email on file"}</div>
          </div>
        </div>
      </td>
      <td><span className={`pp-badge ${STATUS_BADGE[client.status]}`}>{STATUS_LABELS[client.status]}</span></td>
      <td style={{ color: "var(--pp-text-2)" }}>{titleCase(client.source)}</td>
      <td>{tags.length ? tags.map((tag) => <span key={tag.id} className="pp-tag">{tag.name}</span>) : <span style={{ color: "var(--pp-text-3)", fontSize: 11 }}>-</span>}</td>
      <td style={{ color: "var(--pp-text-2)" }}>{contact}</td>
      <td style={{ color: "var(--pp-text-2)" }}>{formatDate(client.created_at, "short")}</td>
      <td>
        <div className="pp-row-actions" onClick={(event) => event.stopPropagation()}>
          <button className="pp-row-btn" title="View client" onClick={onSelect}><EyeIcon /></button>
          <Link href={`/bookings/new?client=${client.id}`} className="pp-row-btn" title="Create booking">B</Link>
        </div>
      </td>
    </tr>
  );
}

function CardsView({ clients, selectedId, onSelect }: { clients: Client[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (!clients.length) {
    return (
      <div className="pp-card pp-empty">
        <div className="pp-empty-title">No clients found</div>
      </div>
    );
  }

  return (
    <div className="pp-clients-grid">
      {clients.map((client) => {
        const palette = avatarPalette(client.id);
        const name = `${client.first_name} ${client.last_name}`.trim();
        const tags = client.tags ?? [];
        return (
          <div
            key={client.id}
            className={cn("pp-client-card polished-card", selectedId === client.id && "pp-client-card--selected")}
            onClick={() => onSelect(client.id)}
            tabIndex={0}
            style={{ position: "relative", transition: "box-shadow 0.2s, border-color 0.2s", boxShadow: selectedId === client.id ? "0 4px 24px rgba(76,175,125,0.10)" : "0 2px 8px rgba(0,0,0,0.04)", border: selectedId === client.id ? "2px solid var(--pp-green)" : "1px solid var(--pp-border)" }}
          >
            {/* Status badge top-right */}
            <span style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }} className={`pp-badge polished-badge ${STATUS_BADGE[client.status]}`}>{STATUS_LABELS[client.status]}</span>
            {/* Avatar */}
            <div className="pp-client-av pp-client-av--lg polished-avatar" style={{ background: palette.bg, borderColor: palette.border, color: palette.text, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>{initials(name)}</div>
            {/* Name */}
            <div className="pp-client-card-name polished-name" style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{name}</div>
            {/* Tags */}
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
                {tags.map((tag) => <span key={tag.id} className="pp-tag polished-tag">{tag.name}</span>)}
              </div>
            )}
            {/* Contact info */}
            <div className="pp-client-card-meta polished-meta" style={{ color: "var(--pp-text-2)", fontSize: 13, margin: "6px 0" }}>
              {client.phone && <span title="Phone" style={{ marginRight: 8 }}>📞 {client.phone}</span>}
              {client.email && <span title="Email" style={{ marginRight: 8 }}>✉️ {client.email}</span>}
              {client.whatsapp && <span title="WhatsApp" style={{ marginRight: 8 }}>🟢 WhatsApp</span>}
              {!client.phone && !client.email && !client.whatsapp && <span style={{ color: "var(--pp-text-3)" }}>No contact info</span>}
            </div>
            {/* Source */}
            <div style={{ color: "var(--pp-text-3)", fontSize: 12, marginBottom: 4 }}>{titleCase(client.source)}</div>
            {/* Footer/meta */}
            <div className="pp-client-card-footer polished-footer" style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
              <span>🗓️ Joined {formatDate(client.created_at, "short")}</span>
              <span>{client.whatsapp ? "✅ WhatsApp ready" : "⚠️ Needs outreach setup"}</span>
            </div>
            {/* Actions on hover */}
            <div className="polished-actions" style={{ position: "absolute", bottom: 12, right: 12, opacity: 0, pointerEvents: "none", transition: "opacity 0.2s" }}>
              <button className="pp-btn pp-btn-ghost" style={{ fontSize: 12, padding: "2px 10px" }}>View</button>
            </div>
          </div>
        );
      })}
      <style jsx global>{`
        .polished-card:hover, .polished-card:focus {
          box-shadow: 0 8px 32px rgba(76,175,125,0.13);
          border-color: var(--pp-green);
        }
        .polished-card:hover .polished-actions, .polished-card:focus .polished-actions {
          opacity: 1;
          pointer-events: auto;
        }
        .polished-avatar {
          margin: 0 auto;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }
        .polished-badge {
          border-radius: 12px;
          font-size: 11px;
          padding: 2px 10px;
        }
        .polished-tag {
          border-radius: 10px;
          font-size: 11px;
          padding: 2px 8px;
        }
        .polished-name {
          text-align: center;
        }
        .polished-meta {
          text-align: center;
        }
        .polished-footer {
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function ClientDetailPanel({ client, onClose, onRefresh }: { client: Client; onClose: () => void; onRefresh: () => void | Promise<void> }) {
  const palette = avatarPalette(client.id);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [logChannel, setLogChannel] = useState("whatsapp");
  const [logging, setLogging] = useState(false);
  const name = `${client.first_name} ${client.last_name}`.trim();

  async function handleLogInteraction() {
    if (!logText.trim()) return;
    setLogging(true);
    try {
      await addInteraction(client.id, {
        channel: logChannel as never,
        direction: "outbound" as never,
        summary: logText.trim(),
      });
      setLogText("");
      setLogOpen(false);
      await onRefresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <div className="pp-dp-av" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>{initials(name)}</div>
        <h2 className="pp-dp-name">{name}</h2>
        <div className="pp-dp-meta">
          <span className={`pp-badge ${STATUS_BADGE[client.status]}`}>{STATUS_LABELS[client.status]}</span>
          &nbsp; {titleCase(client.client_type, "Individual")} &nbsp;·&nbsp; {titleCase(client.source)}
        </div>
        <div className="pp-dp-actions">
          <Link href={`/bookings/new?client=${client.id}`} className="pp-btn pp-btn-primary" style={{ fontSize: 12 }}>New Booking</Link>
          <Link href={`/clients/${client.id}`} className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }}>Full Profile</Link>
        </div>
      </div>

      <div className="pp-dp-body">
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Contact Readiness</span></div>
          <DetailField label="Email" value={client.email ?? "-"} />
          <DetailField label="Phone" value={client.phone ?? "-"} />
          <DetailField label="WhatsApp" value={client.whatsapp ?? "-"} />
          <DetailField label="Joined" value={formatDate(client.created_at)} />
          <DetailField label="Notes" value={client.notes ?? "No notes yet"} multiline />
        </div>

        <div className="pp-dp-section">
          <div className="pp-dp-section-header">
            <span className="pp-dp-section-title">Quick Follow-Up</span>
            <button className="pp-dp-section-link" onClick={() => setLogOpen((open) => !open)}>{logOpen ? "Close" : "Log"}</button>
          </div>
          {logOpen ? (
            <div style={{ padding: "10px 18px" }}>
              <select className="pp-input" value={logChannel} onChange={(event) => setLogChannel(event.target.value)} style={{ marginBottom: 8, fontSize: 12 }}>
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="in_person">In person</option>
                <option value="instagram">Instagram</option>
              </select>
              <textarea className="pp-input" rows={3} value={logText} onChange={(event) => setLogText(event.target.value)} placeholder="Capture the latest outcome, objection, or next step." style={{ resize: "none", marginBottom: 8 }} />
              <button className="pp-btn pp-btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 12 }} onClick={handleLogInteraction} disabled={logging || !logText.trim()}>
                {logging ? "Saving..." : "Save Interaction"}
              </button>
            </div>
          ) : (
            <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>Use this quick log to preserve relationship context before moving to the next call, quote, or site visit.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 18px", fontSize: 12.5, alignItems: multiline ? "flex-start" : "center" }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ color: "var(--pp-text)", fontSize: 12, textAlign: "right", maxWidth: 190, whiteSpace: multiline ? "normal" : "nowrap" }}>{value}</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
      {Array.from({ length: 8 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 54, margin: "1px 0" }} />)}
    </div>
  );
}

const TableIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="5.5" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="10" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>;
const GridIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="7.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>;
const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const EyeIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3"/></svg>;
const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
