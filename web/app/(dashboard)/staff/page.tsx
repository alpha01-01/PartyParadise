"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  createLeaveRequest,
  createShift,
  createStaffMember,
  reviewLeaveRequest,
  updateStaffMember,
  useLeaveRequests,
  useStaff,
  useWeekShifts,
  type LeaveRequestData,
  type ShiftData,
  type StaffProfileData,
} from "@/hooks";
import { normaliseError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ModalOverlay } from "@/components/ModalOverlay";

type EmploymentType = "full_time" | "part_time" | "contract";
type Tab = "staff" | "schedule" | "leave";
type ModalType = "staff" | "shift" | "leave" | null;

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

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
};

const AVATAR_PALETTES = [
  { bg: "rgba(245,200,66,0.15)", border: "rgba(245,200,66,0.3)", text: "var(--pp-gold)" },
  { bg: "rgba(122,163,224,0.15)", border: "rgba(122,163,224,0.3)", text: "#7aa3e0" },
  { bg: "rgba(76,175,125,0.15)", border: "rgba(76,175,125,0.3)", text: "var(--pp-green)" },
  { bg: "rgba(217,122,176,0.15)", border: "rgba(217,122,176,0.3)", text: "#d97ab0" },
  { bg: "rgba(180,123,93,0.15)", border: "rgba(180,123,93,0.3)", text: "#b47b5d" },
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function avatarPalette(id: string) {
  return AVATAR_PALETTES[id.charCodeAt(Math.max(id.length - 1, 0)) % AVATAR_PALETTES.length];
}

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export default function StaffPage() {
  const [tab, setTab] = useState<Tab>("staff");
  const [selected, setSelected] = useState<StaffProfileData | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [editingStaff, setEditingStaff] = useState<StaffProfileData | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [shiftStaff, setShiftStaff] = useState<StaffProfileData | null>(null);

  const monday = getMondayOfWeek(weekOffset);
  const { staff, loading: staffLoading, error: staffError, refresh: refreshStaff } = useStaff();
  const { shifts, loading: shiftsLoading, error: shiftsError, refresh: refreshShifts } = useWeekShifts(monday);
  const { requests, loading: leaveLoading, error: leaveError, refresh: refreshLeave } = useLeaveRequests();

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((member) => {
      return (
        member.full_name.toLowerCase().includes(query) ||
        member.role_title.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.phone ?? "").toLowerCase().includes(query)
      );
    });
  }, [staff, staffSearch]);

  const counts = useMemo(() => ({
    total: staff.length,
    fullTime: staff.filter((member) => member.employment_type === "full_time").length,
    partTime: staff.filter((member) => member.employment_type === "part_time").length,
    contract: staff.filter((member) => member.employment_type === "contract").length,
    active: staff.filter((member) => member.is_active !== false).length,
  }), [staff]);

  const activeStaff = useMemo(() => staff.filter((member) => member.is_active !== false), [staff]);
  const pendingLeave = requests.filter((request) => request.status === "pending").length;

  function handleExport() {
    if (tab === "staff") {
      downloadCsv("staff.csv", filteredStaff.map((member) => ({
        Name: member.full_name,
        Role: member.role_title,
        EmploymentType: member.employment_type,
        Email: member.email,
        Phone: member.phone ?? "",
        BaseSalary: member.base_salary ?? "",
        DailyRate: member.daily_rate ?? "",
        Active: member.is_active !== false,
      })));
      return;
    }
    if (tab === "schedule") {
      downloadCsv("staff-shifts.csv", (shifts ?? []).map((shift) => ({
        StaffId: shift.staff_id,
        ShiftDate: shift.shift_date,
        StartTime: shift.start_time,
        EndTime: shift.end_time ?? "",
        Type: shift.type ?? "",
        Status: shift.status ?? "",
        BookingId: shift.booking_id ?? "",
        Location: shift.location ?? "",
      })));
      return;
    }
    downloadCsv("leave-requests.csv", requests.map((request) => ({
      Staff: request.staff_name ?? "",
      Type: request.type ?? "",
      StartDate: request.start_date ?? "",
      EndDate: request.end_date ?? "",
      DaysRequested: request.days_requested ?? "",
      Status: request.status ?? "",
    })));
  }

  function openPrimaryModal() {
    if (tab === "staff") {
      setModal("staff");
      return;
    }
    if (tab === "schedule") {
      setShiftStaff(activeStaff[0] ?? null);
      setModal("shift");
      return;
    }
    setModal("leave");
  }

  function closeModal() {
    setModal(null);
    setShiftStaff(null);
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Field Workforce</span>
          <h1 className="pp-page-title">Staff</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Coordinate decorators, operators, and support crew with one view of staffing, schedules, leave risk, and profile readiness before event week gets busy.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{counts.total} staff records</span>
            <span>{counts.active} active team members</span>
            <span>{pendingLeave} pending leave requests</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>Export CSV</button>
          <button className="pp-btn pp-btn-primary" onClick={openPrimaryModal}>
            {tab === "staff" ? "Add Staff" : tab === "schedule" ? "Assign Shift" : "Request Leave"}
          </button>
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
      </div>

      {tab === "staff" && (
        <StaffTab
          staff={filteredStaff}
          loading={staffLoading}
          error={staffError}
          search={staffSearch}
          onSearch={setStaffSearch}
          selected={selected}
          onSelect={(member) => setSelected((current) => current?.id === member.id ? null : member)}
          onAssignShift={(member) => {
            setShiftStaff(member);
            setModal("shift");
          }}
          onEdit={(member) => setEditingStaff(member)}
        />
      )}

      {tab === "schedule" && (
        <ScheduleTab
          staff={activeStaff}
          shifts={shifts}
          loading={shiftsLoading}
          error={shiftsError}
          weekDates={getWeekDates(monday)}
          onPrev={() => setWeekOffset((value) => value - 1)}
          onNext={() => setWeekOffset((value) => value + 1)}
          onToday={() => setWeekOffset(0)}
        />
      )}

      {tab === "leave" && (
        <LeaveTab
          requests={requests}
          loading={leaveLoading}
          error={leaveError}
          onRefresh={refreshLeave}
        />
      )}

      {selected && tab === "staff" && (
        <StaffDetailPanel
          staff={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setEditingStaff(selected)}
          onAssignShift={() => {
            setShiftStaff(selected);
            setModal("shift");
          }}
        />
      )}

      {modal === "staff" && (
        <AddStaffModal
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            setSelected(null);
            void refreshStaff();
          }}
        />
      )}

      {modal === "shift" && (
        <AddShiftModal
          staff={activeStaff}
          initialStaffId={shiftStaff?.id}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            void refreshShifts();
          }}
        />
      )}

      {modal === "leave" && (
        <RequestLeaveModal
          staff={activeStaff}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            void refreshLeave();
          }}
        />
      )}

      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSaved={(updated) => {
            setEditingStaff(null);
            setSelected(updated);
            void refreshStaff();
          }}
        />
      )}
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

