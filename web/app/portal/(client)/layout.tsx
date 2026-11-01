"use client";

import "../../(dashboard)/dashboard.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearPortalTokens, getPortalRefreshToken, portalApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/portal/dashboard", label: "Overview" },
  { href: "/portal/bookings", label: "Bookings" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/contracts", label: "Contracts" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/notifications", label: "Notifications" },
  { href: "/portal/inquiries", label: "Enquiries" },
  { href: "/portal/account", label: "Account" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    const refreshToken = getPortalRefreshToken();
    if (refreshToken) {
      portalApi.post("/portal/auth/logout", { refresh_token: refreshToken }).catch(() => undefined);
    }
    clearPortalTokens();
    router.replace("/portal/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--pp-bg)", color: "var(--pp-text)" }}>
      <header style={{ borderBottom: "1px solid var(--pp-border)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <strong style={{ marginRight: 12 }}>PartyParadise</strong>
          <nav aria-label="Client portal" className="pp-filter-tabs" style={{ flexWrap: "wrap", flex: 1 }}>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("pp-filter-tab", pathname.startsWith(item.href) && "pp-filter-tab--active")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button type="button" className="pp-btn pp-btn-ghost" onClick={handleLogout}>Log out</button>
        </div>
      </header>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px", display: "grid", gap: 18 }}>
        {children}
      </main>
    </div>
  );
}
