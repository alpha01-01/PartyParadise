"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClients } from "@/hooks";
import api, { normaliseError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type Line = { description: string; quantity: string; unit_price: string };

const EMPTY_LINE: Line = { description: "", quantity: "1", unit_price: "" };

export function ManualInvoiceForm() {
  const router = useRouter();
  const { clients } = useClients({ page_size: 100 });
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY_LINE]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setLine(index: number, field: keyof Line, value: string) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!clientId) {
      setError("Choose a client");
      return;
    }
    const filled = lines.filter((line) => line.description.trim());
    if (filled.length === 0 || filled.some((line) => !(Number(line.quantity) >= 1) || !(Number(line.unit_price) >= 0) || line.unit_price === "")) {
      setError("Each line needs a description, a quantity of 1 or more, and a price");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.post("/invoicing/invoices", {
        client_id: clientId,
        due_date: dueDate || undefined,
        items: filled.map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unit_price: line.unit_price,
        })),
      });
      router.push("/invoices");
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <form className="pp-card" style={{ padding: 18, marginBottom: 16, display: "grid", gap: 12 }} onSubmit={handleSubmit}>
      <div className="pp-card-title">Invoice without a booking</div>
      {error && <div className="pp-field-error">{error}</div>}
      <div className="pp-row-2">
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="manual-client">Client <span className="pp-required">*</span></label>
          <select id="manual-client" className="pp-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.first_name} {client.last_name}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-field-label" htmlFor="manual-due">Due date</label>
          <input id="manual-due" className="pp-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      {lines.map((line, index) => (
        <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          <input className="pp-input" aria-label={`Line ${index + 1} description`} placeholder="Description" value={line.description} onChange={(e) => setLine(index, "description", e.target.value)} />
          <input className="pp-input" aria-label={`Line ${index + 1} quantity`} type="number" min="1" value={line.quantity} onChange={(e) => setLine(index, "quantity", e.target.value)} />
          <input className="pp-input" aria-label={`Line ${index + 1} price in GHS`} type="number" min="0" step="0.01" placeholder="Price (GHS)" value={line.unit_price} onChange={(e) => setLine(index, "unit_price", e.target.value)} />
        </div>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setLines((current) => [...current, EMPTY_LINE])}>Add line</button>
        <span>Total: {formatCurrency(total, { showEmpty: true })}</span>
        <button type="submit" className="pp-btn pp-btn-primary" disabled={saving}>{saving ? "Creating..." : "Create Invoice"}</button>
      </div>
    </form>
  );
}
