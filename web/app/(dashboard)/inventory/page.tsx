"use client";

import { useMemo, useState } from "react";
import { useInventoryItems, createInventoryTransaction } from "@/hooks";
import { formatCurrency, cn } from "@/lib/utils";
import { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import type { InventoryItem } from "@/lib/types";

type TxnType = "purchase" | "usage" | "adjustment" | "damage" | "return";
interface TxnForm { type: TxnType; quantity: string; reason: string; booking_ref: string; }

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [txnTarget, setTxnTarget] = useState<InventoryItem | null>(null);

  const { items, loading, error } = useInventoryItems({
    category: category === "all" ? undefined : category,
    low_stock: lowOnly || undefined,
    search: search || undefined,
  });

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))), [items]);
  const lowCount = items.filter((item) => item.quantity_in_stock <= item.reorder_level).length;
  const totalValue = items.reduce((sum, item) => sum + item.quantity_in_stock * (item.unit_cost ?? 0), 0);
  const activeLocations = new Set(items.map((item) => item.location).filter(Boolean)).size;

  function openTxnModal(item: InventoryItem) {
    setTxnTarget(item);
    setShowModal(true);
  }

  function handleExport() {
    downloadCsv("inventory.csv", items.map((item) => ({
      Name: item.name,
      SKU: item.sku ?? "",
      Category: item.category,
      InStock: item.quantity_in_stock,
      ReorderLevel: item.reorder_level,
      Unit: item.unit,
      UnitCost: item.unit_cost ?? "",
      UnitPrice: item.unit_price ?? "",
      Location: item.location ?? "",
    })));
  }

  return (
    <div style={{ display: "flex", overflow: "hidden", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
        <section className="pp-ops-hero">
          <div className="pp-ops-hero-copy">
            <span className="pp-ops-kicker">Warehouse Control</span>
            <h1 className="pp-page-title">Inventory</h1>
            <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
              Track consumables, spot low stock earlier, and keep event operations from being surprised on setup day.
            </p>
            <div className="pp-ops-hero-meta">
              <span>{items.length} stock records</span>
              <span>{lowCount} low stock items</span>
              <span>{activeLocations} active storage points</span>
            </div>
          </div>
          <div className="pp-ops-hero-actions">
            <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
            <button className="pp-btn pp-btn-primary" onClick={() => { setTxnTarget(null); setShowModal(true); }}>Add Item</button>
          </div>
        </section>

        <div className="pp-ops-summary-grid">
          <SummaryCard label="Tracked Items" value={String(items.length)} detail="Inventory lines currently visible in your warehouse workspace" />
          <SummaryCard label="Low Stock" value={String(lowCount)} detail="Items that need replenishment before they become a job risk" tone={lowCount > 0 ? "gold" : undefined} />
          <SummaryCard label="Stock Value" value={formatCurrency(totalValue, { compact: true, showEmpty: true })} detail="Working value of inventory at cost price" tone="green" />
          <SummaryCard label="Categories" value={String(categories.length)} detail="Active stock groupings across decor and booth operations" />
        </div>

        <div className="pp-filter-bar">
          <div className="pp-search-wrap">
            <SearchIcon />
            <input className="pp-search-input" placeholder="Search items, SKU, or stock location" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <select className="pp-period-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <div className="pp-filter-tabs">
            <button className={cn("pp-filter-tab", !lowOnly && "pp-filter-tab--active")} onClick={() => setLowOnly(false)}>All</button>
            <button className={cn("pp-filter-tab", lowOnly && "pp-filter-tab--active")} onClick={() => setLowOnly(true)}>Low Stock</button>
          </div>
        </div>

        <div className="pp-toolbar-note">
          <span>Use this page to manage consumables and event-use stock, not long-term equipment assets.</span>
          <span>Adjust stock directly from the row or detail panel whenever items are purchased, used, damaged, or returned.</span>
        </div>

        {error && <div className="pp-alert pp-alert-error">{error}</div>}

        <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 54, margin: "1px 0" }} />)
          ) : (
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Stock Level</th>
                  <th>Unit Cost</th>
                  <th>Unit Price</th>
                  <th>Location</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <InventoryRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelected((current) => current?.id === item.id ? null : item)} onAdjust={() => openTxnModal(item)} />
                ))}
              </tbody>
            </table>
          )}
          <div className="pp-pagination"><span>{items.length} visible items</span></div>
        </div>
      </div>

      {selected && <ItemDetailPanel item={selected} onClose={() => setSelected(null)} onAdjust={() => openTxnModal(selected)} />}
      {showModal && <StockTransactionModal item={txnTarget} onClose={() => setShowModal(false)} onSaved={() => setShowModal(false)} />}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "gold" | "green" }) {
  return (
    <div className={tone ? `pp-ops-summary-card pp-ops-summary-card--${tone}` : "pp-ops-summary-card"}>
      <div className="pp-ops-summary-label">{label}</div>
      <div className="pp-ops-summary-value">{value}</div>
      <div className="pp-ops-summary-detail">{detail}</div>
    </div>
  );
}

