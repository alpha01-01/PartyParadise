"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { normaliseError } from "@/lib/api";
import { useClient, addInteraction } from "@/hooks";
import { formatCurrency, formatDate, timeAgo, initials, cn } from "@/lib/utils";
import type { ClientBookingSummary, ClientInvoiceSummary, Interaction } from "@/lib/types";

const AVATAR_PALETTES = [
  { bg: "rgba(245,200,66,0.15)", border: "rgba(245,200,66,0.3)", text: "var(--pp-gold)" },
  { bg: "rgba(122,163,224,0.15)", border: "rgba(122,163,224,0.3)", text: "#7aa3e0" },
  { bg: "rgba(76,175,125,0.15)", border: "rgba(76,175,125,0.3)", text: "var(--pp-green)" },
  { bg: "rgba(217,122,176,0.15)", border: "rgba(217,122,176,0.3)", text: "#d97ab0" },
];

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "var(--pp-green)",
  call: "#7aa3e0",
  email: "var(--pp-gold)",
  instagram: "#d97ab0",
  in_person: "var(--pp-text-3)",
};

const CLIENT_STATUS_BADGE: Record<string, string> = {
  lead: "pp-badge-neutral",
  prospect: "pp-badge-blue",
  active: "pp-badge-green",
  past: "pp-badge-gold",
  lost: "pp-badge-red",
};

const BOOKING_STATUS_BADGE: Record<string, string> = {
  inquiry: "pp-badge-neutral",
  quoted: "pp-badge-gold",
  confirmed: "pp-badge-green",
  in_progress: "pp-badge-blue",
  completed: "pp-badge-neutral",
  cancelled: "pp-badge-red",
};

function avatarPalette(id: string) {
  return AVATAR_PALETTES[id.charCodeAt(Math.max(id.length - 1, 0)) % AVATAR_PALETTES.length];
}

