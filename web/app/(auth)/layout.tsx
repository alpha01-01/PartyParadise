import type { Metadata } from "next";
import "./auth.css";

export const metadata: Metadata = {
  title: "Sign in - PartyParadise",
  description: "Sign in to the PartyParadise event management system",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
