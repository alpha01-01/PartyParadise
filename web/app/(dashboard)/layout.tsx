"use client"

import "./dashboard.css";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { AuthGuard } from "@/components/AuthGuard";
import { initials } from "@/lib/utils";

// ─── Nav items ───────────────────────────────────────────────
const NAV = [
  {
    group: "Operations",
    items: [
      { href: "/", label: "Dashboard", icon: GridIcon },
      { href: "/bookings", label: "Bookings", icon: CalendarIcon },
      { href: "/clients", label: "Clients", icon: UsersIcon },
      { href: "/contracts", label: "Contracts", icon: FileIcon },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/invoices", label: "Invoices", icon: ReceiptIcon },
      { href: "/expenses", label: "Expenses", icon: WalletIcon },
      { href: "/reports", label: "Reports", icon: ChartIcon },
    ],
  },
  {
    group: "Warehouse",
    items: [
      { href: "/inventory", label: "Inventory", icon: BoxIcon },
      { href: "/equipment", label: "Equipment", icon: CameraIcon },
      { href: "/shop", label: "Shop", icon: StoreIcon },
    ],
  },
  {
    group: "Team",
    items: [
      { href: "/staff", label: "Staff", icon: BadgeIcon },
    ],
  },
];

// ─── Layout ──────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const userName = user?.full_name ?? "Staff Member";
  const userRole = user?.roles?.[0]?.name ?? "staff";
  const userInitials = initials(userName);

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <AuthGuard>
    <>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="pp-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <div className={`pp-shell ${collapsed ? "pp-shell--collapsed" : ""}`}>

        {/* ── Sidebar ── */}
        <aside className={`pp-sidebar ${mobileOpen ? "pp-sidebar--open" : ""}`}>
          {/* Logo */}
          <div className="pp-logo">
            <div className="pp-logo-mark">
              <span>P</span>
            </div>
            {!collapsed && (
              <div className="pp-logo-text">
                <span className="pp-logo-name">Party</span>
                <span className="pp-logo-accent">Paradise</span>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="pp-nav">
            {NAV.map((group) => (
              <div key={group.group} className="pp-nav-group">
                {!collapsed && (
                  <span className="pp-nav-group-label">{group.group}</span>
                )}
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch={false}
                      className={`pp-nav-item ${active ? "pp-nav-item--active" : ""}`}
                      title={collapsed ? label : undefined}
                    >
                      <span className="pp-nav-icon"><Icon /></span>
                      {!collapsed && <span className="pp-nav-label">{label}</span>}
                      {active && !collapsed && <span className="pp-nav-pip" />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom: collapse toggle + user */}
          <div className="pp-sidebar-footer">
            <button
              className="pp-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronIcon flipped={collapsed} />
              {!collapsed && <span>Collapse</span>}
            </button>

            {collapsed && (
              <button className="pp-user-logout" title="Log out" aria-label="Log out" onClick={() => logout()}>
                <LogoutIcon />
              </button>
            )}

            {!collapsed && (
              <div className="pp-user">
                <div className="pp-user-avatar">{userInitials}</div>
                <div className="pp-user-info">
                  <span className="pp-user-name">{userName}</span>
                  <span className="pp-user-role">{userRole}</span>
                </div>
                <button
                  className="pp-user-logout"
                  title="Log out"
                  aria-label="Log out"
                  onClick={() => logout()}
                >
                  <LogoutIcon />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="pp-main">
          {/* Topbar */}
          <header className="pp-topbar">
            {/* Mobile hamburger */}
            <button
              className="pp-hamburger"
              aria-label="Open menu"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <HamburgerIcon />
            </button>

            {/* Breadcrumb */}
            <Breadcrumb pathname={pathname} />

            {/* Right actions */}
            <div className="pp-topbar-actions">
              <Link href="/bookings/new" className="pp-new-booking-btn" prefetch={false}>
                <PlusIcon />
                <span>New Booking</span>
              </Link>
            </div>
          </header>

          {/* Page content */}
          <main className="pp-content">
            {children}
          </main>
        </div>
      </div>
    </>
    </AuthGuard>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────
function Breadcrumb({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return <span className="pp-breadcrumb">Dashboard</span>;
  return (
    <nav className="pp-breadcrumb" aria-label="breadcrumb">
      <Link href="/" className="pp-breadcrumb-home">Dashboard</Link>
      {parts.map((part, i) => (
        <span key={i} className="pp-breadcrumb-item">
          <span className="pp-breadcrumb-sep">/</span>
          <span className={i === parts.length - 1 ? "pp-breadcrumb-current" : ""}>
            {part.charAt(0).toUpperCase() + part.slice(1)}
          </span>
        </span>
      ))}
    </nav>
  );
}

// ─── Icons ────────────────────────────────────────────────────
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/>
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3" width="13" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="4" y="9" width="2" height="2" rx=".5" fill="currentColor"/>
      <rect x="7" y="9" width="2" height="2" rx=".5" fill="currentColor"/>
      <rect x="10" y="9" width="2" height="2" rx=".5" fill="currentColor"/>
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11 7.5c1.1.6 1.8 1.8 1.8 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M13.5 5c.8 0 1.5.7 1.5 1.5S14.3 8 13.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9.5 1.5H4a1.5 1.5 0 00-1.5 1.5v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V5.5L9.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M9.5 1.5V5.5H13.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 1.5v13l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5V1.5H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4.5 4V3a1.5 1.5 0 011.5-1.5h6A1.5 1.5 0 0113.5 3v1" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="11.5" cy="9" r="1.5" fill="currentColor"/>
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12.5l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 5L8 2 2.5 5v6L8 14l5.5-3V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M8 2v12M2.5 5l5.5 3 5.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="8" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 4.5l1-2h3l1 2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 5.5l1.1-3h9.8l1.1 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 5.5h12v2.2A2.3 2.3 0 0111.7 10H4.3A2.3 2.3 0 012 7.7V5.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M3.5 10v3.5h9V10" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6 13.5v-2.3h4v2.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}
function BadgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="4" y="1.5" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2.5 5.5v7A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5v-7" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M6 9h4M6 11.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: flipped ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}>
      <path d="M9 4L5 7l4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5.5 2H3a1.5 1.5 0 00-1.5 1.5v7A1.5 1.5 0 003 12h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M9.5 4.5L12 7l-2.5 2.5M12 7H5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5A4.5 4.5 0 003.5 6v3.5L2 11h12l-1.5-1.5V6A4.5 4.5 0 008 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6.5 11v.5a1.5 1.5 0 003 0V11" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── CSS ──────────────────────────────────────────────────────