function titleCase(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ClientDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const { client, interactions, loading, error, refresh } = useClient(id);
  const [logOpen, setLogOpen] = useState(false);
  const [logChannel, setLogChannel] = useState("whatsapp");
  const [logDirection, setLogDirection] = useState("outbound");
  const [logText, setLogText] = useState("");
  const [logging, setLogging] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [portalInviteResult, setPortalInviteResult] = useState<{
    email: string;
    portal_url: string;
    delivery_status: string;
    setup_url?: string | null;
  } | null>(null);

  async function handleLogInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logText.trim()) return;

    setLogging(true);
    try {
      await addInteraction(id, {
        channel: logChannel as Interaction["channel"],
        direction: logDirection as Interaction["direction"],
        summary: logText.trim(),
      });
      setLogText("");
      setLogOpen(false);
      await refresh();
    } catch {
      // Surface errors through the shared hook refresh state instead.
    } finally {
      setLogging(false);
    }
  }

  async function handlePortalInvite() {
    setInviting(true);
    setPortalInviteError(null);
    setPortalInviteResult(null);
    try {
      const { default: api } = await import("@/lib/api");
      const { data } = await api.post<{
        message: string;
        email: string;
        portal_url: string;
        delivery_status: string;
        setup_url?: string | null;
      }>(`/portal/clients/${id}/invite`);
      setPortalInviteResult(data);
      await refresh();
    } catch (err) {
      setPortalInviteError(normaliseError(err).message);
    } finally {
      setInviting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !client) return <ErrorState error={error} />;

  const fullName = `${client.first_name} ${client.last_name}`.trim();
  const palette = avatarPalette(id || fullName || "A");
  const bookings = client.bookings ?? [];
  const invoices = client.invoices ?? [];
  const tags = client.tags ?? [];
  const addresses = client.addresses ?? [];
  const totalSpent = bookings.reduce((sum, booking) => sum + Number(booking.total_amount ?? 0), 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_due ?? 0), 0);

  return (
    <>
      <div style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 14 }}>
        <Link href="/clients" style={{ color: "var(--pp-text-3)", textDecoration: "none" }}>
          Clients
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--pp-text)", fontWeight: 500 }}>{fullName}</span>
      </div>

      <div className="pp-toolbar-note" style={{ marginTop: -4 }}>
        <span>This profile should hold the whole relationship story: live bookings, billing signals, notes, and contact readiness in one place.</span>
        <span>Use the timeline to preserve context before the next quote, follow-up, or production handoff.</span>
      </div>

      <section className="pp-client-hero pp-client-hero--premium">
        <div className="pp-hero-av" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>
          {initials(fullName)}
        </div>

        <div style={{ flex: 1 }}>
          <h1 className="pp-hero-name">{fullName}</h1>
          <p className="pp-hero-meta">
            {titleCase(client.client_type, "Individual")} via {titleCase(client.source, "Direct referral")} - client since {formatDate(client.created_at, "short")}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span className={`pp-badge ${CLIENT_STATUS_BADGE[client.status] ?? "pp-badge-neutral"}`}>
              {titleCase(client.status)}
            </span>
            {tags.map((tag) => (
              <span key={tag.id} className="pp-tag">{tag.name}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Link href={`/bookings/new?client=${id}`} className="pp-btn pp-btn-primary" style={{ fontSize: 12 }}>
              New Booking
            </Link>
            {client.whatsapp && (
              <a
                href={`https://wa.me/${client.whatsapp.replace(/\s+/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-btn pp-btn-ghost"
                style={{ fontSize: 12, color: "var(--pp-green)", borderColor: "rgba(76,175,125,0.2)" }}
              >
                WhatsApp
              </a>
            )}
            <Link href={`/clients/${id}/edit`} className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }}>
              Edit Profile
            </Link>
          </div>
        </div>

        <div className="pp-hero-stats pp-hero-stats--premium">
          <StatMini label="Bookings" value={String(bookings.length)} detail="Active event opportunities linked to this client" />
          <StatMini label="Lifetime Revenue" value={formatCurrency(totalSpent, { compact: true })} detail="Recognized value across booked work" gold />
          <StatMini label="Outstanding" value={formatCurrency(outstanding, { compact: true, showEmpty: true })} detail="Current unpaid invoice balance" />
        </div>
      </section>

      <div className="pp-client-detail-layout pp-client-detail-layout--premium">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Bookings ({bookings.length})</span>
              <Link href={`/bookings/new?client=${id}`} className="pp-card-link">Open booking flow</Link>
            </div>
            {bookings.length > 0 ? (
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ padding: "14px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>
                No bookings are attached yet. Start a booking to move this relationship into an active event workflow.
              </p>
            )}
          </section>

          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Interaction Timeline ({interactions.length})</span>
              <button className="pp-card-link" onClick={() => setLogOpen((open) => !open)}>
                {logOpen ? "Close" : "Log interaction"}
              </button>
            </div>

            {logOpen && (
              <form onSubmit={handleLogInteraction} style={{ padding: "12px 18px", borderBottom: "1px solid var(--pp-border)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="pp-input" value={logChannel} onChange={(event) => setLogChannel(event.target.value)} style={{ flex: 1, fontSize: 12 }}>
                    {[
                      ["whatsapp", "WhatsApp"],
                      ["call", "Call"],
                      ["email", "Email"],
                      ["in_person", "In person"],
                      ["instagram", "Instagram"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <select className="pp-input" value={logDirection} onChange={(event) => setLogDirection(event.target.value)} style={{ flex: 1, fontSize: 12 }}>
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>
                <textarea
                  className="pp-input"
                  placeholder="Capture the key outcome, next step, or client signal from this touchpoint."
                  value={logText}
                  onChange={(event) => setLogText(event.target.value)}
                  rows={3}
                  style={{ resize: "none" }}
                />
                <button type="submit" className={cn("pp-btn pp-btn-primary", logging && "pp-btn--loading")} style={{ alignSelf: "flex-end", fontSize: 12 }} disabled={logging || !logText.trim()}>
                  <span>Save Interaction</span>
                </button>
              </form>
            )}

            {interactions.length > 0 ? (
              interactions.map((interaction, index) => (
                <TimelineItem key={interaction.id} interaction={interaction} showLine={index < interactions.length - 1} />
              ))
            ) : (
              <p style={{ padding: "12px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>
                No interactions logged yet. Use the log action to capture calls, emails, WhatsApp updates, and in-person notes.
              </p>
            )}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Contact Readiness</span>
              <span className="pp-card-link">Key details for quick follow-up</span>
            </div>
            <DetailField label="Phone" value={client.phone ?? "-"} />
            <DetailField label="WhatsApp" value={client.whatsapp ?? "-"} green={Boolean(client.whatsapp)} />
            <DetailField label="Email" value={client.email ?? "-"} />
            <DetailField label="Client type" value={titleCase(client.client_type, "Individual")} />
            <DetailField label="Lead source" value={titleCase(client.source)} />
            <DetailField label="Client since" value={formatDate(client.created_at)} />
            {addresses.map((address) => (
              <DetailField
                key={`${address.type ?? "address"}-${address.city ?? "unknown"}-${address.region ?? ""}`}
                label={titleCase(address.type, "Address")}
                value={[address.city, address.region].filter(Boolean).join(", ") || "-"}
              />
            ))}
          </section>

          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Notes</span>
              <Link href={`/clients/${id}/edit`} className="pp-card-link">Refine notes</Link>
            </div>
            <div className="pp-client-note-block">
              {client.notes ? (
                <p style={{ fontSize: 12.5, color: "var(--pp-text-2)", lineHeight: 1.6 }}>{client.notes}</p>
              ) : (
                <p style={{ fontSize: 12, color: "var(--pp-text-3)" }}>
                  No relationship notes yet. Add internal context to help the team quote and deliver consistently.
                </p>
              )}
            </div>
          </section>

          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Invoice Snapshot</span>
              <Link href={`/invoices?client=${id}`} className="pp-card-link">Open invoices</Link>
            </div>
            {invoices.length > 0 ? (
              invoices.slice(0, 4).map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))
            ) : (
              <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>
                No invoices generated yet. Once billing is created, this card becomes the quick financial view for the client.
              </p>
            )}
          </section>

          <section className="pp-card pp-client-section" style={{ padding: 0 }}>
            <div className="pp-card-header">
              <span className="pp-card-title">Client Portal</span>
              <span className="pp-card-link">Access and self-serve readiness</span>
            </div>
            {portalInviteError && (
              <div className="pp-alert pp-alert-error" style={{ margin: "12px 18px 0" }}>
                {portalInviteError}
              </div>
            )}
            {portalInviteResult && (
              <div
                style={{
                  margin: "12px 18px 0",
                  padding: "12px 14px",
                  borderRadius: "var(--pp-radius-sm)",
                  border: "1px solid rgba(76,175,125,0.2)",
                  background: "rgba(76,175,125,0.08)",
                  display: "grid",
                  gap: 6,
                  fontSize: 12.5,
                }}
              >
                <div style={{ color: "var(--pp-green)", fontWeight: 600 }}>
                  Portal invite prepared for {portalInviteResult.email}
                </div>
                <div style={{ color: "var(--pp-text-2)" }}>
                  Access URL: <a href={portalInviteResult.portal_url} target="_blank" rel="noreferrer" style={{ color: "var(--pp-gold)" }}>{portalInviteResult.portal_url}</a>
                </div>
                {portalInviteResult.setup_url && (
                  <div style={{ color: "var(--pp-text-2)", wordBreak: "break-all" }}>
                    Password setup link: <a href={portalInviteResult.setup_url} target="_blank" rel="noreferrer">{portalInviteResult.setup_url}</a>
                  </div>
                )}
                <div style={{ color: "var(--pp-text-3)", fontSize: 11.5 }}>
                  {portalInviteResult.delivery_status === "email_sent"
                    ? "Invitation email was sent successfully."
                    : "The email was not delivered, so share this link with the client. It works once and expires in 48 hours."}
                </div>
              </div>
            )}
            <ClientEnquiries clientId={id} />
            {client.portal_account ? (
              <>
                <DetailField label="Status" value={client.portal_account.is_active ? "Active" : "Inactive"} green={client.portal_account.is_active} />
                <DetailField label="Portal email" value={client.portal_account.email} />
                <DetailField label="Last login" value={client.portal_account.last_login_at ? timeAgo(client.portal_account.last_login_at) : "Never"} />
              </>
            ) : (
              <div style={{ padding: "12px 18px" }}>
                <p style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 10 }}>
                  This client does not have portal access yet. Send an invite so they can view bookings, invoices, and contracts without manual follow-up.
                </p>
                <button className="pp-btn pp-btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12 }} onClick={handlePortalInvite} disabled={inviting}>
                  {inviting ? "Sending invite..." : "Send Portal Invite"}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function BookingRow({ booking }: { booking: ClientBookingSummary }) {
  return (
    <tr className="pp-tr-clickable">
      <td>
        <Link href={`/bookings/${booking.id}`} style={{ textDecoration: "none" }}>
          <span className="pp-ref">{booking.reference}</span>
        </Link>
      </td>
      <td style={{ color: "var(--pp-text-2)" }}>{booking.event_type ?? titleCase(booking.service_type)}</td>
      <td style={{ color: "var(--pp-text-2)", whiteSpace: "nowrap" }}>{formatDate(booking.event_date, "short")}</td>
      <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{formatCurrency(booking.total_amount, { showEmpty: true })}</td>
      <td>
        <span className={`pp-badge ${BOOKING_STATUS_BADGE[booking.status] ?? "pp-badge-neutral"}`}>{titleCase(booking.status)}</span>
      </td>
    </tr>
  );
}

function InvoiceRow({ invoice }: { invoice: ClientInvoiceSummary }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 18px", borderBottom: "1px solid var(--pp-border)", fontSize: 12.5 }}>
      <Link href={`/invoices/${invoice.id}`} style={{ textDecoration: "none" }}>
        <span style={{ color: "var(--pp-text-3)", fontFamily: "var(--pp-font-display)", fontSize: 11 }}>{invoice.reference}</span>
      </Link>
      <span style={{ color: Number(invoice.amount_due) > 0 ? "var(--pp-gold)" : "var(--pp-green)", fontWeight: 500 }}>
        {Number(invoice.amount_due) > 0 ? `${formatCurrency(invoice.amount_due)} due` : "Paid"}
      </span>
    </div>
  );
}

function TimelineItem({ interaction, showLine }: { interaction: Interaction; showLine: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 18px", borderBottom: showLine ? "1px solid var(--pp-border)" : "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: CHANNEL_COLORS[interaction.channel] ?? "var(--pp-text-3)", marginTop: 4, flexShrink: 0 }} />
        {showLine && <div style={{ width: 1, flex: 1, background: "var(--pp-border)", marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--pp-text-3)", textTransform: "capitalize", marginBottom: 2 }}>
          {titleCase(interaction.channel)} - {titleCase(interaction.direction)}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--pp-text-2)" }}>{interaction.summary}</p>
        <div style={{ fontSize: 10.5, color: "var(--pp-text-3)", marginTop: 2 }}>{timeAgo(interaction.created_at ?? interaction.interacted_at)}</div>
      </div>
    </div>
  );
}

function StatMini({ label, value, detail, gold }: { label: string; value: string; detail?: string; gold?: boolean }) {
  return (
    <div className={cn("pp-client-stat-card", gold && "pp-client-stat-card--gold")}>
      <div className="pp-client-stat-value">{value}</div>
      <div className="pp-client-stat-label">{label}</div>
      {detail && <div className="pp-client-stat-detail">{detail}</div>}
    </div>
  );
}

function DetailField({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 18px", fontSize: 12.5, borderBottom: "1px solid var(--pp-border)" }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ fontSize: 12, color: green ? "var(--pp-green)" : "var(--pp-text)", fontWeight: green ? 500 : undefined }}>{value}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="pp-skeleton" style={{ height: 100, borderRadius: "var(--pp-radius)" }} />
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="pp-card pp-empty">
      <div className="pp-empty-icon">Client</div>
      <div className="pp-empty-title">Client not found</div>
      <p className="pp-empty-sub">{error ?? "This client does not exist or was removed."}</p>
      <Link href="/clients" className="pp-btn pp-btn-ghost" style={{ marginTop: 12 }}>
        Back to clients
      </Link>
    </div>
  );
}

function ClientEnquiries({ clientId }: { clientId: string }) {
  const [enquiries, setEnquiries] = useState<{ id: string; subject: string; message: string; status: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/api").then(({ default: api }) =>
      api
        .get(`/portal/staff/inquiries?client_id=${clientId}`)
        .then(({ data }) => { if (!cancelled) setEnquiries(data); })
        .catch(() => undefined)
    );
    return () => { cancelled = true; };
  }, [clientId]);

  if (enquiries.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
      <strong>Portal enquiries</strong>
      {enquiries.map((enquiry) => (
        <div key={enquiry.id}>
          <div style={{ color: "var(--pp-text)" }}>{enquiry.subject}</div>
          <div style={{ color: "var(--pp-text-2)" }}>{enquiry.message}</div>
        </div>
      ))}
    </div>
  );
}