function StaffTab({
  staff,
  loading,
  error,
  search,
  onSearch,
  selected,
  onSelect,
  onAssignShift,
  onEdit,
}: {
  staff: StaffProfileData[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  selected: StaffProfileData | null;
  onSelect: (member: StaffProfileData) => void;
  onAssignShift: (member: StaffProfileData) => void;
  onEdit: (member: StaffProfileData) => void;
}) {
  return (
    <div style={{ display: "flex", overflow: "hidden", flex: 1 }}>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
        <div className="pp-filter-bar" style={{ marginBottom: 18 }}>
          <div className="pp-search-wrap">
            <SearchIcon />
            <input
              className="pp-search-input" aria-label="Search"
              placeholder="Search staff by name, role, email, or phone"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
          </div>
        </div>

        {error && <div className="pp-alert pp-alert-error">{error}</div>}
        {loading ? (
          <div className="pp-staff-grid">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 176, borderRadius: "var(--pp-radius)" }} />)}</div>
        ) : staff.length === 0 ? (
          <div className="pp-card" style={{ padding: 28, textAlign: "center", color: "var(--pp-text-3)" }}>No staff records match the current search.</div>
        ) : (
          <div className="pp-staff-grid">
            {staff.map((member) => {
              const palette = avatarPalette(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  className={cn("pp-staff-card", selected?.id === member.id && "pp-staff-card--selected")}
                  onClick={() => onSelect(member)}
                  style={{
                    position: "relative",
                    textAlign: "left",
                    background: "var(--pp-panel)",
                    border: selected?.id === member.id ? "2px solid var(--pp-green)" : "1px solid var(--pp-border)",
                    boxShadow: selected?.id === member.id ? "0 10px 32px rgba(76,175,125,0.13)" : "0 3px 10px rgba(15,23,42,0.04)",
                    transition: "box-shadow 0.18s, border-color 0.18s, transform 0.18s",
                  }}
                >
                  <span style={{ position: "absolute", top: 14, right: 14 }} className={`pp-badge ${EMP_BADGE[member.employment_type] ?? "pp-badge-neutral"}`}>
                    {EMP_LABEL[member.employment_type] ?? member.employment_type}
                  </span>
                  <div className="pp-client-av pp-client-av--lg" style={{ background: palette.bg, borderColor: palette.border, color: palette.text, width: 56, height: 56, fontSize: 22, marginBottom: 14 }}>
                    {member.initials}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--pp-text)" }}>{member.full_name}</div>
                  <div style={{ marginTop: 4, fontSize: 13.5, color: "var(--pp-text-2)" }}>{member.role_title}</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 5, fontSize: 12.5, color: "var(--pp-text-3)" }}>
                    <span>{member.email || "No email on file"}</span>
                    <span>{member.phone || "No phone on file"}</span>
                    <span>{member.base_salary ? `${formatCurrency(member.base_salary, { showEmpty: true })} / mo` : member.daily_rate ? `${formatCurrency(member.daily_rate, { showEmpty: true })} / day` : "Pay rate not set"}</span>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: member.is_active !== false ? "var(--pp-green)" : "var(--pp-text-3)" }} />
                      <span style={{ color: "var(--pp-text-3)" }}>{member.is_active !== false ? "Active" : "Inactive"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }} onClick={(event) => event.stopPropagation()}>
                      <button type="button" className="pp-btn pp-btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => onAssignShift(member)}>Assign Shift</button>
                      <button type="button" className="pp-btn pp-btn-primary" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => onEdit(member)}>Edit</button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffDetailPanel({
  staff,
  onClose,
  onEdit,
  onAssignShift,
}: {
  staff: StaffProfileData;
  onClose: () => void;
  onEdit: () => void;
  onAssignShift: () => void;
}) {
  const palette = avatarPalette(staff.id);

  return (
    <div className="pp-detail-panel">
      <div className="pp-dp-header">
        <button className="pp-dp-close" onClick={onClose}><CloseIcon /></button>
        <div className="pp-dp-av" style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}>{staff.initials}</div>
        <h2 className="pp-dp-name">{staff.full_name}</h2>
        <div style={{ fontSize: 12, color: "var(--pp-text-3)", marginBottom: 8 }}>{staff.role_title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className={`pp-badge ${EMP_BADGE[staff.employment_type] ?? "pp-badge-neutral"}`}>{EMP_LABEL[staff.employment_type] ?? staff.employment_type}</span>
          {staff.is_active === false && <span className="pp-badge pp-badge-red">Inactive</span>}
        </div>
        <div className="pp-dp-actions" style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="pp-btn pp-btn-primary" style={{ fontSize: 12 }} onClick={onAssignShift}>Assign Shift</button>
          <button className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }} onClick={onEdit}>Edit Profile</button>
          <Link href={`/staff/${staff.id}`} className="pp-btn pp-btn-ghost" style={{ fontSize: 12 }}>Full Profile</Link>
        </div>
      </div>
      <div className="pp-dp-body">
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">Contact & Pay</span></div>
          <DpField label="Email" value={staff.email || "Not provided"} />
          <DpField label="Phone" value={staff.phone || "Not provided"} />
          <DpField label="Salary" value={staff.base_salary ? `${formatCurrency(staff.base_salary, { showEmpty: true })} / mo` : "-"} />
          <DpField label="Day rate" value={staff.daily_rate ? `${formatCurrency(staff.daily_rate, { showEmpty: true })} / day` : "-"} />
          <DpField label="Hired" value={staff.hired_at ? formatDate(staff.hired_at) : "-"} />
        </div>
        <div className="pp-dp-section">
          <div className="pp-dp-section-header"><span className="pp-dp-section-title">HR Readiness</span></div>
          <p style={{ padding: "10px 18px", fontSize: 12, color: "var(--pp-text-3)", lineHeight: 1.5 }}>
            Keep contact details, pay setup, and activity status current here so scheduling and payroll decisions stay grounded in the same record.
          </p>
        </div>
      </div>
    </div>
  );
}

