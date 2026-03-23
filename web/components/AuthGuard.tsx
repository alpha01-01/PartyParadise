// ─────────────────────────────────────────────────────────────
// components/AuthGuard.tsx
// Client-side route protection — wraps the dashboard layout
// ─────────────────────────────────────────────────────────────
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, _hydrateTokens } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    async function hydrate() {
      await _hydrateTokens();
      setHydrated(true);
    }
    hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      const loginUrl = `/login?from=${encodeURIComponent(pathname)}`;
      router.replace(loginUrl);
    }
  }, [hydrated, isAuthenticated, pathname]);

  // Show loading spinner while hydrating
  if (!hydrated || isLoading) {
    return <AuthLoadingScreen />;
  }

  // Not authenticated — don't render children (redirect in effect)
  if (!isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}

function AuthLoadingScreen() {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#0e0d0b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 9,
        background: "#f5c842",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 24px rgba(245,200,66,0.2)",
      }}>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 20,
          fontWeight: 800,
          color: "#0e0d0b",
          lineHeight: 1,
        }}>P</span>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#5c5444",
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// app/layout.tsx — Root layout with auth hydration
// ─────────────────────────────────────────────────────────────
// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PartyParadise",
  description: "Event management system for PartyParadise",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


// ─────────────────────────────────────────────────────────────
// app/(auth)/layout.tsx — Auth pages layout (no sidebar)
// ─────────────────────────────────────────────────────────────
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


// ─────────────────────────────────────────────────────────────
// app/(dashboard)/layout.tsx — Dashboard layout with guard
// Wrap your existing sidebar layout with AuthGuard:
// ─────────────────────────────────────────────────────────────
// Replace the export in your existing layout.tsx with:
//
// export default function DashboardLayout({ children }) {
//   return (
//     <AuthGuard>
//       <YourExistingSidebarLayout>
//         {children}
//       </YourExistingSidebarLayout>
//     </AuthGuard>
//   );
// }
