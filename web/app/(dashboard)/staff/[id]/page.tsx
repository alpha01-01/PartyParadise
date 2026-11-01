"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useLeaveRequests, useStaffMember, useStaffSchedule } from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/utils";

function currentMonth() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export default function StaffProfilePage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const month = currentMonth();

  const { staff, loading, error } = useStaffMember(id || null);
  const { shifts, loading: shiftsLoading, error: shiftsError } = useStaffSchedule(id || null, month);
  const { requests, loading: leaveLoading, error: leaveError } = useLeaveRequests({ staff_id: id || undefined });

  const upcomingShifts = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return shifts.filter((shift) => shift.shift_date >= today).slice(0, 6);
  }, [shifts]);

  const approvedLeaveDays = useMemo(() => {
    return requests.filter((request) => request.status === "approved").reduce((sum, request) => sum + request.days_requested, 0);
  }, [requests]);

  return (
    <div style={{ padding: "24px 22px 32px", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--pp-text-3)" }}>Staff Profile</div>
          <h1 className="pp-page-title" style={{ marginTop: 6 }}>{staff?.full_name ?? "Staff profile"}</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Profile details, current month schedule, and leave history for one team member.
          </p>
        </div>
        <Link href="/staff" className="pp-btn pp-btn-ghost">Back to Staff</Link>
      </div>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}
      {shiftsError && <div className="pp-alert pp-alert-error">{shiftsError}</div>}
      {leaveError && <div className="pp-alert pp-alert-error">{leaveError}</div>}

      {loading ? (
        <>
          <div className="pp-skeleton" style={{ height: 180, borderRadius: "var(--pp-radius)" }} />
          <div className="pp-skeleton" style={{ height: 260, borderRadius: "var(--pp-radius)" }} />
        </>
      ) : !staff ? (
        <div className="pp-card" style={{ padding: 28, textAlign: "center", color: "var(--pp-text-3)" }}>Staff member not found.</div>
      ) : (
        <>
          <div className="pp-ops-summary-grid">
            <SummaryCard label="Role" value={staff.role_title} detail={staff.is_active !== false ? "Currently active" : "Marked inactive"} />
            <SummaryCard label="Pay Setup" value={staff.base_salary ? `${formatCurrency(staff.base_salary, { showEmpty: true })} / mo` : staff.daily_rate ? `${formatCurrency(staff.daily_rate, { showEmpty: true })} / day` : "Not set"} detail="Used by payroll and staffing decisions" />
            <SummaryCard label="Upcoming Shifts" value={String(upcomingShifts.length)} detail={`For ${month}`} tone="green" />
            <SummaryCard label="Approved Leave" value={String(approvedLeaveDays)} detail="Days approved on record" tone="gold" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 18 }}>
            <div className="pp-card">
              <div className="pp-section-title" style={{ marginBottom: 12 }}>Profile Details</div>
              <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
                <DetailRow label="Full name" value={staff.full_name} />
                <DetailRow label="Email" value={staff.email || "Not provided"} />
                <DetailRow label="Phone" value={staff.phone || "Not provided"} />
                <DetailRow label="Employment type" value={staff.employment_type.replace(/_/g, " ")} />
                <DetailRow label="Emergency contact" value={staff.emergency_contact || "Not provided"} />
                <DetailRow label="Emergency phone" value={staff.emergency_phone || "Not provided"} />
                <DetailRow label="Hired date" value={staff.hired_at ? formatDate(staff.hired_at) : "Not provided"} />
              </div>
            </div>

            <div className="pp-card">
              <div className="pp-section-title" style={{ marginBottom: 12 }}>Upcoming Shifts</div>
              {shiftsLoading ? (
                Array.from({ length: 4 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 48, marginBottom: 10 }} />)
              ) : upcomingShifts.length === 0 ? (
                <p style={{ color: "var(--pp-text-3)", fontSize: 13 }}>No upcoming shifts scheduled this month.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {upcomingShifts.map((shift) => (
                    <div key={shift.id} style={{ border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                        <strong style={{ color: "var(--pp-text)" }}>{formatDate(shift.shift_date, "short")}</strong>
                        <span style={{ color: "var(--pp-text-3)" }}>{shift.start_time}{shift.end_time ? ` - ${shift.end_time}` : ""}</span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--pp-text-2)" }}>{shift.type} {shift.location ? `| ${shift.location}` : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pp-card">
            <div className="pp-section-title" style={{ marginBottom: 12 }}>Leave History</div>
            {leaveLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div key={index} className="pp-skeleton" style={{ height: 48, marginBottom: 10 }} />)
            ) : requests.length === 0 ? (
              <p style={{ color: "var(--pp-text-3)", fontSize: 13 }}>No leave records found for this staff member.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {requests.slice(0, 8).map((request) => (
                  <div key={request.id} style={{ border: "1px solid var(--pp-border)", borderRadius: "var(--pp-radius-sm)", padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text)" }}>{request.type.replace(/_/g, " ")}</div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--pp-text-3)" }}>{formatDate(request.start_date, "short")} to {formatDate(request.end_date, "short")}</div>
                    </div>
                    <span className={`pp-badge ${request.status === "approved" ? "pp-badge-green" : request.status === "declined" ? "pp-badge-red" : "pp-badge-gold"}`}>{request.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--pp-text-3)" }}>{label}</span>
      <span style={{ color: "var(--pp-text)", textAlign: "right" }}>{value}</span>
    </div>
  );
}
