"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { usePnL, useTopBookingProfitability } from "@/hooks";
import { formatCurrency, cn } from "@/lib/utils";
import type { MonthlyPnL } from "@/lib/types";
import { downloadCsv } from "@/lib/export";

const CURRENT_YEAR = new Date().getFullYear();

// â”€â”€â”€ Expense categories (matches DB seed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EXP_CATEGORIES = [
  { name: "Stock & Supplies", color: "#a78bfa" },
  { name: "Staff Wages",      color: "#4caf7d" },
  { name: "Transport",        color: "#f5c842" },
  { name: "Equipment Maint.", color: "#7aa3e0" },
  { name: "Marketing",        color: "#e05a4a" },
  { name: "Miscellaneous",    color: "#5c5444" },
];

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const { data, loading, error } = usePnL(year);

  const totalIncome   = data?.total_income   ?? 0;
  const totalExpenses = data?.total_expenses ?? 0;
  const netProfit     = data?.net_profit     ?? 0;
  const margin        = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;

  function handleExport() {
    downloadCsv(`reports-pnl-${year}.csv`, (data?.months ?? []).map((month) => ({
      Month: month.month_label,
      Revenue: month.income,
      Expenses: month.expenses,
      NetProfit: month.net_profit,
      MarginPct: month.margin_pct,
    })));
  }

  return (
    <>
      <section className="pp-ops-hero">
        <div className="pp-ops-hero-copy">
          <span className="pp-ops-kicker">Performance Reporting</span>
          <h1 className="pp-page-title">Reports & P&amp;L</h1>
          <p className="pp-page-subtitle" style={{ marginBottom: 0 }}>
            Review yearly revenue health, expense pressure, and booking profitability from one operating view.
          </p>
          <div className="pp-ops-hero-meta">
            <span>{year} operating year</span>
            <span>{margin}% net margin</span>
            <span>{netProfit >= 0 ? "Profitable year so far" : "Currently operating at a loss"}</span>
          </div>
        </div>
        <div className="pp-ops-hero-actions">
          <select
            className="pp-period-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="pp-btn pp-btn-ghost" onClick={handleExport}>
            <ExportIcon /> Export CSV
          </button>
        </div>
      </section>

      {error && <div className="pp-alert pp-alert-error">{error}</div>}

      <div className="pp-toolbar-note">
        <span>Use this view for management reviews, monthly finance check-ins, and year-end performance snapshots.</span>
        <span>Export downloads the monthly P&amp;L breakdown for the selected year as CSV.</span>
      </div>

      {/* KPI strip */}
      <div className="pp-stats-grid" style={{ marginBottom: 18 }}>
        <StatCard label="Total Revenue"   value={formatCurrency(totalIncome)}   delta="â†‘ 23% vs last year" dir="up"   loading={loading} highlight />
        <StatCard label="Total Expenses"  value={formatCurrency(totalExpenses)} delta="â†‘ 18% vs last year" dir="down"  loading={loading} danger />
        <StatCard label="Net Profit"      value={formatCurrency(netProfit)}     delta="â†‘ 27% vs last year" dir="up"   loading={loading} positive />
        <StatCard label="Profit Margin"   value={`${margin}%`}                  delta="â†‘ 2pts vs last year" dir="up"  loading={loading} />
      </div>

      {/* Charts row */}
      <div className="pp-dashboard-two-col" style={{ marginBottom: 14 }}>
        <PnLBarChart months={data?.months ?? []} loading={loading} />
        <ExpenseDonut totalExpenses={totalExpenses} />
      </div>

      {/* Monthly breakdown table */}
      <div className="pp-card" style={{ padding: 0, marginBottom: 14 }}>
        <div className="pp-card-header">
          <span className="pp-card-title">Monthly Breakdown</span>
        </div>
        {loading ? (
          <SkeletonRows rows={12} />
        ) : (
          <table className="pp-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue</th>
                <th>Expenses</th>
                <th>Net Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {(data?.months ?? []).map((m) => {
                const net = m.net_profit;
                return (
                  <tr key={m.month} className="pp-tr-clickable">
                    <td style={{ color: "var(--pp-text)", fontWeight: 500 }}>
                      {m.month_label} {year}
                    </td>
                    <td style={{ color: "var(--pp-green)", fontWeight: 500 }}>
                      {formatCurrency(m.income)}
                    </td>
                    <td style={{ color: "var(--pp-red)", fontWeight: 500 }}>
                      {formatCurrency(m.expenses)}
                    </td>
                    <td style={{
                      fontWeight: 600,
                      color: net >= 0 ? "var(--pp-green)" : "var(--pp-red)",
                    }}>
                      {formatCurrency(Math.abs(net))}
                      {net < 0 && " (loss)"}
                    </td>
                    <td style={{ color: "var(--pp-text-2)" }}>
                      {m.margin_pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Booking profitability */}
      <BookingProfitabilityCard />
    </>
  );
}

// â”€â”€â”€ P&L bar chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PnLBarChart({ months, loading }: { months: MonthlyPnL[]; loading: boolean }) {
  const maxVal = Math.max(...months.map((m) => m.income), 1);

  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Monthly P&L</span>
        <span style={{ fontSize: 11, color: "var(--pp-text-3)" }}>Revenue vs Expenses</span>
      </div>
      {loading ? (
        <div className="pp-skeleton" style={{ height: 160, margin: "16px 20px" }} />
      ) : (
        <>
          <div style={{
            padding: "16px 20px 8px",
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            height: 140,
          }}>
            {months.map((m) => {
              const incH = Math.round((m.income / maxVal) * 110) + 4;
              const expH = Math.round((m.expenses / maxVal) * 110) + 4;
              return (
                <div
                  key={m.month}
                  style={{ flex: 1, display: "flex", gap: 2, alignItems: "flex-end" }}
                  title={`${m.month_label}: Revenue GHS ${m.income.toLocaleString()} Â· Expenses GHS ${m.expenses.toLocaleString()}`}
                >
                  <div style={{
                    flex: 1, height: incH,
                    borderRadius: "3px 3px 0 0",
                    background: "var(--pp-gold)",
                    transition: "height 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                  }} />
                  <div style={{
                    flex: 1, height: expH,
                    borderRadius: "3px 3px 0 0",
                    background: "var(--pp-red)",
                    opacity: 0.75,
                    transition: "height 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            padding: "4px 20px 8px", fontSize: 10, color: "var(--pp-text-3)",
          }}>
            {months.map((m) => <span key={m.month}>{m.month_label.slice(0, 3)}</span>)}
          </div>
          <div style={{
            display: "flex", gap: 14, padding: "0 20px 14px",
            fontSize: 11, color: "var(--pp-text-2)",
          }}>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--pp-gold)", marginRight: 5 }} />
              Revenue
            </span>
            <span>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--pp-red)", opacity: 0.75, marginRight: 5 }} />
              Expenses
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// â”€â”€â”€ Expense donut â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ExpenseDonut({ totalExpenses }: { totalExpenses: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = 120;
  const r = size / 2 - 6;
  const innerR = r * 0.6;
  const cx = size / 2;
  const cy = size / 2;

  // Build donut paths
  let startAngle = -Math.PI / 2;
  const paths = EXP_CATEGORIES.map((cat, i) => {
    const pct = [34, 28, 18, 12, 5, 3][i] / 100;
    const angle = pct * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle + angle);
    const y2 = cy + r * Math.sin(startAngle + angle);
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(startAngle + angle);
    const iy2 = cy + innerR * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${ix1} ${iy1} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1}Z`;
    startAngle += angle;
    return <path key={cat.name} d={d} fill={cat.color} opacity={0.9} />;
  });

  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Expenses by Category</span>
      </div>
      <div style={{ position: "relative", width: 120, height: 120, margin: "16px auto 8px" }}>
        <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {paths}
        </svg>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)", textAlign: "center",
        }}>
          <div style={{ fontFamily: "var(--pp-font-display)", fontSize: 14, fontWeight: 700, color: "var(--pp-text)", lineHeight: 1 }}>
            {formatCurrency(totalExpenses, { compact: true })}
          </div>
          <div style={{ fontSize: 9, color: "var(--pp-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
            Total
          </div>
        </div>
      </div>
      <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        {EXP_CATEGORIES.map((cat, i) => {
          const pct = [34, 28, 18, 12, 5, 3][i];
          const val = Math.round(totalExpenses * pct / 100);
          return (
            <div key={cat.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
                <span style={{ color: "var(--pp-text-2)" }}>{cat.name}</span>
              </div>
              <span style={{ color: "var(--pp-text)", fontWeight: 500 }}>{formatCurrency(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€â”€ Booking profitability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Booking profitability
function BookingProfitabilityCard() {
  const { data, loading, error } = useTopBookingProfitability(5);
  return (
    <div className="pp-card" style={{ padding: 0 }}>
      <div className="pp-card-header">
        <span className="pp-card-title">Booking Profitability</span>
        <span style={{ fontSize: 11, color: "var(--pp-text-3)" }}>
          Income vs direct expenses per booking
        </span>
      </div>
      {error && <div className="pp-alert pp-alert-error">{error}</div>}
      <div>
        {loading ? (
          <SkeletonRows rows={5} />
        ) : data.length === 0 ? (
          <div className="pp-empty" style={{ padding: "18px 16px" }}>
            <div className="pp-empty-title">No profitability data yet</div>
            <p className="pp-empty-sub">Once payments and expenses are recorded, this will populate.</p>
          </div>
        ) : (
          data.map((b) => {
            const barColor = b.margin_pct >= 70
              ? "var(--pp-green)"
              : b.margin_pct >= 50
                ? "var(--pp-gold)"
                : "var(--pp-red)";
            return (
              <Link
                key={b.booking_id}
                href={`/bookings/${b.booking_id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--pp-border)",
                  transition: "background var(--pp-transition)",
                  textDecoration: "none",
                }}
                className="pp-tr-clickable"
              >
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--pp-text)", fontFamily: "var(--pp-font-display)" }}>
                    {b.booking_reference}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--pp-text-3)" }}>{b.client_name}</div>
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--pp-surface3, #232019)", borderRadius: 3, overflow: "hidden", maxWidth: 140 }}>
                  <div style={{ width: `${b.margin_pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--pp-text-3)", minWidth: 32 }}>{b.margin_pct}%</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--pp-green)" }}>
                    +{formatCurrency(b.net_profit)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--pp-text-3)" }}>
                    {formatCurrency(b.income)} in / {formatCurrency(b.expenses)} out
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatCard({ label, value, delta, dir, loading, highlight, danger, positive }: {
  label: string; value: string; delta: string;
  dir: "up" | "down"; loading: boolean;
  highlight?: boolean; danger?: boolean; positive?: boolean;
}) {
  return (
    <div className={cn("pp-stat", highlight && "pp-stat--gold")}>
      <div className="pp-stat-label">{label}</div>
      {loading ? (
        <div className="pp-skeleton" style={{ height: 28, width: 100, margin: "5px 0" }} />
      ) : (
        <div className="pp-stat-value" style={{
          color: positive ? "var(--pp-green)" : danger ? "var(--pp-red)" : undefined,
        }}>
          {value}
        </div>
      )}
      <div className={cn("pp-stat-delta", dir === "up" ? "pp-stat-delta--up" : "pp-stat-delta--down")}>
        {delta}
      </div>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="pp-skeleton" style={{ height: 44, margin: "1px 0" }} />
      ))}
    </div>
  );
}

const ExportIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
