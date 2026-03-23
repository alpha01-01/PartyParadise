"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStaff, useWeekShifts, useLeaveRequests, reviewLeaveRequest, createStaffMember, createShift } from "@/hooks";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";

type EmploymentType = "full_time" | "part_time" | "contract";
type Tab = "staff" | "schedule" | "leave";

const EMP_BADGE: Record<EmploymentType, string> = {
  full_time: "pp-badge-green",
  part_time: "pp-badge-gold",
  contract: "pp-badge-blue",
};

const EMP_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
};

const AVATAR_PALETTES = [
  { bg: "rgba(245,200,66,0.15)", border: "rgba(245,200,66,0.3)", text: "var(--pp-gold)" },
  { bg: "rgba(122,163,224,0.15)", border: "rgba(122,163,224,0.3)", text: "#7aa3e0" },
  { bg: "rgba(76,175,125,0.15)", border: "rgba(76,175,125,0.3)", text: "var(--pp-green)" },
  { bg: "rgba(217,122,176,0.15)", border: "rgba(217,122,176,0.3)", text: "#d97ab0" },
  { bg: "rgba(160,130,250,0.15)", border: "rgba(160,130,250,0.3)", text: "#a78bfa" },
];

function avatarPalette(id: string) {
  return AVATAR_PALETTES[id.charCodeAt(Math.max(id.length - 1, 0)) % AVATAR_PALETTES.length];
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMondayOfWeek(offset = 0): string {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7) + offset * 7);
  return date.toISOString().split("T")[0];
}

function getWeekDates(mondayStr: string): Date[] {
  const monday = new Date(mondayStr);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [selected, setSelected] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = getMondayOfWeek(weekOffset);
  const { staff, loading: staffLoading, error: staffError, refresh: refreshStaff } = useStaff();
  const { shifts, loading: shiftsLoading } = useWeekShifts(monday);
  const { requests, loading: leaveLoading, refresh: refreshLeave } = useLeaveRequests();

  const counts = useMemo(() => ({
    total: staff.length,
    fullTime: staff.filter((member: any) => member.employment_type === "full_time").length,
    partTime: staff.filter((member: any) => member.employment_type === "part_time").length,
    contract: staff.filter((member: any) => member.employment_type === "contract").length,
    active: staff.filter((member: any) => member.is_active !== false).length,
  }), [staff]);

  const activeStaff = staff.filter((member: any) => member.is_active !== false);
  const pendingLeave = requests.filter((request: any) => request.status === "pending").length;

  function handleExport() {
    if (tab === "staff") {
      downloadCsv("staff.csv", staff.map((member: any) => ({
        Name: member.full_name ?? member.user?.full_name ?? "",
        Role: member.role_title ?? "",
        EmploymentType: member.employment_type ?? "",
        Phone: member.phone ?? "",
        BaseSalary: member.base_salary ?? "",
        DailyRate: member.daily_rate ?? "",
        Active: member.is_active !== false,
      })));
      return;
    }
    if (tab === "schedule") {
      downloadCsv("staff-shifts.csv", (shifts ?? []).map((shift: any) => ({
        StaffId: shift.staff_id,
        ShiftDate: shift.shift_date,
        StartTime: shift.start_time,
        EndTime: shift.end_time ?? "",
        Type: shift.type ?? "",
        Status: shift.status ?? "",
        BookingRef: shift.booking_ref ?? "",
        Location: shift.location ?? "",
      })));
      return;
    }
    downloadCsv("leave-requests.csv", requests.map((request: any) => ({
      Staff: request.staff_name ?? "",
      Type: request.type ?? "",
      StartDate: request.start_date ?? "",
      EndDate: request.end_date ?? "",
      DaysRequested: request.days_requested ?? "",
      Status: request.status ?? "",
    })));
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Field Workforce</span>
          <h1 className="pp-page-title">Staff</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Coordinate decorators, operators, and support crew with one view of staffing, schedules, and leave risk before event week gets busy.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{counts.total} staff records</span>
            <span>{counts.active} active team members</span>
            <span>{pendingLeave} pending leave requests</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
          <button className="pp-btn pp-btn-primary" onClick={() => setShowModal(true)}>{tab === "staff" ? "Add Staff" : tab === "schedule" ? "Assign Shift" : "Request Leave"}</button>
        </div>
      </section>

      <div className="pp-ops-summary-grid">
        <SummaryCard label="Active Team" value={String(counts.active)} detail="Crew members available for current scheduling" tone="green" />
        <SummaryCard label="Full-Time" value={String(counts.fullTime)} detail="Core internal team on monthly payroll" />
        <SummaryCard label="Part-Time" value={String(counts.partTime)} detail="Flexible bench for support and overflow" tone="gold" />
        <SummaryCard label="Contract Crew" value={String(counts.contract)} detail="Event-based specialists and temporary operators" />
      </div>

      <div className="pp-page-tabs">
        <button className={cn("pp-page-tab", tab === "staff" && "pp-page-tab--active")} onClick={() => { setTab("staff"); setSelected(null); }}>Staff</button>
        <button className={cn("pp-page-tab", tab === "schedule" && "pp-page-tab--active")} onClick={() => { setTab("schedule"); setSelected(null); }}>Schedule</button>
        <button className={cn("pp-page-tab", tab === "leave" && "pp-page-tab--active")} onClick={() => { setTab("leave"); setSelected(null); }}>Leave</button>
      </div>

      <div className="pp-toolbar-note">
        <span>The mobile staff app should eventually read from this same staffing, shift, and attendance model rather than creating a second scheduling system.</span>
        <span>For now, this page remains the control center for assignments, roster quality, and leave approvals.</span>
      </div>

      {tab === "staff" && <StaffTab staff={staff} counts={counts} loading={staffLoading} error={staffError} selected={selected} onSelect={(member: any) => setSelected((current: any) => current?.id === member.id ? null : member)} />}
      {tab === "schedule" && <ScheduleTab staff={activeStaff} shifts={shifts} loading={shiftsLoading} weekDates={getWeekDates(monday)} onPrev={() => setWeekOffset((value) => value - 1)} onNext={() => setWeekOffset((value) => value + 1)} onToday={() => setWeekOffset(0)} />}
      {tab === "leave" && <LeaveTab requests={requests} loading={leaveLoading} onRefresh={refreshLeave} />}

      {showModal && tab === "staff" && <AddStaffModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); refreshStaff(); }} />}
      {showModal && tab === "schedule" && <AddShiftModal staff={activeStaff} onClose={() => setShowModal(false)} onSaved={() => setShowModal(false)} />}
    </>
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

