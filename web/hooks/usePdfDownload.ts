/**
 * hooks/usePdfDownload.ts
 *
 * Utility hook for downloading PDF files from authenticated API endpoints.
 *
 * Usage:
 *   const { download, loading } = usePdfDownload();
 *   await download(`/pdfs/invoices/${invoiceId}`, `Invoice-${ref}.pdf`);
 *
 * Why not just use an <a href="..."> link?
 * ─────────────────────────────────────────
 * The PDF endpoints require a JWT Authorization header.
 * A plain browser <a href> link won't attach the token.
 * This hook makes a fetch() call with the token in the header,
 * then creates a temporary object URL so the browser downloads it.
 *
 * For unauthenticated endpoints (e.g. public contract signing page),
 * a plain <a href target="_blank"> is fine.
 */

import { useState, useCallback } from "react";
import api from "@/lib/api";

export function usePdfDownload() {
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const download = useCallback(async (
    path: string,
    filename: string
  ): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Use axios which automatically attaches the Authorization header
      const response = await api.get(path, {
        responseType: "blob",
      });

      // Create a temporary object URL and click it
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);

      const link       = document.createElement("a");
      link.href        = url;
      link.download    = filename;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Download failed";
      setError(msg);
      console.error("[usePdfDownload]", msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { download, loading, error };
}
