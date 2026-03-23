/**
 * lib/pdf.ts
 * ──────────────────────────────────────────────────────────────
 * Utilities for downloading PDFs from the API.
 *
 * Usage:
 *   import { downloadInvoicePDF, downloadContractPDF } from "@/lib/pdf";
 *
 *   // In a button onClick:
 *   await downloadInvoicePDF(invoice.id, invoice.reference);
 */

import api from "@/lib/api";

/**
 * Fetch an invoice PDF from the API and trigger a browser download.
 */
export async function downloadInvoicePDF(
  invoiceId: string,
  reference: string
): Promise<void> {
  try {
    const response = await api.get(`/pdfs/invoices/${invoiceId}`, {
      responseType: "blob",
    });

    triggerDownload(response.data, `Invoice-${reference}.pdf`, "application/pdf");
  } catch (err) {
    console.error("Failed to download invoice PDF:", err);
    throw err;
  }
}

/**
 * Fetch a contract PDF from the API and trigger a browser download.
 */
export async function downloadContractPDF(
  contractId: string,
  reference: string
): Promise<void> {
  try {
    const response = await api.get(`/pdfs/contracts/${contractId}`, {
      responseType: "blob",
    });

    triggerDownload(response.data, `Contract-${reference}.pdf`, "application/pdf");
  } catch (err) {
    console.error("Failed to download contract PDF:", err);
    throw err;
  }
}

/**
 * Create a temporary <a> element and click it to trigger a browser download.
 * Works with Blob data from Axios.
 */
function triggerDownload(data: Blob, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");

  a.href     = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  // Clean up
  requestAnimationFrame(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}
