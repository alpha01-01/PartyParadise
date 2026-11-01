import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { pesewasToAmount, signInternalPayment } from "@/lib/internalSignature";

// ─── Paystack event shapes ────────────────────────────────────
interface PaystackChargeData {
  id: number;
  reference: string;
  amount: number;           // pesewas — divide by 100 for GHS
  currency: string;
  status: "success" | "failed" | "abandoned";
  paid_at: string;
  channel: string;
  metadata: {
    invoice_id?: string;
    booking_id?: string;
    client_id?: string;
    custom_fields?: Array<{ variable_name: string; value: string }>;
  };
  customer: {
    email: string;
    phone: string | null;
  };
  authorization: {
    authorization_code: string;
    channel: string;
    bank: string | null;
    brand: string | null;
    last4: string | null;
    mobile_money_number: string | null;
  };
}

interface PaystackEvent {
  event: string;
  data: PaystackChargeData;
}

// ─── Verify Paystack HMAC-SHA512 ──────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[paystack] PAYSTACK_SECRET_KEY not set");
    return false;
  }
  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature.padEnd(expected.length, "0"), "hex").slice(0, expected.length / 2 * 2)
    );
  } catch {
    // timingSafeEqual throws if lengths differ
    return false;
  }
}

// ─── Map Paystack channel → our PaymentMethod ─────────────────
function mapChannel(
  channel: string,
  auth: PaystackChargeData["authorization"]
): string {
  if (channel === "mobile_money") {
    const bank = (auth.bank ?? "").toLowerCase();
    if (bank.includes("mtn"))                                     return "momo_mtn";
    if (bank.includes("vodafone"))                                return "momo_vodafone";
    if (bank.includes("airteltigo") || bank.includes("airtel"))   return "momo_airteltigo";
    return "momo_mtn";
  }
  if (channel === "card")  return "paystack";
  if (channel === "bank")  return "bank_transfer";
  return "paystack";
}

// ─── Extract invoice_id from Paystack metadata ────────────────
function extractInvoiceId(data: PaystackChargeData): string | null {
  if (data.metadata?.invoice_id) return data.metadata.invoice_id;
  const field = (data.metadata?.custom_fields ?? []).find(
    (f) => f.variable_name === "invoice_id"
  );
  return field?.value ?? null;
}

// ─── Main handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Must read raw body BEFORE any parsing — needed for signature check
  const rawBody = await req.text();

  // 1. Verify signature
  const signature = req.headers.get("x-paystack-signature") ?? "";
  if (!verifySignature(rawBody, signature)) {
    console.warn("[paystack] Rejected: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse
  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  console.log(`[paystack] ${event.event}`, {
    ref:    event.data?.reference,
    amount: event.data?.amount,
  });

  // 3. Respond 200 immediately — Paystack retries if we take > 5s
  //    Processing continues after we've already committed to returning 200.
  handleEvent(event).catch((err) =>
    console.error("[paystack] Async handler error:", err)
  );

  return NextResponse.json({ received: true }, { status: 200 });
}

async function handleEvent(event: PaystackEvent): Promise<void> {
  switch (event.event) {
    case "charge.success":
      await handleChargeSuccess(event.data);
      break;

    case "charge.failed":
      console.log("[paystack] charge.failed — no action needed", {
        ref: event.data.reference,
      });
      break;

    case "transfer.success":
    case "transfer.failed":
    case "transfer.reversed":
      // Outbound transfers (payouts) — handle when payroll is built
      console.log(`[paystack] transfer event: ${event.event} — not handled`);
      break;

    default:
      console.log(`[paystack] Unhandled event: ${event.event}`);
  }
}

async function handleChargeSuccess(data: PaystackChargeData): Promise<void> {
  const apiBase =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

  if (!apiBase) {
    console.error("[paystack] INTERNAL_API_URL not configured");
    return;
  }

  const invoiceId = extractInvoiceId(data);

  if (!invoiceId) {
    // Payment received but not linked to an invoice.
    // Could be a standalone link — log and skip.
    console.warn("[paystack] charge.success: no invoice_id in metadata", {
      ref: data.reference,
      customer: data.customer.email,
    });
    return;
  }

  const amountGHS = pesewasToAmount(data.amount);
  const method    = mapChannel(data.channel, data.authorization);

  // POST to FastAPI backend.
  // The backend's recordPayment() handler will:
  //   1. Lock the invoice row (SELECT FOR UPDATE)
  //   2. Add the payment record
  //   3. Update invoice.amount_paid
  //   4. Flip invoice.status to "paid" or "partial"
  //   5. Write a journal entry (income side)
  //   6. Trigger portal notification for the client
  //   All in a single atomic transaction.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Source":     "paystack-webhook",
  };

  // Sign the internal request. The API rejects anything unsigned, so a
  // missing secret means the payment cannot be recorded.
  const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!internalSecret) {
    console.error("[paystack] INTERNAL_WEBHOOK_SECRET not configured", { invoiceId });
    return;
  }
  const ts  = Date.now().toString();
  headers["X-Internal-Timestamp"] = ts;
  headers["X-Internal-Signature"] = signInternalPayment(internalSecret, ts, invoiceId, amountGHS);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await fetch(`${apiBase}/invoices/${invoiceId}/payments`, {
        method:  "POST",
        headers,
        body: JSON.stringify({
          amount:       amountGHS,
          method,
          paid_at:      data.paid_at.split("T")[0],
          provider_ref: data.reference,  // authorization_code repeats for saved cards
          notes:        `Paystack auto — ${data.channel} — ref: ${data.reference}`,
        }),
      });

      if (res.status === 409) {
        // Payment already recorded (duplicate webhook delivery)
        console.log("[paystack] Duplicate webhook — payment already exists", {
          invoiceId,
          ref: data.reference,
        });
        return;
      }

      if (!res.ok) {
        const body = await res.text();
        console.error("[paystack] API returned error", {
          invoiceId,
          status:   res.status,
          body,
          attempt:  attempts,
        });
        if (attempts < maxAttempts) {
          // Exponential backoff: 500ms, 1000ms, 2000ms
          await sleep(500 * Math.pow(2, attempts - 1));
          continue;
        }
        return;
      }

      console.log("[paystack] Payment recorded", {
        invoiceId,
        amountGHS,
        method,
        ref: data.reference,
      });
      return;

    } catch (err) {
      console.error("[paystack] Network error on attempt", attempts, err);
      if (attempts < maxAttempts) {
        await sleep(500 * Math.pow(2, attempts - 1));
      }
    }
  }

  console.error("[paystack] All retry attempts exhausted for invoice", invoiceId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Only POST is valid
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
