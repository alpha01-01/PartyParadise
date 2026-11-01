import crypto from "crypto";

// Pesewas to a fixed 2dp string, the exact form signed and sent to the API
export function pesewasToAmount(pesewas: number): string {
  return (pesewas / 100).toFixed(2);
}

// Must stay in step with _verify_internal_sig in api/app/routers/webhooks.py
export function signInternalPayment(
  secret: string,
  timestamp: string,
  invoiceId: string,
  amount: string
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${invoiceId}.${amount}`)
    .digest("hex");
}
