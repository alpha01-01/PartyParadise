"""
app/services/pdf.py
───────────────────────────────────────────────────────────────
PDF generation using Jinja2 HTML templates + WeasyPrint.

WeasyPrint renders HTML/CSS to PDF — same engine as a browser,
so the PDFs look exactly like the on-screen design.

Usage
─────
    from app.services.pdf import generate_invoice_pdf, generate_contract_pdf

    pdf_bytes = generate_invoice_pdf(invoice, client, items, payments)
    pdf_bytes = generate_contract_pdf(contract)

Returns raw bytes — caller decides whether to stream to the
HTTP response or upload to Supabase Storage.
"""

from __future__ import annotations

import io

from app.utils.shop_sales import display_notes
import os
from datetime import datetime
from typing import Optional

from jinja2 import Environment, DictLoader


# ─── Template strings ─────────────────────────────────────────
# Inline templates so there are no external file dependencies.
# The design matches the dark PartyParadise brand but inverted
# to white — PDFs are always printed on white paper.

_BASE_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'DM Sans', Arial, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  background: #fff;
  line-height: 1.6;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page { padding: 40px 48px; max-width: 800px; margin: 0 auto; }

/* ── Header ── */
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 2px solid #f5c842; }
.logo-mark { width: 42px; height: 42px; border-radius: 10px; background: #f5c842; display: flex; align-items: center; justify-content: center; }
.logo-mark span { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 800; color: #0e0d0b; line-height: 1; }
.logo-name { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; color: #0e0d0b; margin-top: 6px; letter-spacing: -0.03em; }
.logo-tagline { font-size: 11px; color: #888; letter-spacing: 0.06em; }
.header-right { text-align: right; }
.doc-type { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: #0e0d0b; letter-spacing: -0.04em; }
.doc-ref { font-size: 12px; color: #888; margin-top: 4px; }

/* ── Party info ── */
.parties { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 32px; }
.party { flex: 1; }
.party-label { font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.party-name { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #0e0d0b; margin-bottom: 3px; }
.party-detail { font-size: 12px; color: #555; line-height: 1.7; }

/* ── Info strip ── */
.info-strip { display: flex; gap: 0; margin-bottom: 28px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
.info-item { flex: 1; padding: 12px 16px; border-right: 1px solid #eee; }
.info-item:last-child { border-right: none; }
.info-label { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
.info-value { font-size: 13px; font-weight: 500; color: #0e0d0b; }

/* ── Line items table ── */
.items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items-table thead tr { background: #f9f9f9; }
.items-table th { text-align: left; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #aaa; padding: 10px 14px; border-bottom: 1px solid #eee; }
.items-table th.right { text-align: right; }
.items-table td { padding: 12px 14px; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #333; vertical-align: top; }
.items-table td.right { text-align: right; font-weight: 500; color: #0e0d0b; }
.items-table td.desc { color: #0e0d0b; font-weight: 500; }
.items-table td.sub-desc { font-size: 11px; color: #888; margin-top: 2px; }

/* ── Totals ── */
.totals { margin-left: auto; width: 280px; }
.total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.total-row .label { color: #555; }
.total-row .value { font-weight: 500; color: #0e0d0b; }
.total-row.discount .value { color: #e05a4a; }
.total-divider { border: none; border-top: 1px solid #eee; margin: 8px 0; }
.total-row.grand { padding: 10px 0; }
.total-row.grand .label { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #0e0d0b; }
.total-row.grand .value { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 800; color: #0e0d0b; }

/* ── Payment history ── */
.section-title { font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; color: #0e0d0b; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; padding-top: 20px; border-top: 1px solid #eee; margin-top: 20px; }
.payment-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 12.5px; }
.payment-row .method { color: #333; }
.payment-row .amount { font-weight: 500; color: #4caf7d; }
.balance-box { background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 14px 16px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
.balance-box .label { font-size: 12px; color: #888; }
.balance-box .amount { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; }
.balance-box .amount.paid { color: #4caf7d; }
.balance-box .amount.due { color: #e05a4a; }

/* ── Contract body ── */
.contract-body { font-size: 13.5px; color: #333; line-height: 1.9; white-space: pre-wrap; margin-bottom: 40px; }
.section-heading { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; color: #0e0d0b; letter-spacing: 0.1em; text-transform: uppercase; margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #eee; }

/* ── Signature block ── */
.signature-section { margin-top: 40px; padding-top: 24px; border-top: 2px solid #f5c842; display: flex; justify-content: space-between; gap: 40px; }
.sig-block { flex: 1; }
.sig-label { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.sig-name { font-size: 20px; font-style: italic; color: #0e0d0b; font-family: Georgia, serif; border-bottom: 1.5px solid #ccc; padding-bottom: 4px; min-height: 32px; }
.sig-date { font-size: 11px; color: #888; margin-top: 6px; }
.sig-line { border: none; border-bottom: 1.5px solid #ccc; height: 32px; margin-bottom: 4px; }

/* ── Footer ── */
.footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 11px; color: #aaa; }

/* ── Status badge ── */
.badge { display: inline-block; padding: 3px 10px; border-radius: 100px; font-size: 10px; font-weight: 500; }
.badge-paid    { background: #e8f5e9; color: #2e7d32; }
.badge-partial { background: #fff8e1; color: #f57f17; }
.badge-sent    { background: #e3f2fd; color: #1565c0; }
.badge-overdue { background: #fce4ec; color: #c62828; }
.badge-signed  { background: #e8f5e9; color: #2e7d32; }
"""

_INVOICE_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>{{ css }}</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="logo-mark"><span>P</span></div>
        <div>
          <div class="logo-name">PartyParadise</div>
          <div class="logo-tagline">EVENT MANAGEMENT</div>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-type">INVOICE</div>
      <div class="doc-ref">{{ invoice.reference }}</div>
      <div style="margin-top:8px">
        <span class="badge badge-{{ invoice.status }}">{{ invoice.status|upper }}</span>
      </div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">{{ business.name }}</div>
      <div class="party-detail">{{ business.email }}<br>{{ business.phone }}<br>{{ business.address }}</div>
    </div>
    <div class="party">
      <div class="party-label">Bill To</div>
      <div class="party-name">{{ client.full_name }}</div>
      <div class="party-detail">
        {% if client.email %}{{ client.email }}<br>{% endif %}
        {% if client.phone %}{{ client.phone }}{% endif %}
      </div>
    </div>
  </div>

  <!-- Info strip -->
  <div class="info-strip">
    <div class="info-item">
      <div class="info-label">Invoice Date</div>
      <div class="info-value">{{ invoice.issued_at or today }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Due Date</div>
      <div class="info-value">{{ invoice.due_date or "On receipt" }}</div>
    </div>
    {% if invoice.booking_reference %}
    <div class="info-item">
      <div class="info-label">Booking</div>
      <div class="info-value">{{ invoice.booking_reference }}</div>
    </div>
    {% endif %}
    {% if invoice.event_date %}
    <div class="info-item">
      <div class="info-label">Event Date</div>
      <div class="info-value">{{ invoice.event_date }}</div>
    </div>
    {% endif %}
  </div>

  <!-- Line items -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:50%">Description</th>
        <th class="right" style="width:15%">Qty</th>
        <th class="right" style="width:20%">Unit Price</th>
        <th class="right" style="width:15%">Amount</th>
      </tr>
    </thead>
    <tbody>
      {% for item in items %}
      <tr>
        <td class="desc">{{ item.description }}</td>
        <td class="right">{{ item.quantity }}</td>
        <td class="right">GHS {{ "{:,.2f}".format(item.unit_price) }}</td>
        <td class="right">GHS {{ "{:,.2f}".format(item.total_price) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals">
    <div class="total-row">
      <span class="label">Subtotal</span>
      <span class="value">GHS {{ "{:,.2f}".format(invoice.subtotal) }}</span>
    </div>
    {% if invoice.discount_amount and invoice.discount_amount > 0 %}
    <div class="total-row discount">
      <span class="label">Discount</span>
      <span class="value">− GHS {{ "{:,.2f}".format(invoice.discount_amount) }}</span>
    </div>
    {% endif %}
    {% if invoice.tax_amount and invoice.tax_amount > 0 %}
    <div class="total-row">
      <span class="label">Tax</span>
      <span class="value">GHS {{ "{:,.2f}".format(invoice.tax_amount) }}</span>
    </div>
    {% endif %}
    <hr class="total-divider">
    <div class="total-row grand">
      <span class="label">Total</span>
      <span class="value">GHS {{ "{:,.2f}".format(invoice.total_amount) }}</span>
    </div>
  </div>

  <!-- Payment history -->
  {% if payments %}
  <div class="section-title">Payment History</div>
  {% for p in payments %}
  <div class="payment-row">
    <div>
      <span class="method">{{ p.method|replace("_"," ")|title }}</span>
      <span style="color:#aaa;margin-left:8px;font-size:11px">{{ p.paid_at }} · {{ p.reference }}</span>
    </div>
    <div class="amount">+ GHS {{ "{:,.2f}".format(p.amount) }}</div>
  </div>
  {% endfor %}
  {% endif %}

  <!-- Balance box -->
  <div class="balance-box">
    <div>
      <div class="label">{{ "Amount Paid" if invoice.amount_due == 0 else "Balance Due" }}</div>
      {% if invoice.amount_due == 0 %}
      <div style="font-size:11px;color:#4caf7d;margin-top:2px">Fully settled · Thank you!</div>
      {% else %}
      <div style="font-size:11px;color:#aaa;margin-top:2px">Due {{ invoice.due_date or "on receipt" }}</div>
      {% endif %}
    </div>
    <div class="amount {{ 'paid' if invoice.amount_due == 0 else 'due' }}">
      GHS {{ "{:,.2f}".format(invoice.amount_due if invoice.amount_due > 0 else invoice.amount_paid) }}
    </div>
  </div>

  {% if invoice.notes %}
  <div style="margin-top:24px;padding:14px 16px;background:#f9f9f9;border-radius:8px;font-size:12.5px;color:#555">
    <div style="font-size:10px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#aaa;margin-bottom:6px">Notes</div>
    {{ invoice.notes }}
  </div>
  {% endif %}

  <!-- Footer -->
  <div class="footer">
    <span>{{ business.name }} · {{ business.address }}</span>
    <span>{{ business.email }} · {{ business.phone }}</span>
  </div>

</div>
</body>
</html>
"""

_CONTRACT_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>{{ css }}</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="logo-mark"><span>P</span></div>
        <div>
          <div class="logo-name">PartyParadise</div>
          <div class="logo-tagline">EVENT MANAGEMENT</div>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-type">SERVICE AGREEMENT</div>
      <div class="doc-ref">{{ contract.reference }}</div>
      <div style="margin-top:8px">
        <span class="badge badge-{{ contract.status }}">{{ contract.status|upper }}</span>
      </div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <div class="party-label">Service Provider</div>
      <div class="party-name">{{ business.name }}</div>
      <div class="party-detail">{{ business.email }}<br>{{ business.phone }}<br>{{ business.address }}</div>
    </div>
    <div class="party">
      <div class="party-label">Client</div>
      <div class="party-name">{{ contract.client_name }}</div>
      <div class="party-detail">
        {% if contract.client_phone %}{{ contract.client_phone }}<br>{% endif %}
        Event: {{ contract.event_date }}<br>
        {% if contract.venue %}Venue: {{ contract.venue }}{% endif %}
      </div>
    </div>
  </div>

  <!-- Info strip -->
  <div class="info-strip">
    <div class="info-item">
      <div class="info-label">Contract Date</div>
      <div class="info-value">{{ contract.created_at_date }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Event Date</div>
      <div class="info-value">{{ contract.event_date }}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Total Value</div>
      <div class="info-value">GHS {{ "{:,.2f}".format(contract.total_amount) }}</div>
    </div>
    {% if contract.deposit_amount %}
    <div class="info-item">
      <div class="info-label">Deposit Due</div>
      <div class="info-value">GHS {{ "{:,.2f}".format(contract.deposit_amount) }}</div>
    </div>
    {% endif %}
  </div>

  <!-- Contract body -->
  <div class="contract-body">{{ contract.body }}</div>

  <!-- Signature block -->
  <div class="signature-section">
    <div class="sig-block">
      <div class="sig-label">Service Provider</div>
      <div class="sig-name">PartyParadise</div>
      <div class="sig-date">Authorised Signatory</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">Client</div>
      {% if contract.status == "signed" and contract.signature_data %}
        {% if contract.signature_data.startswith("data:image") %}
          <img src="{{ contract.signature_data }}" style="height:40px;max-width:200px;" />
        {% else %}
          <div class="sig-name">{{ contract.signature_data }}</div>
        {% endif %}
        <div class="sig-date">
          Signed {{ contract.signed_at_fmt }}
          {% if contract.signed_ip %} · IP: {{ contract.signed_ip }}{% endif %}
        </div>
      {% else %}
        <div class="sig-line"></div>
        <div class="sig-date">Signature &amp; Date</div>
      {% endif %}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>{{ business.name }} · {{ business.address }}</span>
    <span>{{ contract.reference }} · Generated {{ today }}</span>
  </div>

</div>
</body>
</html>
"""


# ─── Jinja2 environment ───────────────────────────────────────
_env = Environment(loader=DictLoader({
    "invoice":  _INVOICE_TEMPLATE,
    "contract": _CONTRACT_TEMPLATE,
}))


# ─── Public API ───────────────────────────────────────────────

def generate_invoice_pdf(invoice, client, items, payments) -> bytes:
    """
    Render an invoice as PDF bytes.

    Args:
        invoice:  Invoice ORM object
        client:   Client ORM object
        items:    list of InvoiceItem ORM objects
        payments: list of Payment ORM objects

    Returns:
        PDF as bytes
    """
    from app.config import settings

    today = datetime.today().strftime("%d %B %Y")

    context = {
        "css": _BASE_CSS,
        "today": today,
        "invoice": _invoice_ctx(invoice),
        "client":  _client_ctx(client),
        "items":   [_item_ctx(i) for i in items],
        "payments":[_payment_ctx(p) for p in payments],
        "business": _business_ctx(settings),
    }

    html = _env.get_template("invoice").render(**context)
    return _html_to_pdf(html)


def generate_contract_pdf(contract) -> bytes:
    """
    Render a contract/service agreement as PDF bytes.

    Args:
        contract: Contract ORM object

    Returns:
        PDF as bytes
    """
    from app.config import settings

    today = datetime.today().strftime("%d %B %Y")

    context = {
        "css": _BASE_CSS,
        "today": today,
        "contract": _contract_ctx(contract),
        "business": _business_ctx(settings),
    }

    html = _env.get_template("contract").render(**context)
    return _html_to_pdf(html)


# ─── Context builders ─────────────────────────────────────────

def _invoice_ctx(inv) -> dict:
    return {
        "reference":       inv.reference,
        "status":          inv.status,
        "issued_at":       str(inv.issued_at) if inv.issued_at else None,
        "due_date":        str(inv.due_date)  if inv.due_date  else None,
        "subtotal":        float(inv.subtotal),
        "discount_amount": float(inv.discount_amount or 0),
        "tax_amount":      float(inv.tax_amount or 0),
        "total_amount":    float(inv.total_amount),
        "amount_paid":     float(inv.amount_paid or 0),
        "amount_due":      float(inv.total_amount - (inv.amount_paid or 0)),
        "notes":           display_notes(inv.notes),
        "booking_reference": getattr(getattr(inv, "booking", None), "reference", None),
        "event_date":      str(inv.booking.event_date) if getattr(inv, "booking", None) else None,
    }


def _client_ctx(client) -> dict:
    return {
        "full_name": f"{client.first_name} {client.last_name}",
        "email":     client.email,
        "phone":     client.phone,
    }


def _item_ctx(item) -> dict:
    return {
        "description": item.description,
        "quantity":    item.quantity,
        "unit_price":  float(item.unit_price),
        "total_price": float(item.total_price),
    }


def _payment_ctx(p) -> dict:
    return {
        "method":    p.method,
        "amount":    float(p.amount),
        "paid_at":   str(p.paid_at),
        "reference": p.reference or "",
    }


def _contract_ctx(contract) -> dict:
    signed_at_fmt = None
    if contract.signed_at:
        signed_at_fmt = contract.signed_at.strftime("%d %B %Y at %H:%M")

    return {
        "reference":       contract.reference,
        "status":          contract.status,
        "client_name":     contract.client_name,
        "client_phone":    contract.client_phone,
        "event_date":      str(contract.event_date),
        "venue":           contract.venue,
        "total_amount":    float(contract.total_amount),
        "deposit_amount":  float(contract.deposit_amount) if contract.deposit_amount else None,
        "body":            contract.body,
        "signature_data":  contract.signature_data,
        "signed_ip":       contract.signed_ip,
        "signed_at_fmt":   signed_at_fmt,
        "created_at_date": contract.created_at.strftime("%d %B %Y") if contract.created_at else "",
    }


def _business_ctx(settings) -> dict:
    return {
        "name":    getattr(settings, "BUSINESS_NAME",    "PartyParadise"),
        "email":   getattr(settings, "BUSINESS_EMAIL",   "hello@partyparadise.com"),
        "phone":   getattr(settings, "BUSINESS_PHONE",   "+233 XX XXX XXXX"),
        "address": getattr(settings, "BUSINESS_ADDRESS", "Accra, Ghana"),
    }


# ─── WeasyPrint renderer ──────────────────────────────────────

def _html_to_pdf(html: str) -> bytes:
    """Convert HTML string to PDF bytes via WeasyPrint."""
    try:
        from weasyprint import HTML, CSS
        buf = io.BytesIO()
        HTML(string=html).write_pdf(
            buf,
            stylesheets=[CSS(string="""
                @page {
                  size: A4;
                  margin: 0;
                }
            """)],
        )
        return buf.getvalue()
    except ImportError:
        raise RuntimeError(
            "WeasyPrint is not installed. Run: pip install weasyprint"
        )
