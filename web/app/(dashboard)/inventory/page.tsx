"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  createInventoryTransaction,
  listInventoryTransactions,
  importInventoryItems,
} from "@/hooks";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import type { InventoryImportResult, InventoryItem, InventoryTransaction } from "@/lib/types";

type TxnType = "purchase" | "usage" | "adjustment" | "damage" | "return";
type ItemForm = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  reorder_level: string;
  initial_quantity: string;
  unit_cost: string;
  unit_price: string;
  location: string;
};
type TxnForm = { type: TxnType; quantity: string; reason: string; booking_id: string };

const TXN_LABELS: Record<TxnType, string> = {
  purchase: "Purchase",
  usage: "Usage",
  adjustment: "Adjustment",
  damage: "Damage",
  return: "Return",
};

const TXN_HELPERS: Record<TxnType, string> = {
  purchase: "Use when new stock arrives from a supplier.",
  usage: "Use when items are consumed on a booking or internal job.",
  adjustment: "Use for stock count corrections. Enter a negative number to reduce stock.",
  damage: "Use when stock is lost, broken, or written off.",
  return: "Use when previously issued stock comes back into inventory.",
};

function blankItemForm(): ItemForm {
  return {
    name: "",
    sku: "",
    category: "",
    unit: "",
    reorder_level: "0",
    initial_quantity: "0",
    unit_cost: "",
    unit_price: "",
    location: "",
  };
}

function itemToForm(item: InventoryItem): ItemForm {
  return {
    name: item.name,
    sku: item.sku ?? "",
    category: item.category,
    unit: item.unit,
    reorder_level: String(item.reorder_level ?? 0),
    initial_quantity: "0",
    unit_cost: item.unit_cost != null ? String(item.unit_cost) : "",
    unit_price: item.unit_price != null ? String(item.unit_price) : "",
    location: item.location ?? "",
  };
}

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`${field} must be 0 or greater`);
  return parsed;
}

function parseOptionalNumber(value: string, field: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`${field} must be 0 or greater`);
  return parsed;
}

