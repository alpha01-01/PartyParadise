import type { Metadata } from "next";
import { AuthHydrator } from "@/components/AuthHydrator";

export const metadata: Metadata = {
  title: "PartyParadise",
  description: "Event management system for PartyParadise",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthHydrator />
        {children}
      </body>
    </html>
  );
}
