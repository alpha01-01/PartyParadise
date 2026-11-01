"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api, { normaliseError } from "@/lib/api";

export default function NewInventoryItemPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    unit: "pcs",
    reorder_level: 0,
    unit_cost: "",
    unit_price: "",
    location: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.category) {
      setError("Name and category are required.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/inventory/items", {
        name: form.name,
        sku: form.sku || undefined,
        category: form.category,
        unit: form.unit,
        reorder_level: Number(form.reorder_level) || 0,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
        unit_price: form.unit_price ? Number(form.unit_price) : undefined,
        location: form.location || undefined,
      });
      router.push("/inventory");
    } catch (err) {
      setError(normaliseError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="pp-page-header">
        <div>
          <h1 className="pp-page-title">Add Inventory Item</h1>
          <p className="pp-page-subtitle">Create a new stock item</p>
        </div>
        <Link href="/inventory" className="pp-btn pp-btn-ghost">Back to Inventory</Link>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="pp-card" style={{ maxWidth: 720 }}>
        <div className="pp-row-2">
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="name-1">Name <span className="pp-required">*</span></label>
            <input id="name-1" className="pp-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="category-1">Category <span className="pp-required">*</span></label>
            <input id="category-1" className="pp-input" value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="sku-1">SKU</label>
            <input id="sku-1" className="pp-input" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="unit-1">Unit</label>
            <input id="unit-1" className="pp-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-3" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="reorder-level-1">Reorder level</label>
            <input id="reorder-level-1" className="pp-input" type="number" value={form.reorder_level} onChange={(e) => set("reorder_level", Number(e.target.value))} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="unit-cost-1">Unit cost</label>
            <input id="unit-cost-1" className="pp-input" type="number" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="unit-price-1">Unit price</label>
            <input id="unit-price-1" className="pp-input" type="number" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} />
          </div>
        </div>

        <div className="pp-field" style={{ marginTop: 12 }}>
          <label className="pp-field-label" htmlFor="location-1">Location</label>
          <input id="location-1" className="pp-input" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="pp-btn pp-btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Create Item"}
          </button>
          <Link href="/inventory" className="pp-btn pp-btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