function InventoryRow({ item, selected, onSelect, onAdjust }: { item: InventoryItem; selected: boolean; onSelect: () => void; onAdjust: () => void; }) {
  const pct = Math.min(100, Math.round((item.quantity_in_stock / Math.max(item.reorder_level * 2, 1)) * 100));
  const isCritical = item.quantity_in_stock <= item.reorder_level * 0.3;
  const isWarning = item.quantity_in_stock <= item.reorder_level && !isCritical;
  const barColor = isCritical ? "var(--pp-red)" : isWarning ? "var(--pp-gold)" : "var(--pp-green)";
  const qtyColor = isCritical ? "var(--pp-red)" : isWarning ? "var(--pp-gold)" : "var(--pp-text)";

  return (
    <tr className={cn("pp-tr-clickable", selected && "pp-tr-selected")} onClick={onSelect}>
      <td>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pp-text)" }}>{item.name}</div>
        <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{item.sku ?? "No SKU"}</div>
      </td>
      <td style={{ color: "var(--pp-text-2)" }}>{item.category}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: qtyColor, minWidth: 28 }}>{item.quantity_in_stock}</span>
          <div>
            <div style={{ width: 60, height: 5, background: "var(--pp-surface3, #232019)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 9.5, color: "var(--pp-text-3)", marginTop: 2 }}>min {item.reorder_level} {item.unit}</div>
          </div>
        </div>
      </td>
      <td style={{ color: "var(--pp-text-2)" }}>{formatCurrency(item.unit_cost, { showEmpty: true })}</td>
      <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{formatCurrency(item.unit_price, { showEmpty: true })}</td>
      <td style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>{item.location ?? "-"}</td>
      <td>
        <div className="pp-row-actions" onClick={(event) => event.stopPropagation()}>
          <button className="pp-row-btn" title="Adjust stock" style={{ color: "var(--pp-gold)" }} onClick={onAdjust}><AdjustIcon /></button>
          <button className="pp-row-btn" title="Edit item"><EditIcon /></button>
        </div>
      </td>
    </tr>
  );
}

