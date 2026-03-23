# Paystack Webhook Setup Guide
# ================================
# Two files implement the webhook:
#   1. apps/web/app/api/webhooks/paystack/route.ts   — Next.js edge handler
#   2. apps/api/app/routers/webhooks.py              — FastAPI internal receiver

# ─── Required environment variables ──────────────────────────

# apps/api/.env  (FastAPI)
# ───────────────
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx   # Your Paystack secret key
INTERNAL_WEBHOOK_SECRET=some-strong-random-string  # Shared secret for internal HMAC
INTERNAL_API_URL=http://localhost:8000             # FastAPI base URL (internal)

# apps/web/.env.local  (Next.js)
# ───────────────────────────────
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx   # Same key — used for HMAC verification
INTERNAL_API_URL=http://localhost:8000             # FastAPI URL reachable from Next.js server
INTERNAL_WEBHOOK_SECRET=some-strong-random-string  # Same secret as above
NEXT_PUBLIC_API_URL=http://localhost:8000          # Public-facing API URL (fallback)

# ─── Paystack Dashboard setup ─────────────────────────────────

# 1. Go to: https://dashboard.paystack.com/#/settings/developer
# 2. Under "Webhooks", add your endpoint:
#    https://yourdomain.com/api/webhooks/paystack
# 3. Paystack will send a test event — your handler should return 200

# ─── Events to enable in Paystack ─────────────────────────────
# ✅  charge.success       — payment completed
# ✅  charge.failed        — payment failed (logged, no action)
# ─   transfer.*           — handled in future (payroll)
# ─   subscription.*       — not used

# ─── How the payment flow works ───────────────────────────────

# When you generate an invoice and want to collect online:
#
#   1. Call POST /invoicing/invoices/{id}/initialize-payment
#      → FastAPI creates a Paystack payment link with metadata:
#        { invoice_id: "uuid", client_id: "uuid" }
#      → Returns { payment_url: "https://paystack.com/pay/xxxx" }
#
#   2. Send payment_url to client (WhatsApp / email / portal)
#
#   3. Client pays via Paystack (card, MTN MoMo, etc.)
#
#   4. Paystack fires charge.success to /api/webhooks/paystack
#
#   5. Next.js handler verifies HMAC → calls FastAPI → payment recorded
#
#   6. FastAPI atomically:
#      • Creates Payment row
#      • Updates Invoice.amount_paid + Invoice.status
#      • Creates JournalEntry (income side)
#      • Creates PortalNotification (client sees it in portal)

# ─── Testing locally ──────────────────────────────────────────

# Use Paystack CLI or ngrok to test webhooks locally:
#
#   npx paystack-cli webhook forward \
#     --url http://localhost:3000/api/webhooks/paystack \
#     --secret sk_test_xxxxxxxx
#
# Or use ngrok:
#   ngrok http 3000
#   → Update Paystack dashboard webhook URL to your ngrok URL

# ─── Security notes ───────────────────────────────────────────

# • HMAC-SHA512 verification happens BEFORE any DB queries
# • Duplicate webhook delivery is handled via idempotency check on provider_ref
# • The internal Next.js → FastAPI call uses its own HMAC-SHA256
# • The /invoices/{id}/payments endpoint is NOT publicly accessible (X-Source header gate)
# • Row-level locking (SELECT FOR UPDATE) prevents race conditions on concurrent deliveries
# • Stale internal signatures (> 30s old) are rejected