function ScheduleTab({
  staff,
  shifts,
  loading,
  error,
  weekDates,
  onPrev,
  onNext,
  onToday,
}: {
  staff: StaffProfileData[];
  shifts: ShiftData[];
  loading: boolean;
  error: string | null;
  weekDates: Date[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const today = new Date();
  const shiftsByStaffDay: Record<string, Record<number, ShiftData[]>> = {};
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
        <button className="pp-btn pp-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={onPrev}>Prev</button>
        <h2 style={{ fontFamily: "var(--pp-font-display)", fontSize: 15, fontWeight: 700, color: "var(--pp-text)", letterSpacing: "-0.02em", flex: 1 }}>
          Week of {formatDate(weekDates[0]?.toISOString().split("T")[0], "short")} to {formatDate(weekDates[6]?.toISOString().split("T")[0], "short")}
        </h2>
        <button className="pp-btn pp-btn-ghost" style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }} onClick={onNext}>Next</button>
        <button className="pp-btn pp-btn-ghost" onClick={onToday}>Today</button>
      </div>
      {error && <div className="pp-alert pp-alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="pp-card" style={{ padding: 0, overflowX: "auto" }}>
        <div style={{ minWidth: 920 }}>
          <div style={{ display: "grid", gridTemplateColumns: "170px repeat(7,1fr)", borderBottom: "1px solid var(--pp-border)" }}>
            <div style={{ padding: "10px 12px", fontSize: 10, color: "var(--pp-text-3)", borderRight: "1px solid var(--pp-border)" }} />
            {weekDates.map((date, index) => {
              const isToday = date.toDateString() === today.toDateString();
              return (
                <div
                  key={index}
                  style={{
                    padding: "10px 12px",
                    textAlign: "center",
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: isToday ? "var(--pp-gold)" : "var(--pp-text-3)",
                    background: isToday ? "rgba(245,200,66,0.08)" : undefined,
                    borderRight: index < 6 ? "1px solid var(--pp-border)" : undefined,
                  }}
                >
                  {WEEK_DAYS[index]} {date.getDate()}
                </div>
              );
            })}
          </div>
          {loading ? (
            Array.from({ length: 5 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 58, margin: "1px 0" }} />)
          ) : staff.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--pp-text-3)" }}>No active staff available for scheduling.</p>
          ) : staff.map((member, rowIndex) => {
            const palette = avatarPalette(member.id);
            const staffShifts = shiftsByStaffDay[member.id] ?? {};
            return (
              <div key={member.id} style={{ display: "grid", gridTemplateColumns: "170px repeat(7,1fr)", borderBottom: rowIndex < staff.length - 1 ? "1px solid var(--pp-border)" : undefined }}>
                <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderRight: "1px solid var(--pp-border)" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: palette.bg, borderColor: palette.border, color: palette.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, border: "1.5px solid" }}>{member.initials}</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pp-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.full_name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--pp-text-3)" }}>{member.role_title}</div>
                  </div>
                </div>
                {weekDates.map((date, dayIndex) => {
                  const isToday = date.toDateString() === today.toDateString();
                  const dayShifts = staffShifts[dayIndex] ?? [];
                  return (
                    <div key={dayIndex} style={{ padding: 6, minHeight: 58, background: isToday ? "rgba(245,200,66,0.03)" : undefined, borderRight: dayIndex < 6 ? "1px solid var(--pp-border)" : undefined }}>
                      {dayShifts.map((shift) => (
                        <div key={shift.id} className={`pp-shift-pill pp-shift-pill--${shift.type ?? "event"}`} title={`${shift.start_time}${shift.end_time ? ` - ${shift.end_time}` : ""}${shift.location ? ` | ${shift.location}` : ""}`}>
                          {shift.type === "event" ? "Event" : shift.type === "prep" ? "Prep" : shift.type ?? "Shift"}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LeaveTab({
  requests,
  loading,
  error,
  onRefresh,
}: {
  requests: LeaveRequestData[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  async function handleReview(id: string, status: "approved" | "declined") {
    try {
      await reviewLeaveRequest(id, status);
      await onRefresh();
    } catch {
      // keep UI stable
    }
  }

  return (
    <div style={{ padding: "20px 22px" }}>
      {error && <div className="pp-alert pp-alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="pp-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 52, margin: "1px 0" }} />)
        ) : requests.length === 0 ? (
          <p style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--pp-text-3)" }}>No leave requests yet.</p>
        ) : (
          <table className="pp-table">
            <thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th /></tr></thead>
            <tbody>
              {requests.map((request) => {
                const palette = avatarPalette(request.staff_id);
                return (
                  <tr key={request.id} className="pp-tr-clickable">
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: palette.bg, borderColor: palette.border, color: palette.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, border: "1.5px solid" }}>{request.staff_initials}</div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pp-text)" }}>{request.staff_name ?? "Staff"}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--pp-text-2)" }}>{LEAVE_LABELS[request.type] ?? request.type}</td>
                    <td style={{ color: "var(--pp-text-2)" }}>{formatDate(request.start_date, "short")}{request.start_date !== request.end_date ? ` - ${formatDate(request.end_date, "short")}` : ""}</td>
                    <td style={{ fontWeight: 500, color: "var(--pp-text)" }}>{request.days_requested}</td>
                    <td><span className={`pp-badge ${request.status === "approved" ? "pp-badge-green" : request.status === "declined" ? "pp-badge-red" : "pp-badge-gold"}`}>{request.status.charAt(0).toUpperCase() + request.status.slice(1)}</span></td>
                    <td>
                      {request.status === "pending" && (
                        <div style={{ display: "flex", gap: 4 }} onClick={(event) => event.stopPropagation()}>
                          <button style={{ padding: "4px 10px", background: "rgba(76,175,125,0.1)", border: "1px solid rgba(76,175,125,0.2)", borderRadius: "var(--pp-radius-sm)", fontSize: 11.5, color: "var(--pp-green)", cursor: "pointer" }} onClick={() => handleReview(request.id, "approved")}>Approve</button>
                          <button style={{ padding: "4px 10px", background: "rgba(224,90,74,0.08)", border: "1px solid rgba(224,90,74,0.15)", borderRadius: "var(--pp-radius-sm)", fontSize: 11.5, color: "var(--pp-red)", cursor: "pointer" }} onClick={() => handleReview(request.id, "declined")}>Decline</button>
                        </div>
                      )}
                    </td>
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
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.first_name || !form.last_name || !form.role_title || !form.email) {
      setError("Name, email, and role are required");
      return;
    }
    setSaving(true);
    try {
      const created = await createStaffMember({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        role_title: form.role_title,
        employment_type: form.employment_type,
        phone: form.phone || undefined,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : undefined,
        daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : undefined,
      });
      if (created.setup_url) {
        setSaving(false);
        setSetupUrl(created.setup_url);
        return;
      }
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  if (setupUrl) {
    return (
      <ModalOverlay onClose={onSaved}>
        <div className="pp-modal">
          <div className="pp-modal-header"><span className="pp-modal-title">Staff member added</span></div>
          <div className="pp-modal-body">
            <p>The invite email could not be sent. Share this link so they can set a password. It works once and expires in 48 hours.</p>
            <input className="pp-input" readOnly value={setupUrl} onFocus={(event) => event.target.select()} aria-label="Password setup link" />
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-primary" onClick={onSaved}>Done</button></div>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Add Staff Member</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="first-name-1">First name <span className="pp-required">*</span></label><input id="first-name-1" className="pp-input" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} autoFocus /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="last-name-1">Last name <span className="pp-required">*</span></label><input id="last-name-1" className="pp-input" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} /></div>
            </div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="email-1">Email <span className="pp-required">*</span></label><input id="email-1" className="pp-input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="role-1">Role <span className="pp-required">*</span></label><input id="role-1" className="pp-input" value={form.role_title} onChange={(event) => setForm((current) => ({ ...current, role_title: event.target.value }))} /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="employment-type-1">Employment type</label><select id="employment-type-1" className="pp-input" value={form.employment_type} onChange={(event) => setForm((current) => ({ ...current, employment_type: event.target.value }))}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option></select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="phone-1">Phone</label><input id="phone-1" className="pp-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="salary-ghs-mo-1">Salary (GHS/mo)</label><input id="salary-ghs-mo-1" className="pp-input" type="number" value={form.base_salary} onChange={(event) => setForm((current) => ({ ...current, base_salary: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="daily-rate-ghs-1">Daily rate (GHS)</label><input id="daily-rate-ghs-1" className="pp-input" type="number" value={form.daily_rate} onChange={(event) => setForm((current) => ({ ...current, daily_rate: event.target.value }))} /></div>
            </div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Adding..." : "Add Staff Member"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function EditStaffModal({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffProfileData;
  onClose: () => void;
  onSaved: (staff: StaffProfileData) => void;
}) {
  const [form, setForm] = useState({
    role_title: staff.role_title,
    employment_type: staff.employment_type,
    phone: staff.phone ?? "",
    emergency_contact: staff.emergency_contact ?? "",
    emergency_phone: staff.emergency_phone ?? "",
    base_salary: staff.base_salary?.toString() ?? "",
    daily_rate: staff.daily_rate?.toString() ?? "",
    is_active: staff.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.role_title.trim()) {
      setError("Role is required");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateStaffMember(staff.id, {
        role_title: form.role_title.trim(),
        employment_type: form.employment_type,
        phone: form.phone.trim() || undefined,
        emergency_contact: form.emergency_contact.trim() || undefined,
        emergency_phone: form.emergency_phone.trim() || undefined,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : undefined,
        daily_rate: form.daily_rate ? parseFloat(form.daily_rate) : undefined,
        is_active: form.is_active,
      });
      onSaved({ ...updated, email: updated.email || staff.email, full_name: updated.full_name || staff.full_name, initials: updated.initials || staff.initials });
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Edit Staff Profile</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label" htmlFor="role-2">Role <span className="pp-required">*</span></label><input id="role-2" className="pp-input" value={form.role_title} onChange={(event) => setForm((current) => ({ ...current, role_title: event.target.value }))} autoFocus /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="employment-type-2">Employment type</label><select id="employment-type-2" className="pp-input" value={form.employment_type} onChange={(event) => setForm((current) => ({ ...current, employment_type: event.target.value as EmploymentType }))}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option></select></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="phone-2">Phone</label><input id="phone-2" className="pp-input" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="status-1">Status</label><select id="status-1" className="pp-input" value={form.is_active ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            </div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="emergency-contact-1">Emergency contact</label><input id="emergency-contact-1" className="pp-input" value={form.emergency_contact} onChange={(event) => setForm((current) => ({ ...current, emergency_contact: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="emergency-phone-1">Emergency phone</label><input id="emergency-phone-1" className="pp-input" value={form.emergency_phone} onChange={(event) => setForm((current) => ({ ...current, emergency_phone: event.target.value }))} /></div>
            </div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="salary-ghs-mo-2">Salary (GHS/mo)</label><input id="salary-ghs-mo-2" className="pp-input" type="number" value={form.base_salary} onChange={(event) => setForm((current) => ({ ...current, base_salary: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="daily-rate-ghs-2">Daily rate (GHS)</label><input id="daily-rate-ghs-2" className="pp-input" type="number" value={form.daily_rate} onChange={(event) => setForm((current) => ({ ...current, daily_rate: event.target.value }))} /></div>
            </div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Saving..." : "Save Changes"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function AddShiftModal({ staff, initialStaffId, onClose, onSaved }: { staff: StaffProfileData[]; initialStaffId?: string | null; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState({ staff_id: initialStaffId ?? staff[0]?.id ?? "", type: "event", shift_date: "", start_time: "08:00", end_time: "18:00", booking_id: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.staff_id || !form.shift_date) {
      setError("Staff member and date are required");
      return;
    }
    if (form.booking_id.trim() && !isUuid(form.booking_id)) {
      setError("Booking ID must be a valid ID if provided");
      return;
    }
    setSaving(true);
    try {
      await createShift({ staff_id: form.staff_id, type: form.type, shift_date: form.shift_date, start_time: form.start_time, end_time: form.end_time || undefined, booking_id: form.booking_id.trim() || undefined, location: form.location || undefined });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Assign Shift</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label" htmlFor="staff-member-1">Staff member <span className="pp-required">*</span></label><select id="staff-member-1" className="pp-input" value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))}>{staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="shift-type-1">Shift type</label><select id="shift-type-1" className="pp-input" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="event">Event</option><option value="prep">Prep / setup</option><option value="training">Training</option><option value="admin">Admin</option></select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="date-1">Date <span className="pp-required">*</span></label><input id="date-1" className="pp-input" type="date" value={form.shift_date} onChange={(event) => setForm((current) => ({ ...current, shift_date: event.target.value }))} /></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="start-time-1">Start time</label><input id="start-time-1" className="pp-input" type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="end-time-1">End time</label><input id="end-time-1" className="pp-input" type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} /></div>
            </div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="booking-id-1">Booking ID</label><input id="booking-id-1" className="pp-input" placeholder="Optional link to a booking record" value={form.booking_id} onChange={(event) => setForm((current) => ({ ...current, booking_id: event.target.value }))} /></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="location-1">Location</label><input id="location-1" className="pp-input" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} /></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Assigning..." : "Assign Shift"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function RequestLeaveModal({ staff, onClose, onSaved }: { staff: StaffProfileData[]; onClose: () => void; onSaved: () => void; }) {
  const [form, setForm] = useState({ staff_id: staff[0]?.id ?? "", type: "annual", start_date: "", end_date: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.staff_id || !form.start_date || !form.end_date) {
      setError("Staff member, start date, and end date are required");
      return;
    }
    if (form.end_date < form.start_date) {
      setError("End date cannot be before the start date");
      return;
    }
    setSaving(true);
    try {
      await createLeaveRequest({ staff_id: form.staff_id, type: form.type, start_date: form.start_date, end_date: form.end_date, reason: form.reason.trim() || undefined });
      onSaved();
    } catch (err) {
      setError(normaliseError(err).message);
      setSaving(false);
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="pp-modal">
        <div className="pp-modal-header"><span className="pp-modal-title">Request Leave</span><button className="pp-dp-close" style={{ position: "static" }} onClick={onClose}><CloseIcon /></button></div>
        <form onSubmit={handleSave}>
          <div className="pp-modal-body">
            {error && <div className="pp-field-error">{error}</div>}
            <div className="pp-field"><label className="pp-field-label" htmlFor="staff-member-2">Staff member <span className="pp-required">*</span></label><select id="staff-member-2" className="pp-input" value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))}>{staff.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="leave-type-1">Leave type</label><select id="leave-type-1" className="pp-input" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="annual">Annual leave</option><option value="sick">Sick leave</option><option value="personal">Personal leave</option><option value="unpaid">Unpaid leave</option></select></div>
            <div className="pp-row-2">
              <div className="pp-field"><label className="pp-field-label" htmlFor="start-date-1">Start date <span className="pp-required">*</span></label><input id="start-date-1" className="pp-input" type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></div>
              <div className="pp-field"><label className="pp-field-label" htmlFor="end-date-1">End date <span className="pp-required">*</span></label><input id="end-date-1" className="pp-input" type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} /></div>
            </div>
            <div className="pp-field"><label className="pp-field-label" htmlFor="reason-1">Reason</label><textarea id="reason-1" className="pp-input" rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} style={{ resize: "none" }} /></div>
          </div>
          <div className="pp-modal-footer"><button type="button" className="pp-btn pp-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button><button type="submit" className={cn("pp-btn pp-btn-primary", saving && "pp-btn--loading")} style={{ flex: 2, justifyContent: "center" }} disabled={saving}><span>{saving ? "Saving..." : "Submit Leave Request"}</span></button></div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function DpField({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 18px", fontSize: 12.5 }}><span style={{ color: "var(--pp-text-3)" }}>{label}</span><span style={{ color: "var(--pp-text)", fontSize: 12, textAlign: "right" }}>{value}</span></div>;
}

const SearchIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
const CloseIcon = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