function normaliseUuid(value: string): string | undefined | "__invalid__" {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : "__invalid__";
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [itemModalMode, setItemModalMode] = useState<"create" | "edit" | null>(null);
  const [txnTarget, setTxnTarget] = useState<InventoryItem | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const { items, loading, error, refresh } = useInventoryItems({
    category: category === "all" ? undefined : category,
    low_stock: lowOnly || undefined,
    search: search || undefined,
  });

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))).sort(), [items]);
  const lowCount = items.filter((item) => item.quantity_in_stock <= item.reorder_level).length;
  const totalValue = items.reduce((sum, item) => sum + item.quantity_in_stock * (item.unit_cost ?? 0), 0);
  const activeLocations = new Set(items.map((item) => item.location).filter(Boolean)).size;

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
            <button className="pp-btn pp-btn-ghost" onClick={() => setShowImportModal(true)}>Import File</button>
            <button className="pp-btn pp-btn-primary" onClick={() => setItemModalMode("create")}>Add Item</button>
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
          <span>Add or edit an item to define what you stock. Record a transaction whenever stock physically moves in or out.</span>
          <span>Use purchase/return for stock in, usage/damage for stock out, and adjustment for stocktake corrections in either direction.</span>
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
                  <InventoryRow
                    key={item.id}
                    item={item}
                    selected={selected?.id === item.id}
                    onSelect={() => setSelected((current) => current?.id === item.id ? null : item)}
                    onAdjust={() => setTxnTarget(item)}
                    onEdit={() => {
                      setSelected(item);
                      setItemModalMode("edit");
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
          <div className="pp-pagination"><span>{items.length} visible items</span></div>
        </div>
      </div>

      {selected && <ItemDetailPanel item={selected} onClose={() => setSelected(null)} onAdjust={() => setTxnTarget(selected)} onEdit={() => setItemModalMode("edit")} />}
      {itemModalMode && (
        <InventoryItemModal
          mode={itemModalMode}
          item={itemModalMode === "edit" ? selected : null}
          onClose={() => setItemModalMode(null)}
          onSaved={(item) => {
            setItemModalMode(null);
            setSelected(item);
            void refresh();
          }}
        />
      )}
      {txnTarget && (
        <StockTransactionModal
          item={txnTarget}
          onClose={() => setTxnTarget(null)}
          onSaved={() => {
            setSelected(txnTarget);
            setTxnTarget(null);
            void refresh();
          }}
        />
      )}
      {showImportModal && (
        <InventoryImportModal
          onClose={() => setShowImportModal(false)}
          onSaved={() => {
            setSelected(null);
            void refresh();
          }}
        />
      )}
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

function InventoryRow({
  item,
  selected,
  onSelect,
  onAdjust,
  onEdit,
}: {
  item: InventoryItem;
  selected: boolean;
  onSelect: () => void;
  onAdjust: () => void;
  onEdit: () => void;
}) {
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
          <button className="pp-row-btn" title="Edit item" onClick={onEdit}><EditIcon /></button>
        </div>
      </td>
    </tr>
  );
}

function ItemDetailPanel({
  item,
  onClose,
  onAdjust,
  onEdit,
}: {
  item: InventoryItem;
  onClose: () => void;
  onAdjust: () => void;
  onEdit: () => void;
}) {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listInventoryTransactions(item.id)
      .then((data) => {
        if (!cancelled) setTransactions(data);
      })
      .catch((err) => {
        if (!cancelled) setError(normaliseError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

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
        <div className="pp-dp-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="pp-btn pp-btn-primary" style={{ fontSize: 12 }} onClick={onAdjust}>Record Stock Movement</button>
          <button className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Edit Item</button>
        </div>
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
          {loading ? (
            <div className="pp-skeleton" style={{ height: 60, margin: "12px 18px" }} />
          ) : error ? (
            <div className="pp-alert pp-alert-error" style={{ margin: "12px 18px" }}>{error}</div>
          ) : transactions.length === 0 ? (
            <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>No transactions recorded yet.</p>
          ) : (
            transactions.slice(0, 8).map((txn) => (
              <div key={txn.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 18px", borderTop: "1px solid var(--pp-border)", fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--pp-text)", fontWeight: 500 }}>
                    {TXN_LABELS[txn.type as TxnType] ?? txn.type}
                    {txn.booking_id ? " · linked booking" : ""}
                  </div>
                  <div style={{ color: "var(--pp-text-3)", marginTop: 2 }}>{txn.reason ?? "No note added"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: txn.quantity < 0 ? "var(--pp-red)" : "var(--pp-green)", fontWeight: 600 }}>
                    {txn.quantity > 0 ? "+" : ""}{txn.quantity}
                  </div>
                  <div style={{ color: "var(--pp-text-3)", marginTop: 2 }}>{formatDateTime(txn.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryItemModal({
  mode,
  item,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
}) {
  const [form, setForm] = useState<ItemForm>(() => item ? itemToForm(item) : blankItemForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(field: keyof ItemForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.category.trim() || !form.unit.trim()) {
      setError("Name, category, and unit are required");
      return;
    }

    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        category: form.category.trim(),
        unit: form.unit.trim(),
        reorder_level: parsePositiveInt(form.reorder_level, "Reorder level"),
        initial_quantity: mode === "create" ? parsePositiveInt(form.initial_quantity, "Opening stock") : undefined,
        unit_cost: parseOptionalNumber(form.unit_cost, "Unit cost"),
        unit_price: parseOptionalNumber(form.unit_price, "Unit price"),
        location: form.location.trim() || undefined,
      };

      setSaving(true);
      const saved = mode === "create"
        ? await createInventoryItem(payload)
        : await updateInventoryItem(item!.id, {
            name: payload.name,
            sku: payload.sku,
            category: payload.category,
            unit: payload.unit,
            reorder_level: payload.reorder_level,
            unit_cost: payload.unit_cost,
            unit_price: payload.unit_price,
            location: payload.location,
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">{mode === "create" ? "Add Inventory Item" : "Edit Inventory Item"}</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label">Item name <span className="pp-required">*</span></label><input className="pp-input" value={form.name} onChange={(event) => setField("name", event.target.value)} autoFocus /></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label">SKU</label><input className="pp-input" value={form.sku} onChange={(event) => setField("sku", event.target.value)} placeholder="Optional stock code" /></div>
              <div className="pp-field"><label className="pp-field-label">Category <span className="pp-required">*</span></label><input className="pp-input" value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="e.g. Balloons, Drinks, Cleaning" /></div>
            </div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label">Unit <span className="pp-required">*</span></label><input className="pp-input" value={form.unit} onChange={(event) => setField("unit", event.target.value)} placeholder="e.g. pack, bottle, piece" /></div>
              <div className="pp-field"><label className="pp-field-label">Reorder level</label><input className="pp-input" type="number" min="0" value={form.reorder_level} onChange={(event) => setField("reorder_level", event.target.value)} /></div>
            </div>
            {mode === "create" && (
              <div className="pp-field">
                <label className="pp-field-label">Opening stock</label>
                <input className="pp-input" type="number" min="0" value={form.initial_quantity} onChange={(event) => setField("initial_quantity", event.target.value)} />
              </div>
            )}
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label">Unit cost</label><input className="pp-input" type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setField("unit_cost", event.target.value)} /></div>
              <div className="pp-field"><label className="pp-field-label">Unit price</label><input className="pp-input" type="number" min="0" step="0.01" value={form.unit_price} onChange={(event) => setField("unit_price", event.target.value)} /></div>
            </div>
            <div className="pp-field"><label className="pp-field-label">Storage location</label><input className="pp-input" value={form.location} onChange={(event) => setField("location", event.target.value)} placeholder="Shelf, room, or warehouse zone" /></div>
          </div>
          <div className="pp-modal-footer">
            <button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}>
              <span>{saving ? "Saving..." : mode === "create" ? "Create Item" : "Save Changes"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockTransactionModal({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState<TxnForm>({ type: "purchase", quantity: "", reason: "", booking_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(field: keyof TxnForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number.parseInt(form.quantity, 10);
    if (Number.isNaN(qty) || qty === 0 || (qty < 0 && form.type !== "adjustment")) {
      setError(form.type === "adjustment" ? "Enter a quantity other than zero" : "Enter a valid quantity greater than zero");
      return;
    }

    const bookingId = normaliseUuid(form.booking_id);
    if (bookingId === "__invalid__") {
      setError("Linked booking must be a valid booking ID");
      return;
    }

    setSaving(true);
    try {
      await createInventoryTransaction({
        item_id: item.id,
        type: form.type,
        quantity: qty,
        reason: form.reason.trim() || undefined,
        booking_id: bookingId,
      });
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
          <span className="pp-modal-title">Record Stock Movement</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div style={{ padding: "10px 14px", background: "var(--pp-surface2)", border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", fontSize: 12, marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "var(--pp-text-2)" }}>{item.name}</span>
                <span style={{ fontWeight: 600, color: "var(--pp-text)" }}>{item.quantity_in_stock} {item.unit}s in stock</span>
              </div>
            </div>
            <div className="pp-field">
              <label className="pp-field-label">Transaction type <span className="pp-required">*</span></label>
              <select className="pp-input" value={form.type} onChange={(event) => setField("type", event.target.value)}>
                <option value="purchase">Purchase - stock in</option>
                <option value="return">Return - stock back in</option>
                <option value="usage">Usage - event consumption</option>
                <option value="damage">Damage - written off</option>
                <option value="adjustment">Adjustment - stocktake correction</option>
              </select>
              <div style={{ fontSize: 11, color: "var(--pp-text-3)", marginTop: 6 }}>{TXN_HELPERS[form.type]}</div>
            </div>
            <div className="pp-field"><label className="pp-field-label">Quantity <span className="pp-required">*</span></label><input className="pp-input" type="number" {...(form.type === "adjustment" ? {} : { min: "1" })} placeholder="How many units moved?" value={form.quantity} onChange={(event) => setField("quantity", event.target.value)} autoFocus /></div>
            <div className="pp-field"><label className="pp-field-label">Reason / notes</label><input className="pp-input" placeholder="Brief reason for this stock movement" value={form.reason} onChange={(event) => setField("reason", event.target.value)} /></div>
            <div className="pp-field"><label className="pp-field-label">Linked booking (optional)</label><input className="pp-input" placeholder="Paste booking ID when stock was used for an event" value={form.booking_id} onChange={(event) => setField("booking_id", event.target.value)} /></div>
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

function InventoryImportModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (result: InventoryImportResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InventoryImportResult | null>(null);

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV or XLSX file to import");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const imported = await importInventoryItems(file);
      setResult(imported);
      onSaved(imported);
    } catch (err) {
      const apiError = normaliseError(err);
      const detail = apiError.detail as { message?: string; errors?: { row: number; message: string }[] } | null;
      setError(detail?.message ?? apiError.message);
      setResult(detail?.errors ? {
        filename: file.name,
        imported: 0,
        failed: detail.errors.length,
        errors: detail.errors,
        required_columns: ["name", "category", "unit"],
        optional_columns: ["sku", "reorder_level", "initial_quantity", "opening_stock", "unit_cost", "unit_price", "location"],
      } : null);
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pp-modal-header">
          <span className="pp-modal-title">Import Inventory Items</span>
          <button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button>
        </div>
        <form onSubmit={handleImport}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div style={{ padding: "12px 14px", background: "var(--pp-surface2)", border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", fontSize: 12.5, color: "var(--pp-text-2)", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, color: "var(--pp-text)", marginBottom: 6 }}>Accepted columns</div>
              <div>Required: <code>name</code>, <code>category</code>, <code>unit</code></div>
              <div style={{ marginTop: 4 }}>Optional: <code>sku</code>, <code>reorder_level</code>, <code>initial_quantity</code> or <code>opening_stock</code>, <code>unit_cost</code>, <code>unit_price</code>, <code>location</code></div>
              <div style={{ marginTop: 6 }}>Supported formats: <code>.csv</code> and <code>.xlsx</code></div>
            </div>

            <div className="pp-field">
              <label className="pp-field-label">Import file <span className="pp-required">*</span></label>
              <input
                className="pp-input"
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError("");
                  setResult(null);
                }}
              />
              <div style={{ fontSize: 11, color: "var(--pp-text-3)", marginTop: 6 }}>
                {file ? `Selected: ${file.name}` : "Choose an export or onboarding sheet to bulk-create stock items."}
              </div>
            </div>

            {result && (
              <div style={{ marginTop: 16, border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "var(--pp-surface2)", fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--pp-text)" }}>{result.filename}</span>
                  <span style={{ color: "var(--pp-text-2)" }}>{result.imported} imported, {result.failed} failed</span>
                </div>
                {result.errors.length > 0 ? (
                  result.errors.slice(0, 8).map((entry) => (
                    <div key={`${entry.row}-${entry.message}`} style={{ padding: "9px 14px", borderTop: "1px solid var(--pp-border)", fontSize: 12 }}>
                      <strong style={{ color: "var(--pp-text)" }}>Row {entry.row}</strong>
                      <span style={{ color: "var(--pp-text-3)", marginLeft: 8 }}>{entry.message}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--pp-green)" }}>All rows imported successfully.</div>
                )}
              </div>
            )}
          </div>
          <div className="pp-modal-footer">
            <button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}>
              <span>{saving ? "Importing..." : "Import Items"}</span>
            </button>
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