function StaffTab({ staff, counts, loading, error, selected, onSelect }: any) {
  return (
    <div style={{ display: "flex", overflow: "hidden", flex: 1 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
        {error && <div className="pp-alert pp-alert-error">{error}</div>}
        {loading ? (
          <div className="pp-staff-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 140, borderRadius: "var(--pp-radius)" }} />)}</div>
        ) : (
          <div className="pp-staff-grid">
            {staff.map((member: any) => {
              const palette = avatarPalette(member.id);
              const fullName = member.full_name ?? member.user?.full_name ?? "Staff";
              const initials = fullName.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={member.id} className={cn("pp-staff-card", selected?.id === member.id && "pp-staff-card--selected")} onClick={() => onSelect(member)}>
                  <div className="pp-staff-card-top">
                    <div className="pp-client-av pp-client-av--lg" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>{initials}</div>
                    <span className={`pp-badge ${EMP_BADGE[member.employment_type as EmploymentType] ?? "pp-badge-neutral"}`}>{EMP_LABEL[member.employment_type as EmploymentType] ?? member.employment_type}</span>
                  </div>
                  <div className="pp-staff-card-name">{fullName}</div>
                  <div className="pp-staff-card-role">{member.role_title}</div>
                  <div className="pp-staff-card-footer">
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: member.is_active !== false ? "var(--pp-green)" : "var(--pp-text-3)" }} /><span style={{ color: "var(--pp-text-3)" }}>{member.is_active !== false ? "Active" : "Inactive"}</span></div>
                    <span style={{ fontSize: 11.5, color: "var(--pp-text-3)" }}>{member.base_salary ? `${formatCurrency(member.base_salary, { showEmpty: true })} / mo` : member.daily_rate ? `${formatCurrency(member.daily_rate, { showEmpty: true })} / day` : "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selected && <StaffDetailPanel staff={selected} onClose={() => onSelect(selected)} />}
    </div>
  );
}

function StaffDetailPanel({ staff, onClose }: any) {
  const palette = avatarPalette(staff.id);
  const fullName = staff.full_name ?? staff.user?.full_name ?? "Staff";
  const initials = fullName.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <div className="pp-dp-av" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>{initials}</div>
        <h2 className="pp-dp-name">{fullName}</h2>
        <div style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 8 }}>{staff.role_title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span className={`pp-badge ${EMP_BADGE[staff.employment_type as EmploymentType] ?? "pp-badge-neutral"}`}>{EMP_LABEL[staff.employment_type as EmploymentType] ?? staff.employment_type}</span>{staff.is_active === false && <span className="pp-badge pp-badge-red">Inactive</span>}</div>
        <div className="pp-dp-actions" style={{ marginTop: 12 }}><button className="pp-btn pp-btn-primary" style={{ fontSize: 12 }}>Assign Shift</button><Link href={`/staff/${staff.id}`} className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }}>Full Profile</Link></div>
      </div>
      <div className="pp-dp-body">
        <div className="pp-dp-section"><div className="pp-dp-section-header"><span className="pp-dp-section-title">Contact & Pay</span></div>{staff.phone && <DpField label="Phone" value={staff.phone} />}{staff.base_salary && <DpField label="Salary" value={`${formatCurrency(staff.base_salary, { showEmpty: true })} / mo`} />}{staff.daily_rate && <DpField label="Day rate" value={`${formatCurrency(staff.daily_rate, { showEmpty: true })} / day`} />}{staff.hired_at && <DpField label="Hired" value={formatDate(staff.hired_at)} />}</div>
        <div className="pp-dp-section"><div className="pp-dp-section-header"><span className="pp-dp-section-title">Upcoming Shift Context</span></div><p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)" }}>This panel is ready for the mobile staff app handoff: roster, assignment context, and payroll-relevant basics in one place.</p></div>
      </div>
    </div>
  );
}

function ScheduleTab({ staff, shifts, loading, weekDates, onPrev, onNext, onToday }: any) {
  const today = new Date();
  const shiftsByStaffDay: Record<string, Record<number, any[]>> = {};
  for (const shift of shifts ?? []) {
    const date = new Date(shift.shift_date);
    const dayIndex = (date.getDay() + 6) % 7;
    if (!shiftsByStaffDay[shift.staff_id]) shiftsByStaffDay[shift.staff_id] = {};
    if (!shiftsByStaffDay[shift.staff_id][dayIndex]) shiftsByStaffDay[shift.staff_id][dayIndex] = [];
    shiftsByStaffDay[shift.staff_id][dayIndex].push(shift);
  }

  return (
    <div style={{ padding: "20px 22px", overflow: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button className="pp-btn pp-btn-ghost" style={{ width: 32, height: 32, padding: 0, justifyContent: "center" }} onClick={onPrev}>Prev</button>
        <h2 style={{ fontFamily: "var(--pp-font-display)", fontSize: 15, fontWeight: 700, color: "var(--pp-text)", letterSpacing: "-0.02em", flex: 1 }}>Week of {formatDate(weekDates[0]?.toISOString().split("T")[0], "short")} to {formatDate(weekDates[6]?.toISOString().split("T")[0], "short")}</h2>
        <button className="pp-btn pp-btn-ghost" style={{ width: 32, height: 32, padding: 0, justifyContent: "center" }} onClick={onNext}>Next</button>
        <button className="pp-btn pp-btn-ghost" onClick={onToday}>Today</button>
      </div>
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "150px repeat(7,1fr)", borderBottom: "1px solid var(--pp-border)" }}>
          <div style={{ padding: "10px 12px", fontSize: 10, color: "var(--pp-text-3)", borderRight: "1px solid var(--pp-border)" }} />
          {weekDates.map((date: Date, index: number) => {
            const isToday = date.toDateString() === today.toDateString();
            return <div key={index} style={{ padding: "10px 12px", textAlign: "center", fontSize: 10.5, fontWeight: 500, color: isToday ? "var(--pp-gold)" : "var(--pp-text-3)", background: isToday ? "rgba(245,200,66,0.08)" : undefined, borderRight: index < 6 ? "1px solid var(--pp-border)" : undefined }}>{WEEK_DAYS[index]} {date.getDate()}</div>;
          })}
        </div>
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 52, margin: "1px 0" }} />)
        ) : staff.map((member: any, rowIndex: number) => {
          const palette = avatarPalette(member.id);
          const fullName = member.full_name ?? member.user?.full_name ?? "Staff";
          const initials = fullName.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
          const staffShifts = shiftsByStaffDay[member.id] ?? {};
          return (
            <div key={member.id} style={{ display: "grid", gridTemplateColumns: "150px repeat(7,1fr)", borderBottom: rowIndex < staff.length - 1 ? "1px solid var(--pp-border)" : undefined }}>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderRight: "1px solid var(--pp-border)" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: palette.bg, borderColor: palette.border, color: palette.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, border: "1.5px solid" }}>{initials}</div>
                <div><div style={{ fontSize: 12, fontWeight: 500, color: "var(--pp-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName.split(" ")[0]}</div><div style={{ fontSize: 10, color: "var(--pp-text-3)" }}>{member.role_title?.split(" ")[0]}</div></div>
              </div>
              {weekDates.map((date: Date, dayIndex: number) => {
                const isToday = date.toDateString() === today.toDateString();
                const dayShifts = staffShifts[dayIndex] ?? [];
                return (
                  <div key={dayIndex} style={{ padding: 4, minHeight: 52, background: isToday ? "rgba(245,200,66,0.03)" : undefined, borderRight: dayIndex < 6 ? "1px solid var(--pp-border)" : undefined }}>
                    {dayShifts.map((shift: any) => <div key={shift.id} className={`pp-shift-pill pp-shift-pill--${shift.type ?? "event"}`} title={`${shift.start_time}${shift.end_time ? ` - ${shift.end_time}` : ""}`}>{shift.type === "event" ? "Event" : shift.type === "prep" ? "Prep" : shift.type ?? "Shift"}</div>)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaveTab({ requests, loading, onRefresh }: any) {
  async function handleReview(id: string, status: "approved" | "declined") {
    try {
      await reviewLeaveRequest(id, status);
      onRefresh();
    } catch {
      // keep UI stable
    }
  }

  return (
    <div style={{ padding: "20px 22px" }}>
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 52, margin: "1px 0" }} />)
        ) : requests.length === 0 ? (
          <p style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--pp-text-3)" }}>No leave requests yet.</p>
        ) : (
          <table className="pp-table">
            <thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th /></tr></thead>
            <tbody>
              {requests.map((request: any) => {
                const palette = avatarPalette(request.staff_id);
                return (
                  <tr key={request.id} className="pp-tr-clickable">
                    <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: "50%", background: palette.bg, borderColor: palette.border, color: palette.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, border: "1.5px solid" }}>{(request.staff_name ?? request.staff_initials ?? "?").split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()}</div><span style={{ fontSize: 13, fontWeight: 500, color: "var(--pp-text)" }}>{request.staff_name ?? "Staff"}</span></div></td>
                    <td style={{ color: "var(--pp-text-2)" }}>{request.type}</td>
                    <td style={{ color: "var(--pp-text-2)" }}>{formatDate(request.start_date, "short")}{request.start_date !== request.end_date ? ` - ${formatDate(request.end_date, "short")}` : ""}</td>
                    <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{request.days_requested}</td>
                    <td><span className={`pp-badge ${request.status === "approved" ? "pp-badge-green" : request.status === "declined" ? "pp-badge-red" : "pp-badge-gold"}`}>{request.status.charAt(0).toUpperCase() + request.status.slice(1)}</span></td>
                    <td>{request.status === "pending" && <div style={{ display: "flex", gap: 4 }} onClick={(event) => event.stopPropagation()}><button style={{ padding: "4px 10px", background: "rgba(76,175,125,0.1)", border: "1px solid rgba(76,175,125,0.2)", borderRadius: "var(--pp-radius-sm)", fontSize: 11.5, color: "var(--pp-green)", cursor: "pointer" }} onClick={() => handleReview(request.id, "approved")}>Approve</button><button style={{ padding: "4px 10px", background: "rgba(224,90,74,0.08)", border: "1px solid rgba(224,90,74,0.15)", borderRadius: "var(--pp-radius-sm)", fontSize: 11.5, color: "var(--pp-red)", cursor: "pointer" }} onClick={() => handleReview(request.id, "declined")}>Decline</button></div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role_title: "", employment_type: "full_time", phone: "", base_salary: "", daily_rate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.first_name || !form.last_name || !form.role_title || !form.email) { setError("Name, email, and role are required"); return; }
    setSaving(true);
    try {
      await createStaffMember({ first_name: form.first_name, last_name: form.last_name, email: form.email, role_title: form.role_title, employment_type: form.employment_type, phone: form.phone || undefined, base_salary: form.base_salary ? parseFloat(form.base_salary) : undefined, daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : undefined });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pp-modal-header"><span className="pp-modal-title">Add Staff Member</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-row-2"><div className="pp-field"><label className="pp-field-label">First name <span className="pp-required">*</span></label><input className="pp-input" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} autoFocus /></div><div className="pp-field"><label className="pp-field-label">Last name <span className="pp-required">*</span></label><input className="pp-input" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} /></div></div>
            <div className="pp-field"><label className="pp-field-label">Email <span className="pp-required">*</span></label><input className="pp-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="pp-field"><label className="pp-field-label">Role <span className="pp-required">*</span></label><input className="pp-input" value={form.role_title} onChange={(event) => setForm((current) => ({ ...current, role_title: event.target.value }))} /></div>
            <div className="pp-field"><label className="pp-field-label">Employment type</label><select className="pp-input" value={form.employment_type} onChange={(event) => setForm((current) => ({ ...current, employment_type: event.target.value }))}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option></select></div>
            <div className="pp-field"><label className="pp-field-label">Phone</label><input className="pp-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="pp-row-2"><div className="pp-field"><label className="pp-field-label">Salary (GHS/mo)</label><input className="pp-input" type="number" value={form.base_salary} onChange={(event) => setForm((current) => ({ ...current, base_salary: event.target.value }))} /></div><div className="pp-field"><label className="pp-field-label">Daily rate (GHS)</label><input className="pp-input" type="number" value={form.daily_rate} onChange={(event) => setForm((current) => ({ ...current, daily_rate: event.target.value }))} /></div></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Adding..." : "Add Staff Member"}</span></button></div>
        </form>
      </div>
    </div>
  );
}

function AddShiftModal({ staff, onClose, onSaved }: { staff: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ staff_id: staff[0]?.id ?? "", type: "event", shift_date: "", start_time: "08:00", end_time: "18:00", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.staff_id || !form.shift_date) { setError("Staff and date are required"); return; }
    setSaving(true);
    try {
      await createShift({ ...form, end_time: form.end_time || undefined, location: form.location || undefined });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pp-modal-header"><span className="pp-modal-title">Assign Shift</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label">Staff member <span className="pp-required">*</span></label><select className="pp-input" value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))}>{staff.map((member: any) => <option key={member.id} value={member.id}>{member.full_name ?? member.user?.full_name}</option>)}</select></div>
            <div className="pp-field"><label className="pp-field-label">Shift type</label><select className="pp-input" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="event">Event</option><option value="prep">Prep / setup</option><option value="training">Training</option><option value="admin">Admin</option></select></div>
            <div className="pp-field"><label className="pp-field-label">Date <span className="pp-required">*</span></label><input className="pp-input" type="date" value={form.shift_date} onChange={(event) => setForm((current) => ({ ...current, shift_date: event.target.value }))} /></div>
            <div className="pp-row-2"><div className="pp-field"><label className="pp-field-label">Start time</label><input className="pp-input" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></div><div className="pp-field"><label className="pp-field-label">End time</label><input className="pp-input" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} /></div></div>
            <div className="pp-field"><label className="pp-field-label">Location</label><input className="pp-input" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Assigning..." : "Assign Shift"}</span></button></div>
        </form>
      </div>
    </div>
  );
}

function DpField({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 18px", fontSize: 12.5 }}><span style={{ color: "var(--pp-text-3)" }}>{label}</span><span style={{ color: "var(--pp-text)", fontSize: 12 }}>{value}</span></div>;
}

const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