function ItemDetailPanel({ item, onClose, onAdjust }: { item: InventoryItem; onClose: () => void; onAdjust: () => void; }) {
  const isCritical = item.quantity_in_stock <= item.reorder_level * 0.3;
  const isWarning = item.quantity_in_stock <= item.reorder_level && !isCritical;
  const qtyColor = isCritical ? "var(--pp-red)" : isWarning ? "var(--pp-gold)" : "var(--pp-text)";

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <div style={{ fontSize: 10, color: "var(--pp-text-3)", marginBottom: 4 }}>{item.sku ?? "No SKU"}</div>
        <h2 className="pp-dp-name" style={{ fontSize: 15 }}>{item.name}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <div style={{ fontFamily: "var(--pp-font-display)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.04em", color: qtyColor, lineHeight: 1 }}>{item.quantity_in_stock}</div>
          <div style={{ fontSize: 12, color: "var(--pp-text-3)" }}>{item.unit}s in stock<div style={{ fontSize: 11, marginTop: 2 }}>minimum {item.reorder_level} {item.unit}s</div></div>
        </div>
        {isCritical && <div style={{ marginTop: 10, padding: "7px 10px", background: "rgba(224,90,74,0.08)", border: "1px solid rgba(224,90,74,0.2)", borderRadius: "var(--pp-radius-sm)", fontSize: 11.5, color: "var(--pp-red)" }}>Below minimum - reorder now</div>}
        <div className="pp-dp-actions" style={{ marginTop: 12 }}><button className="pp-btn pp-btn-primary" style={{ fontSize: 12 }} onClick={onAdjust}>Adjust Stock</button></div>
      </div>
      <div className="pp-dp-body">
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Stock Details</span></div>
          <DpField label="Category" value={item.category} />
          <DpField label="Unit" value={item.unit} />
          <DpField label="Reorder level" value={`${item.reorder_level} ${item.unit}s`} />
          <DpField label="Unit cost" value={formatCurrency(item.unit_cost, { showEmpty: true })} />
          <DpField label="Unit price" value={formatCurrency(item.unit_price, { showEmpty: true })} />
          <DpField label="Location" value={item.location ?? "-"} />
          <DpField label="Stock value" value={formatCurrency((item.quantity_in_stock ?? 0) * (item.unit_cost ?? 0), { showEmpty: true })} gold />
        </div>
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Transaction History</span></div>
          <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>No transactions recorded yet.</p>
        </div>
      </div>
    </div>
  );
}

function StockTransactionModal({ item, onClose, onSaved }: { item: InventoryItem | null; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState<TxnForm>({ type: "purchase", quantity: "", reason: "", booking_ref: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(field: keyof TxnForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.quantity || !item) { setError("Quantity is required"); return; }
    const qty = parseInt(form.quantity, 10);
    if (Number.isNaN(qty) || qty <= 0) { setError("Enter a valid quantity"); return; }

    setSaving(true);
    try {
      const outflows: TxnType[] = ["usage", "damage", "adjustment"];
      const signedQty = outflows.includes(form.type) ? -qty : qty;
      await createInventoryTransaction({ item_id: item.id, type: form.type, quantity: signedQty, reason: form.reason || undefined, booking_id: undefined });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">{item ? `Adjust ${item.name}` : "Add Inventory Item"}</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            {item && <div style={{ padding: "10px 14px", background: "var(--pp-surface2)", border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", fontSize: 12, marginBottom: 4, display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--pp-text-2)" }}>Current stock</span><span style={{ fontWeight: 600, color: "var(--pp-text)" }}>{item.quantity_in_stock} {item.unit}s</span></div>}
            <div className="pp-field"><label className="pp-field-label">Transaction type <span className="pp-required">*</span></label><select className="pp-input" value={form.type} onChange={(event) => setField("type", event.target.value)}><option value="purchase">Purchase - stock in</option><option value="usage">Usage - event consumption</option><option value="adjustment">Adjustment - stocktake correction</option><option value="damage">Damage - written off</option><option value="return">Return - back into stock</option></select></div>
            <div className="pp-field"><label className="pp-field-label">Quantity <span className="pp-required">*</span></label><input className="pp-input" type="number" min="1" placeholder="How many units?" value={form.quantity} onChange={(event) => setField("quantity", event.target.value)} autoFocus /></div>
            <div className="pp-field"><label className="pp-field-label">Reason / notes</label><input className="pp-input" placeholder="Brief reason" value={form.reason} onChange={(event) => setField("reason", event.target.value)} /></div>
            <div className="pp-field"><label className="pp-field-label">Linked booking (optional)</label><input className="pp-input" placeholder="e.g. BK-2026-0048" value={form.booking_ref} onChange={(event) => setField("booking_ref", event.target.value)} /></div>
          </div>
          <div className="pp-modal-footer">
            <button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Recording..." : "Record Transaction"}</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DpField({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 18px", fontSize: 12.5 }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ color: gold ? "var(--pp-gold)" : "var(--pp-text)", fontSize: 12, fontWeight: gold ? 600 : undefined }}>{value}</span>
    </div>
  );
}

const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const AdjustIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const EditIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
