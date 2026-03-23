import type { Metadata } from "next";

// This layout wraps /contracts/sign/[token]
// It is NOT inside (auth) or (dashboard) — it is intentionally public.
// The middleware.ts excludes /contracts/sign/* from auth checks.

export const metadata: Metadata = {
  title: "Sign Contract — PartyParadise",
  description: "Review and sign your PartyParadise service agreement",
};

export default function ContractSignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bare layout — no sidebar, no topbar from the dashboard.
  // The signing page renders its own minimal topbar.
  return <>{children}</>;
}
