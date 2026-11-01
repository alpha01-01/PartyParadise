"use client";

import { useMemo, useState } from "react";
import { createShopSale, useInventoryItems, useShopSales } from "@/hooks";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { normaliseError } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";

type CartLine = {
  item: InventoryItem;
  quantity: number;
};

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "momo_mtn", label: "MTN MoMo" },
  { value: "momo_vodafone", label: "Vodafone Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export default function ShopPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const { items, loading, error, refresh } = useInventoryItems({
    category: category === "all" ? undefined : category,
    search: search || undefined,
  });
  const { sales, loading: salesLoading, error: salesError, refresh: refreshSales } = useShopSales();

  const products = useMemo(() => {
    return items.filter((item) => item.is_active !== false && item.quantity_in_stock > 0 && item.unit_price != null);
  }, [items]);

  const categories = useMemo(() => Array.from(new Set(products.map((item) => item.category))).sort(), [products]);
  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((sum, line) => sum + line.quantity, 0);
  const grandTotal = cartItems.reduce((sum, line) => sum + line.quantity * (line.item.unit_price ?? 0), 0);

  function addToCart(item: InventoryItem) {
    setCart((current) => {
      const existing = current[item.id];
      const nextQty = Math.min(item.quantity_in_stock, (existing?.quantity ?? 0) + 1);
      return { ...current, [item.id]: { item, quantity: nextQty } };
    });
    setCheckoutError("");
    setSuccessMessage("");
  }

  function changeQuantity(itemId: string, quantity: number) {
    setCart((current) => {
      const line = current[itemId];
      if (!line) return current;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[itemId];
        return next;
      }
      return {
        ...current,
        [itemId]: {
          ...line,
          quantity: Math.min(line.item.quantity_in_stock, quantity),
        },
      };
    });
  }

  async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cartItems.length === 0) {
      setCheckoutError("Add at least one item to the cart");
      return;
    }

    setSaving(true);
    setCheckoutError("");
    setSuccessMessage("");
    try {
      const sale = await createShopSale({
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        payment_method: paymentMethod,
        paid_at: saleDate || undefined,
        notes: notes.trim() || undefined,
        items: cartItems.map((line) => ({
          item_id: line.item.id,
          quantity: line.quantity,
        })),
      });
      setCart({});
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setPaymentMethod("cash");
      setSaleDate(new Date().toISOString().split("T")[0]);
      setSuccessMessage(`Sale ${sale.reference} recorded for ${formatCurrency(sale.total_amount)}.`);
      await Promise.all([refresh(), refreshSales()]);
    } catch (err) {
      setCheckoutError(normaliseError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Retail Counter</span>
          <h1 className="pp-page-title">Shop</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Sell party items from current warehouse stock, capture payment immediately, and keep a visible trail of recent counter sales.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{products.length} sellable products</span>
            <span>{totalItems} units in current cart</span>
            <span>{formatCurrency(grandTotal, { showEmpty: true })} cart total</span>
          </div>
        </div>
      </section>

      <div className="pp-ops-summary-grid">
        <SummaryCard label="Sellable Items" value={String(products.length)} detail="Inventory lines with stock and a retail price" />
        <SummaryCard label="Cart Quantity" value={String(totalItems)} detail="Units currently queued for checkout" tone="gold" />
        <SummaryCard label="Cart Value" value={formatCurrency(grandTotal, { compact: true, showEmpty: true })} detail="Expected total for the active sale" tone="green" />
        <SummaryCard label="Recent Sales" value={String(sales.length)} detail="Counter sales listed below for quick verification" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.95fr", gap: 18, alignItems: "start" }}>
        <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--pp-border)" }}>
            <div className="pp-filter-bar" style={{ marginBottom: 0 }}>
              <div className="pp-search-wrap">
                <SearchIcon />
                <input className="pp-search-input" aria-label="Search" placeholder="Search party items or SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="pp-period-select" aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          {error && <div className="pp-alert pp-alert-error" style={{ margin: 18 }}>{error}</div>}
          {loading ? (
            <div style={{ padding: 18 }}>{Array.from({ length: 5 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 66, marginBottom: 10 }} />)}</div>
          ) : products.length === 0 ? (
            <p style={{ padding: 24, color: "var(--pp-text-3)", textAlign: "center" }}>No sellable inventory items found. Add a unit price to stock items before selling them here.</p>
          ) : (
            <div style={{ display: "grid" }}>
              {products.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderTop: "1px solid var(--pp-border)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pp-text)" }}>{item.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--pp-text-3)" }}>
                      {item.category} · {item.sku ?? "No SKU"} · {item.quantity_in_stock} {item.unit}s in stock
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "var(--pp-text)" }}>{formatCurrency(item.unit_price, { showEmpty: true })}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--pp-text-3)" }}>per {item.unit}</div>
                    </div>
                    <button className="pp-btn pp-btn-primary" onClick={() => addToCart(item)}>Add</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form className="pp-card" onSubmit={handleCheckout}>
          <div className="pp-section-title" style={{ marginBottom: 14 }}>Checkout</div>
          {checkoutError && <div className="pp-field-error" style={{ marginBottom: 12 }}>{checkoutError}</div>}
          {successMessage && <div className="pp-alert pp-alert-success" style={{ marginBottom: 12 }}>{successMessage}</div>}

          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {cartItems.length === 0 ? (
              <div style={{ padding: "16px 14px", border: "1px dashed var(--pp-border)", borderRadius: "var(--pp-radius-sm)", color: "var(--pp-text-3)", fontSize: 12.5 }}>
                Add items from the left to start a retail sale.
              </div>
            ) : (
              cartItems.map((line) => (
                <div key={line.item.id} style={{ border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--pp-text)" }}>{line.item.name}</div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--pp-text-3)" }}>{formatCurrency(line.item.unit_price, { showEmpty: true })} each</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "var(--pp-text)" }}>{formatCurrency((line.item.unit_price ?? 0) * line.quantity, { showEmpty: true })}</div>
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" className="pp-row-btn" onClick={() => changeQuantity(line.item.id, line.quantity - 1)}>-</button>
                        <span style={{ minWidth: 22, textAlign: "center", color: "var(--pp-text)" }}>{line.quantity}</span>
                        <button type="button" className="pp-row-btn" onClick={() => changeQuantity(line.item.id, line.quantity + 1)}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pp-row-2">
            <div className="pp-field"><label className="pp-field-label" htmlFor="customer-name-1">Customer name</label><input id="customer-name-1" className="pp-input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Optional walk-in customer name" /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="customer-phone-1">Customer phone</label><input id="customer-phone-1" className="pp-input" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Optional contact" /></div>
          </div>
          <div className="pp-row-2">
            <div className="pp-field"><label className="pp-field-label" htmlFor="payment-method-1">Payment method</label><select id="payment-method-1" className="pp-input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{PAYMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="sale-date-1">Sale date</label><input id="sale-date-1" className="pp-input" type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></div>
          </div>
          <div className="pp-field"><label className="pp-field-label" htmlFor="notes-1">Notes</label><textarea id="notes-1" className="pp-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} style={{ resize: "none" }} placeholder="Optional context for this counter sale" /></div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--pp-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--pp-text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--pp-text)" }}>{formatCurrency(grandTotal, { showEmpty: true })}</div>
            </div>
            <button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} disabled={saving || cartItems.length === 0}>
              <span>{saving ? "Processing..." : "Complete Sale"}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--pp-border)" }}>
          <div className="pp-section-title" style={{ marginBottom: 4 }}>Recent Shop Sales</div>
          <div style={{ fontSize: 12, color: "var(--pp-text-3)" }}>Recent counter sales for quick reconciliation and stock sanity checks.</div>
        </div>
        {salesError && <div className="pp-alert pp-alert-error" style={{ margin: 18 }}>{salesError}</div>}
        {salesLoading ? (
          <div style={{ padding: 18 }}>{Array.from({ length: 4 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 52, marginBottom: 8 }} />)}</div>
        ) : sales.length === 0 ? (
          <p style={{ padding: 24, color: "var(--pp-text-3)", textAlign: "center" }}>No shop sales recorded yet.</p>
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Paid</th>
                <th>Method</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td style={{ fontWeight: 600, color: "var(--pp-text)" }}>{sale.reference}</td>
                  <td>
                    <div style={{ color: "var(--pp-text)" }}>{sale.customer_name}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: "var(--pp-text-3)" }}>{sale.customer_phone ?? "No phone recorded"}</div>
                  </td>
                  <td style={{ color: "var(--pp-text-2)" }}>{sale.item_count}</td>
                  <td style={{ fontWeight: 600, color: "var(--pp-green)" }}>{formatCurrency(sale.total_amount, { showEmpty: true })}</td>
                  <td style={{ color: "var(--pp-text-2)" }}>{sale.payment_method ?? "-"}</td>
                  <td style={{ color: "var(--pp-text-2)" }}>{sale.paid_at ? formatDate(sale.paid_at, "short") : sale.created_at ? formatDateTime(sale.created_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
