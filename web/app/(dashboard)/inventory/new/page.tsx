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
            <label className="pp-field-label">Name <span className="pp-required">*</span></label>
            <input className="pp-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Category <span className="pp-required">*</span></label>
            <input className="pp-input" value={form.category} onChange={(e) => set("category", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label">SKU</label>
            <input className="pp-input" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Unit</label>
            <input className="pp-input" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
          </div>
        </div>

        <div className="pp-row-3" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label">Reorder level</label>
            <input className="pp-input" type="number" value={form.reorder_level} onChange={(e) => set("reorder_level", Number(e.target.value))} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Unit cost</label>
            <input className="pp-input" type="number" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label">Unit price</label>
            <input className="pp-input" type="number" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} />
          </div>
        </div>

        <div className="pp-field" style={{ marginTop: 12 }}>
          <label className="pp-field-label">Location</label>
          <input className="pp-input" value={form.location} onChange={(e) => set("location", e.target.value)} />
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
