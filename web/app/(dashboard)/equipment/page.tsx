"use client";

import { useEffect, useMemo, useState } from "react";
import { useEquipment } from "@/hooks";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import api, { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import type { Equipment, EquipmentStatus } from "@/lib/types";
import { ModalOverlay } from "@/components/ModalOverlay";

interface MaintenanceEntry {
  id: string;
  type: string;
  description: string;
  cost: number | null;
  serviced_at: string;
  next_service_at: string | null;
}

const STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  deployed: "Deployed",
  maintenance: "Maintenance",
  retired: "Retired",
};

const STATUS_BADGE: Record<EquipmentStatus, string> = {
  available: "pp-badge-green",
  reserved: "pp-badge-gold",
  deployed: "pp-badge-blue",
  maintenance: "pp-badge-red",
  retired: "pp-badge-neutral",
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: "var(--pp-green)",
  good: "var(--pp-green)",
  fair: "var(--pp-gold)",
  poor: "var(--pp-red)",
};

const FILTER_STATUSES: { value: EquipmentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "deployed", label: "Deployed" },
  { value: "maintenance", label: "Maintenance" },
];

function titleCase(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "all">("all");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);

  const { equipment, loading, error } = useEquipment();

  const filtered = useMemo(() => equipment.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const q = search.toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.serial_number ?? "").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  }), [equipment, search, status]);

  const counts = equipment.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalValue = equipment.reduce((sum, item) => sum + (item.purchase_cost ?? 0), 0);
  const categories = new Set(equipment.map((item) => item.category)).size;

  function handleExport() {
    downloadCsv("equipment.csv", filtered.map((item) => ({
      Name: item.name,
      Category: item.category,
      Serial: item.serial_number ?? "",
      Status: STATUS_LABELS[item.status],
      Condition: item.condition,
      PurchaseCost: item.purchase_cost ?? "",
      PurchasedAt: item.purchased_at ?? "",
      LastServicedAt: item.last_serviced_at ?? "",
    })));
  }

  return (
    <div style={{ display: "flex", overflow: "hidden", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
        <section className="pp-ops-hero">
          <div className="pp-ops-hero-copy">
            <span className="pp-ops-kicker">Asset Readiness</span>
            <h1 className="pp-page-title">Equipment</h1>
            <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
              Keep booths, backdrops, lighting, and supporting event assets deployment-ready with clear status and maintenance visibility.
            </p>
            <div className="pp-ops-hero-meta">
              <span>{equipment.length} tracked assets</span>
              <span>{counts.available ?? 0} available now</span>
              <span>{counts.maintenance ?? 0} in maintenance</span>
            </div>
          </div>
          <div className="pp-ops-hero-actions">
            <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
            <button className="pp-btn pp-btn-primary" onClick={() => setShowAddModal(true)}>Add Equipment</button>
          </div>
        </section>

        <div className="pp-ops-summary-grid">
          <SummaryCard label="Available" value={String(counts.available ?? 0)} detail="Assets ready to assign to upcoming bookings" tone="green" />
          <SummaryCard label="Reserved" value={String(counts.reserved ?? 0)} detail="Already committed to future events" tone="gold" />
          <SummaryCard label="Deployed" value={String(counts.deployed ?? 0)} detail="Currently out on jobs or active setups" />
          <SummaryCard label="Asset Value" value={formatCurrency(totalValue, { compact: true, showEmpty: true })} detail={`${categories} categories across the warehouse`} />
        </div>

        <div className="pp-filter-bar">
          <div className="pp-search-wrap">
            <SearchIcon />
            <input className="pp-search-input" aria-label="Search" placeholder="Search equipment, category, or serial" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="pp-filter-tabs">
            {FILTER_STATUSES.map((tab) => (
              <button key={tab.value} className={cn("pp-filter-tab", status === tab.value && "pp-filter-tab--active")} onClick={() => setStatus(tab.value)}>{tab.label}</button>
            ))}
          </div>
        </div>

        <div className="pp-toolbar-note">
          <span>Inventory is for consumables; this page is for reusable assets that need status tracking, servicing, and deployment discipline.</span>
          <span>Use the detail panel to review maintenance history before assigning an item to a booking.</span>
        </div>

        {error && <div className="pp-alert pp-alert-error">{error}</div>}

        <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 54, margin: "1px 0" }} />)
          ) : (
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Category</th>
                  <th>Serial</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Value</th>
                  <th>Last Service</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <EquipmentRow
                    key={item.id}
                    equipment={item}
                    selected={selected?.id === item.id}
                    onSelect={() => setSelected((current) => current?.id === item.id ? null : item)}
                    onEdit={() => setEditingEquipment(item)}
                  />
                ))}
              </tbody>
            </table>
          )}
          <div className="pp-pagination"><span>{filtered.length} of {equipment.length} units</span></div>
        </div>
      </div>

      {selected && <EquipmentDetailPanel equipment={selected} onClose={() => setSelected(null)} onEdit={() => setEditingEquipment(selected)} />}
      {showAddModal && <AddEquipmentModal onClose={() => setShowAddModal(false)} onSaved={() => setShowAddModal(false)} />}
      {editingEquipment && (
        <EditEquipmentModal
          equipment={editingEquipment}
          onClose={() => setEditingEquipment(null)}
          onSaved={(updated) => {
            setEditingEquipment(null);
            setSelected(updated);
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

function EquipmentRow({ equipment, selected, onSelect, onEdit }: { equipment: Equipment; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  const conditionColor = CONDITION_COLORS[equipment.condition] ?? "var(--pp-text-3)";
  const serviceDue = Boolean(equipment.last_serviced_at) && new Date(equipment.last_serviced_at as string) < new Date(Date.now() - 180 * 86400000);

  return (
    <tr className={cn("pp-tr-clickable", selected && "pp-tr-selected")} onClick={onSelect}>
      <td style={{ fontWeight: 500, color: "var(--pp-text)", fontSize: 13 }}>{equipment.name}</td>
      <td style={{ color: "var(--pp-text-2)" }}>{equipment.category}</td>
      <td style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{equipment.serial_number ?? "-"}</td>
      <td><span className={`pp-badge ${STATUS_BADGE[equipment.status]}`}>{STATUS_LABELS[equipment.status]}</span></td>
      <td><div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: conditionColor }} />{titleCase(equipment.condition)}</div></td>
      <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{formatCurrency(equipment.purchase_cost, { showEmpty: true })}</td>
      <td style={{ fontSize: 11.5, color: serviceDue ? "var(--pp-red)" : "var(--pp-text-3)" }}>{equipment.last_serviced_at ? formatDate(equipment.last_serviced_at, "short") : "-"}</td>
      <td><div className="pp-row-actions" onClick={(event) => event.stopPropagation()}><button className="pp-row-btn" title="Maintenance" onClick={onSelect}><ServiceIcon /></button><button className="pp-row-btn" title="Edit" onClick={onEdit}><EditIcon /></button></div></td>
    </tr>
  );
}

function EquipmentDetailPanel({ equipment, onClose, onEdit }: { equipment: Equipment; onClose: () => void; onEdit: () => void }) {
  const conditionColor = CONDITION_COLORS[equipment.condition] ?? "var(--pp-text-3)";
  const [showLogForm, setShowLogForm] = useState(false);
  const [logDesc, setLogDesc] = useState("");
  const [logType, setLogType] = useState("routine");
  const [logCost, setLogCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceEntry[]>([]);
  const [maintenanceError, setMaintenanceError] = useState("");

  async function loadMaintenance() {
    try {
      const { data } = await api.get<MaintenanceEntry[]>(`/inventory/equipment/${equipment.id}/maintenance`);
      setMaintenance(data);
      setMaintenanceError("");
    } catch (err) {
      setMaintenanceError(normaliseError(err).message);
    }
  }

  useEffect(() => {
    void loadMaintenance();
  }, [equipment.id]);

  async function handleLogService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logDesc.trim()) return;
    setSaving(true);
    try {
      await api.post(`/inventory/equipment/${equipment.id}/maintenance`, { type: logType, description: logDesc.trim(), cost: logCost ? parseFloat(logCost) : undefined, serviced_at: new Date().toISOString().split("T")[0] });
      setShowLogForm(false);
      setLogDesc("");
      setLogCost("");
      await loadMaintenance();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <h2 className="pp-dp-name" style={{ fontSize: 15 }}>{equipment.name}</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <span className={`pp-badge ${STATUS_BADGE[equipment.status]}`}>{STATUS_LABELS[equipment.status]}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--pp-text-2)" }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: conditionColor }} />{titleCase(equipment.condition)} condition</div>
        </div>
        <div className="pp-dp-actions" style={{ marginTop: 10 }}>
          <button className="pp-btn pp-btn-primary" style={{ fontSize: 12 }} onClick={() => setShowLogForm((open) => !open)}>Log Service</button>
          <button className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Edit</button>
        </div>
        {showLogForm && (
          <form onSubmit={handleLogService} style={{ marginTop: 12 }}>
            <div className="pp-field" style={{ marginBottom: 8 }}><select className="pp-input" value={logType} onChange={(event) => setLogType(event.target.value)} style={{ fontSize: 12 }}><option value="routine">Routine service</option><option value="repair">Repair</option><option value="inspection">Inspection</option><option value="cleaning">Cleaning</option></select></div>
            <div className="pp-field" style={{ marginBottom: 8 }}><input className="pp-input" placeholder="What was done?" value={logDesc} onChange={(event) => setLogDesc(event.target.value)} style={{ fontSize: 12 }} autoFocus /></div>
            <div style={{ display: "flex", gap: 6 }}><input className="pp-input" type="number" placeholder="Cost (optional)" value={logCost} onChange={(event) => setLogCost(event.target.value)} style={{ fontSize: 12 }} /><button type="submit" className="pp-btn pp-btn-primary" style={{ fontSize: 12, flexShrink: 0 }} disabled={saving || !logDesc.trim()}>Save</button></div>
          </form>
        )}
      </div>
      <div className="pp-dp-body">
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Asset Details</span></div>
          <DpField label="Category" value={equipment.category} />
          <DpField label="Serial" value={equipment.serial_number ?? "-"} />
          <DpField label="Purchase cost" value={formatCurrency(equipment.purchase_cost, { showEmpty: true })} />
          <DpField label="Purchased" value={equipment.purchased_at ? formatDate(equipment.purchased_at) : "-"} />
          <DpField label="Last serviced" value={equipment.last_serviced_at ? formatDate(equipment.last_serviced_at) : "-"} />
          <DpField label="Notes" value={equipment.notes ?? "No notes"} />
        </div>
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Maintenance Log</span></div>
          {maintenanceError ? (
            <div className="pp-alert pp-alert-error" style={{ margin: "12px 18px" }}>{maintenanceError}</div>
          ) : maintenance.length === 0 ? (
            <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>No maintenance entries recorded yet.</p>
          ) : (
            maintenance.map((entry) => (
              <div key={entry.id} style={{ padding: "10px 18px", borderTop: "1px solid var(--pp-border)", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                <div>
                  <div style={{ color: "var(--pp-text)", fontWeight: 500 }}>{titleCase(entry.type)}</div>
                  <div style={{ color: "var(--pp-text-2)", marginTop: 2 }}>{entry.description}</div>
                  {entry.next_service_at && <div style={{ color: "var(--pp-text-3)", marginTop: 2 }}>Next service: {formatDate(entry.next_service_at)}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "var(--pp-text)" }}>{formatDate(entry.serviced_at)}</div>
                  <div style={{ color: "var(--pp-text-3)", marginTop: 2 }}>{formatCurrency(entry.cost, { showEmpty: true })}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AddEquipmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Photobooth");
  const [serial, setSerial] = useState("");
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState("good");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      await api.post("/inventory/equipment", { name: name.trim(), category, serial_number: serial || undefined, purchase_cost: cost ? parseFloat(cost) : undefined, condition, status: "available" });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Add Equipment</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label" htmlFor="name-1">Name <span className="pp-required">*</span></label><input id="name-1" className="pp-input" placeholder="e.g. 360 Photobooth Platform #3" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="category-1">Category</label><select id="category-1" className="pp-input" value={category} onChange={(event) => setCategory(event.target.value)}>{["Photobooth", "Backdrop", "Lighting", "Props", "Transport"].map((value) => <option key={value}>{value}</option>)}</select></div>
            <div className="pp-row-2"><div className="pp-field"><label className="pp-field-label" htmlFor="serial-number-1">Serial number</label><input id="serial-number-1" className="pp-input" placeholder="Optional" value={serial} onChange={(event) => setSerial(event.target.value)} /></div><div className="pp-field"><label className="pp-field-label" htmlFor="purchase-cost-ghs-1">Purchase cost (GHS)</label><input id="purchase-cost-ghs-1" className="pp-input" type="number" placeholder="0.00" value={cost} onChange={(event) => setCost(event.target.value)} /></div></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="condition-1">Condition</label><select id="condition-1" className="pp-input" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Adding..." : "Add Equipment"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function EditEquipmentModal({
  equipment,
  onClose,
  onSaved,
}: {
  equipment: Equipment;
  onClose: () => void;
  onSaved: (equipment: Equipment) => void;
}) {
  const [name, setName] = useState(equipment.name);
  const [category, setCategory] = useState(equipment.category);
  const [status, setStatus] = useState<EquipmentStatus>(equipment.status);
  const [condition, setCondition] = useState(equipment.condition);
  const [notes, setNotes] = useState(equipment.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.patch<Equipment>(`/inventory/equipment/${equipment.id}`, {
        name: name.trim(),
        category,
        status,
        condition,
        notes: notes.trim() || undefined,
      });
      onSaved(data);
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Edit Equipment</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label" htmlFor="name-2">Name <span className="pp-required">*</span></label><input id="name-2" className="pp-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="category-2">Category</label><input id="category-2" className="pp-input" value={category} onChange={(event) => setCategory(event.target.value)} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="status-1">Status</label><select id="status-1" className="pp-input" value={status} onChange={(event) => setStatus(event.target.value as EquipmentStatus)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="condition-2">Condition</label><select id="condition-2" className="pp-input" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="notes-1">Notes</label><textarea id="notes-1" className="pp-input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} style={{ resize: "none" }} /></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Saving..." : "Save Changes"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function DpField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 18px", fontSize: 12.5 }}><span style={{ color: "var(--pp-text-3)" }}>{label}</span><span style={{ color: "var(--pp-text)", fontSize: 12 }}>{value}</span></div>
  );
}

const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const ServiceIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1.5c-3.04 0-5.5 2.46-5.5 5.5s2.46 5.5 5.5 5.5 5.5-2.46 5.5-5.5S10.04 1.5 7 1.5z" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const EditIcon = () => <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>;
const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
