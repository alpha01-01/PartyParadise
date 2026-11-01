"use client";
import { useState } from "react";
import Link from "next/link";
import { useExpenses, useExpenseCategories } from "@/hooks";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import api, { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";

// ─── Edit expense modal ──────────────────────────────────────────────

function EditExpenseModal({ categories, expense, onClose, onSaved }: {
  categories: any[];
  expense: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ExpenseForm>({
    description:    expense.description || "",
    category_id:    expense.category_id || expense.category?.id || categories[0]?.id || "",
    amount:         String(expense.amount ?? ""),
    payment_method: expense.payment_method || "momo_mtn",
    expense_date:   expense.expense_date?.slice(0, 10) || new Date().toISOString().split("T")[0],
    booking_ref:    expense.booking_id || "",
    notes:          expense.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function set(field: keyof ExpenseForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) {
      setError("Description and amount are required");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    const bookingId = normaliseBookingId(form.booking_ref);
    if (bookingId === "__invalid__") {
      setError("Linked booking must be a valid booking ID");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.patch(`/accounting/expenses/${expense.id}`, {
        category_id:    form.category_id,
        description:    form.description,
        amount,
        payment_method: form.payment_method,
        expense_date:   form.expense_date,
        booking_id:     bookingId,
        notes:          form.notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">Edit Expense</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}

            <div className="pp-field">
              <label className="pp-field-label">Description <span className="pp-required">*</span></label>
              <input className="pp-input" placeholder="What was this expense for?" value={form.description} onChange={(e) => set("description", e.target.value)} autoFocus />
            </div>

            <div className="pp-row-2">
              <div className="pp-field">
                <label className="pp-field-label">Category <span className="pp-required">*</span></label>
                <select className="pp-input" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Amount (GHS) <span className="pp-required">*</span></label>
                <input className="pp-input" type="number" placeholder="0.00" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
            </div>

            <div className="pp-row-2">
              <div className="pp-field">
                <label className="pp-field-label">Payment method <span className="pp-required">*</span></label>
                <select className="pp-input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Date <span className="pp-required">*</span></label>
                <input className="pp-input" type="date" value={form.expense_date} max={new Date().toISOString().split("T")[0]} onChange={(e) => set("expense_date", e.target.value)} />
              </div>
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Linked booking (optional)</label>
              <input className="pp-input" placeholder="Paste booking ID to attribute this expense to an event" value={form.booking_ref} onChange={(e) => set("booking_ref", e.target.value)} />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Notes (optional)</label>
              <textarea className="pp-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ resize: "none" }} />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Receipt (optional)</label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: "1.5px dashed var(--pp-border2)", borderRadius: "var(--pp-radius-sm)", cursor: "pointer", fontSize: 12.5, color: receiptFile ? "var(--pp-green)" : "var(--pp-text-3)" }}>
                <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                {receiptFile ? `✓ ${receiptFile.name}` : "📎 Attach receipt photo or PDF"}
              </label>
            </div>
          </div>

          <div className="pp-modal-footer">
            <button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}>
              {saving && <span className="pp-spinner" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────
interface ExpenseForm {
  description:    string;
  category_id:    string;
  amount:         string;
  payment_method: string;
  expense_date:   string;
  booking_ref:    string;
  notes:          string;
}

function normaliseBookingId(value: string): string | undefined | "__invalid__" {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : "__invalid__";
}

const PAYMENT_METHODS = [
  { value: "momo_mtn",        label: "MTN MoMo" },
  { value: "momo_vodafone",   label: "Vodafone Cash" },
  { value: "momo_airteltigo", label: "AirtelTigo" },
  { value: "bank_transfer",   label: "Bank Transfer" },
  { value: "cash",            label: "Cash" },
  { value: "paystack",        label: "Paystack" },
];

// ─── Page ─────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState("all");
  const [showModal, setShowModal]   = useState(false);
  const [editExpense, setEditExpense] = useState<any | null>(null);

  // Real hooks
  const {
    expenses,
    total,
    loading,
    error,
    updateFilters,
    refresh,
  } = useExpenses({ page_size: 50 });

  const { categories } = useExpenseCategories();

  // Month stats derived from current page of data
  const thisMonth     = new Date().toISOString().slice(0, 7);
  const monthlyTotal  = expenses
    .filter((e: any) => e.expense_date?.startsWith(thisMonth))
    .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
  const bookingLinked = expenses.filter((e: any) => e.booking_id).length;

  // Client-side instant filter while debounce fires
  const filtered = expenses.filter((e: any) => {
    const matchCat = catFilter === "all" || e.category?.name === catFilter || e.category_id === catFilter;
    const matchQ   = !search ||
      (e.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.reference   ?? "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const filteredTotal = filtered.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

  function handleSearchChange(val: string) {
    setSearch(val);
    clearTimeout((window as any).__expSearchTimeout);
    (window as any).__expSearchTimeout = setTimeout(
      () => updateFilters({ search: val || undefined }),
      350
    );
  }

  function handleExport() {
    downloadCsv("expenses.csv", filtered.map((expense: any) => ({
      Reference: expense.reference ?? "",
      Description: expense.description ?? "",
      Category: expense.category?.name ?? "",
      Amount: expense.amount ?? 0,
      PaymentMethod: expense.payment_method ?? "",
      ExpenseDate: expense.expense_date ?? "",
      BookingId: expense.booking_id ?? "",
    })));
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Cost Control</span>
          <h1 className="pp-page-title">Expenses</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Capture spend quickly, keep categories tidy, and make event-linked costs visible before margin disappears.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{total} recorded expenses</span>
            <span>{formatCurrency(monthlyTotal)} this month</span>
            <span>{bookingLinked} linked directly to bookings</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
          <button className="pp-btn pp-btn-primary" onClick={() => setShowModal(true)}>
            <PlusIcon /> Add Expense
          </button>
        </div>
      </section>

      <div className="pp-ops-summary-grid" style={{ marginBottom: 18 }}>
        <StatMini label="This Month" value={formatCurrency(monthlyTotal)} sub={`Across ${total} total records`} tone="gold" />
        <StatMini label="Largest Category" value={categories[0]?.name ?? "-"} sub="Current top spending lane" />
        <StatMini label="Booking-Linked" value={`${bookingLinked} of ${expenses.length}`} sub="Direct event costs" tone="green" />
        <StatMini label="Filtered Total" value={formatCurrency(filteredTotal)} sub="Current table view total" />
      </div>

      <div className="pp-toolbar-note">
        <span>Use booking-linked expenses for tighter profitability reporting and cleaner event reconciliation.</span>
        <span>Export downloads the currently filtered expense list as CSV.</span>
      </div>

      {/* Filter bar */}
      <div className="pp-filter-bar">
        <div className="pp-search-wrap">
          <SearchIcon />
          <input
            className="pp-search-input"
            placeholder="Search by description, reference, or supplier note"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <select
          className="pp-period-select"
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            updateFilters({ category_id: e.target.value !== "all" ? e.target.value : undefined });
          }}
        >
          <option value="all">All categories</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      {/* Table */}
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pp-skeleton" style={{ height: 50, margin: "1px 0" }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="pp-empty" style={{ padding: "40px" }}>
            <div className="pp-empty-icon">💸</div>
            <div className="pp-empty-title">No expenses found</div>
            <p className="pp-empty-sub">Add your first expense or adjust the filters</p>
          </div>
        ) : (
          <>
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Booking</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => {
                  const catColor = e.category?.color;
                  const methodLabel = PAYMENT_METHODS.find((m) => m.value === e.payment_method)?.label || e.payment_method;
                  const onEdit = () => setEditExpense(e);
                  const onDelete = () => {
                    if (window.confirm("Delete this expense? This cannot be undone.")) {
                      api.delete(`/accounting/expenses/${e.id}`)
                        .then(() => refresh())
                        .catch((err) => alert(normaliseError(err).message));
                    }
                  };
                  return (
                    <tr className="pp-tr-clickable" key={e.id}>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pp-text)" }}>{e.description}</div>
                        <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{e.reference}</div>
                      </td>
                      <td>
                        {e.category && (
                          <span
                            className="pp-service-pill"
                            style={{
                              background:   catColor ? `${catColor}18` : undefined,
                              color:        catColor ?? undefined,
                              borderColor:  catColor ? `${catColor}30` : undefined,
                            }}
                          >
                            {e.category.name}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--pp-text)" }}>{formatCurrency(e.amount)}</td>
                      <td style={{ color: "var(--pp-text-2)" }}>{methodLabel}</td>
                      <td style={{ color: "var(--pp-text-2)", whiteSpace: "nowrap" }}>
                        {formatDate(e.expense_date, "short")}
                      </td>
                      <td style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>
                        {e.booking_id ? (
                          <Link href={`/bookings/${e.booking_id}`} style={{ color: "var(--pp-text-2)", textDecoration: "none" }}>
                            View →
                          </Link>
                        ) : "—"}
                      </td>
                      <td>
                        <div className="pp-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="pp-row-btn" title="Edit" onClick={onEdit}><EditIcon /></button>
                          {e.receipt_url && (
                            <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" className="pp-row-btn" title="Receipt">
                              <ReceiptIcon />
                            </a>
                          )}
                          <button className="pp-row-btn pp-row-btn--danger" title="Delete" onClick={onDelete}>
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pp-pagination">
              <span>
                Showing {filtered.length} expenses &nbsp;·&nbsp;
                Total:{" "}
                <strong style={{ color: "var(--pp-text)" }}>
                  {formatCurrency(filteredTotal)}
                </strong>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Add expense modal */}
      {showModal && (
        <AddExpenseModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); refresh(); }}
        />
      )}
      {/* Edit expense modal */}
      {editExpense && (
        <EditExpenseModal
          categories={categories}
          expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSaved={() => { setEditExpense(null); refresh(); }}
        />
      )}
    </>
  );
}

// ─── Add expense modal ────────────────────────────────────────
function AddExpenseModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ExpenseForm>({
    description:    "",
    category_id:    categories[0]?.id ?? "",
    amount:         "",
    payment_method: "momo_mtn",
    expense_date:   new Date().toISOString().split("T")[0],
    booking_ref:    "",
    notes:          "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  function set(field: keyof ExpenseForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) {
      setError("Description and amount are required");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    const bookingId = normaliseBookingId(form.booking_ref);
    if (bookingId === "__invalid__") {
      setError("Linked booking must be a valid booking ID");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/accounting/expenses", {
        category_id:    form.category_id,
        description:    form.description,
        amount,
        payment_method: form.payment_method,
        expense_date:   form.expense_date,
        booking_id:     bookingId,
        notes:          form.notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">Add Expense</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}

            <div className="pp-field">
              <label className="pp-field-label">Description <span className="pp-required">*</span></label>
              <input className="pp-input" placeholder="What was this expense for?" value={form.description} onChange={(e) => set("description", e.target.value)} autoFocus />
            </div>

            <div className="pp-row-2">
              <div className="pp-field">
                <label className="pp-field-label">Category <span className="pp-required">*</span></label>
                <select className="pp-input" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Amount (GHS) <span className="pp-required">*</span></label>
                <input className="pp-input" type="number" placeholder="0.00" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </div>
            </div>

            <div className="pp-row-2">
              <div className="pp-field">
                <label className="pp-field-label">Payment method <span className="pp-required">*</span></label>
                <select className="pp-input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="pp-field">
                <label className="pp-field-label">Date <span className="pp-required">*</span></label>
                <input className="pp-input" type="date" value={form.expense_date} max={new Date().toISOString().split("T")[0]} onChange={(e) => set("expense_date", e.target.value)} />
              </div>
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Linked booking (optional)</label>
              <input className="pp-input" placeholder="Paste booking ID to attribute this expense to an event" value={form.booking_ref} onChange={(e) => set("booking_ref", e.target.value)} />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Notes (optional)</label>
              <textarea className="pp-input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ resize: "none" }} />
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Receipt (optional)</label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", border: "1.5px dashed var(--pp-border2)", borderRadius: "var(--pp-radius-sm)", cursor: "pointer", fontSize: 12.5, color: receiptFile ? "var(--pp-green)" : "var(--pp-text-3)" }}>
                <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                {receiptFile ? `✓ ${receiptFile.name}` : "📎 Attach receipt photo or PDF"}
              </label>
            </div>
          </div>

          <div className="pp-modal-footer">
            <button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}>
              {saving && <span className="pp-spinner" />}
              <span>Save Expense</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────
function StatMini({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "gold" | "green" }) {
  return (
    <div className={cn("pp-ops-summary-card", tone && `pp-ops-summary-card--${tone}`)}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value" style={{ fontSize: 22 }}>{value}</div>
      <div className="pp-ops-summary-detail">{sub}</div>
    </div>
  );
}

const PlusIcon    = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const SearchIcon  = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const EditIcon    = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const ReceiptIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 1v12l2-1.4 2 1.4 2-1.4 2 1.4 1.5-12H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const TrashIcon   = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3.5 3.5l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const CloseIcon   = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;

