"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api, { normaliseError } from "@/lib/api";

export default function NewEquipmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "",
    serial_number: "",
    status: "available",
    condition: "good",
    purchase_cost: "",
    purchased_at: "",
    notes: "",
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
      await api.post("/inventory/equipment", {
        name: form.name,
        category: form.category,
        serial_number: form.serial_number || undefined,
        status: form.status,
        condition: form.condition,
        purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : undefined,
        purchased_at: form.purchased_at || undefined,
        notes: form.notes || undefined,
      });
      router.push("/equipment");
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
          <h1 className="pp-page-title">Add Equipment</h1>
          <p className="pp-page-subtitle">Register new equipment</p>
        </div>
        <Link href="/equipment" className="pp-btn pp-btn-ghost">Back to Equipment</Link>
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
            <label className="pp-field-label" htmlFor="serial-number-1">Serial number</label>
            <input id="serial-number-1" className="pp-input" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="status-1">Status</label>
            <select id="status-1" className="pp-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="deployed">Deployed</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>
        </div>

        <div className="pp-row-2" style={{ marginTop: 12 }}>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="condition-1">Condition</label>
            <select id="condition-1" className="pp-input" value={form.condition} onChange={(e) => set("condition", e.target.value)}>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="needs_repair">Needs repair</option>
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field-label" htmlFor="purchase-cost-1">Purchase cost</label>
            <input id="purchase-cost-1" className="pp-input" type="number" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} />
          </div>
        </div>

        <div className="pp-field" style={{ marginTop: 12 }}>
          <label className="pp-field-label" htmlFor="purchased-at-1">Purchased at</label>
          <input id="purchased-at-1" className="pp-input" type="date" value={form.purchased_at} onChange={(e) => set("purchased_at", e.target.value)} />
        </div>

        <div className="pp-field" style={{ marginTop: 12 }}>
          <label className="pp-field-label" htmlFor="notes-1">Notes</label>
          <textarea id="notes-1" className="pp-input" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="pp-btn pp-btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Create Equipment"}
          </button>
          <Link href="/equipment" className="pp-btn pp-btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
