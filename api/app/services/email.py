"""
app/services/email.py
───────────────────────────────────────────────────────────────
Email delivery via SendGrid.

All outgoing emails flow through this module so there is one
place to swap providers, add BCC, or toggle sandbox mode.

Usage
─────
    from app.services.email import (
        send_invoice_email,
        send_contract_email,
        send_payment_confirmation,
        send_portal_invite,
    )

Each function is fire-and-forget from the caller's perspective.
Errors are logged but not re-raised — a failed email should
never roll back a database transaction.

Sandbox mode
────────────
Set SENDGRID_SANDBOX=true in .env to log emails instead of
sending them. Useful for local development.
"""

from __future__ import annotations

import logging
from html import escape
from typing import Optional

logger = logging.getLogger(__name__)


class _SafeFields:
    """Text from an object, escaped for use in an HTML email."""

    def __init__(self, source):
        self._source = source

    def __getattr__(self, name):
        value = getattr(self._source, name)
        return escape(value) if isinstance(value, str) else value


def safe(source) -> _SafeFields:
    return _SafeFields(source)


# ─── Low-level send ───────────────────────────────────────────

def _send(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    text_body: str,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None,
    attachment_mime: str = "application/pdf",
) -> bool:
    """
    Send a single transactional email via SendGrid.

    Returns True on success, False on failure.
    Never raises — logs errors instead.
    """
    from app.config import settings

    api_key  = getattr(settings, "SENDGRID_API_KEY",   "")
    from_email = getattr(settings, "SENDGRID_FROM_EMAIL", "noreply@partyparadise.com")
    from_name  = getattr(settings, "SENDGRID_FROM_NAME",  "PartyParadise")
    sandbox    = settings.SENDGRID_SANDBOX

    if not api_key:
        logger.warning("SENDGRID_API_KEY not set — email NOT sent to %s", to_email)
        return False

    if sandbox:
        logger.info(
            "[SANDBOX] Email to %s | Subject: %s | Attachment: %s",
            to_email, subject, attachment_filename,
        )
        return True

    try:
        import sendgrid
        from sendgrid.helpers.mail import (
            Mail, To, From, Subject, HtmlContent, PlainTextContent,
            Attachment, FileContent, FileName, FileType, Disposition,
        )
        import base64

        msg = Mail()
        msg.from_email = From(from_email, from_name)
        msg.to         = To(to_email, to_name)
        msg.subject    = Subject(subject)
        msg.content    = [
            PlainTextContent(text_body),
            HtmlContent(html_body),
        ]

        if attachment_bytes and attachment_filename:
            encoded = base64.b64encode(attachment_bytes).decode()
            msg.attachment = Attachment(
                FileContent(encoded),
                FileName(attachment_filename),
                FileType(attachment_mime),
                Disposition("attachment"),
            )

        sg = sendgrid.SendGridAPIClient(api_key)
        response = sg.send(msg)

        if response.status_code >= 400:
            logger.error(
                "SendGrid error %s for %s: %s",
                response.status_code, to_email, response.body,
            )
            return False

        logger.info("Email sent to %s | Subject: %s", to_email, subject)
        return True

    except Exception as exc:
        logger.exception("Failed to send email to %s: %s", to_email, exc)
        return False


# ─── HTML email base layout ───────────────────────────────────

def _wrap_html(content: str, preheader: str = "") -> str:
    """Wrap email content in a clean, mobile-friendly HTML shell."""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    body {{ margin:0; padding:0; background:#f5f5f0; font-family: 'Arial', sans-serif; -webkit-text-size-adjust:100%; }}
    .wrapper {{ max-width:600px; margin:0 auto; padding:24px 16px; }}
    .card {{ background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06); }}
    .header {{ background:#0e0d0b; padding:24px 28px; display:flex; align-items:center; gap:12px; }}
    .logo-box {{ width:36px; height:36px; border-radius:8px; background:#f5c842; display:inline-flex; align-items:center; justify-content:center; font-family:Arial; font-size:18px; font-weight:900; color:#0e0d0b; text-align:center; line-height:36px; }}
    .logo-name {{ font-size:16px; font-weight:700; color:#f0ead8; letter-spacing:-0.02em; }}
    .body {{ padding:28px; }}
    .greeting {{ font-size:20px; font-weight:700; color:#0e0d0b; margin-bottom:12px; }}
    p {{ font-size:14px; color:#555; line-height:1.7; margin:0 0 14px; }}
    .detail-box {{ background:#f9f9f7; border:1px solid #eee; border-radius:8px; padding:16px 18px; margin:18px 0; }}
    .detail-row {{ display:flex; justify-content:space-between; padding:5px 0; font-size:13px; border-bottom:1px solid #f0f0f0; }}
    .detail-row:last-child {{ border-bottom:none; }}
    .detail-label {{ color:#888; }}
    .detail-value {{ font-weight:500; color:#0e0d0b; }}
    .cta-btn {{ display:inline-block; padding:13px 28px; background:#f5c842; color:#0e0d0b; font-size:14px; font-weight:700; border-radius:8px; text-decoration:none; margin:4px 0 18px; }}
    .footer-text {{ padding:20px 28px; font-size:11.5px; color:#aaa; border-top:1px solid #f0f0f0; line-height:1.7; }}
    .amount {{ font-size:22px; font-weight:800; color:#0e0d0b; }}
    .amount-due {{ color:#e05a4a; }}
    .amount-paid {{ color:#4caf7d; }}
  </style>
</head>
<body>
  {'<div style="display:none;max-height:0;overflow:hidden;">' + preheader + '</div>' if preheader else ''}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo-box">P</div>
        <div class="logo-name">PartyParadise</div>
      </div>
      <div class="body">
        {content}
      </div>
      <div class="footer-text">
        PartyParadise · Accra, Ghana<br>
        This email was sent automatically. Reply to this email if you have any questions.
      </div>
    </div>
  </div>
</body>
</html>
"""


# ─── Invoice email ────────────────────────────────────────────

def send_invoice_email(
    invoice,
    client,
    pdf_bytes: Optional[bytes] = None,
) -> bool:
    """
    Send an invoice to the client.
    Attaches the PDF if pdf_bytes is provided.
    """
    full_name   = f"{client.first_name} {client.last_name}"
    amount_due  = float(invoice.total_amount - (invoice.amount_paid or 0))
    amount_str  = f"GHS {invoice.total_amount:,.2f}"
    due_str     = str(invoice.due_date) if invoice.due_date else "on receipt"

    content = f"""
      <div class="greeting">Your invoice is ready</div>
      <p>Hi {safe(client).first_name},</p>
      <p>Please find your invoice from PartyParadise. You can view the details below or download the attached PDF.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">{safe(invoice).reference}</span></div>
        <div class="detail-row"><span class="detail-label">Total Amount</span><span class="detail-value amount">{amount_str}</span></div>
        <div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value">{due_str}</span></div>
      </div>
      <p>To complete payment, you can use MTN MoMo, Vodafone Cash, or bank transfer. Contact us if you have any questions.</p>
    """

    plain = (
        f"Hi {client.first_name},\n\n"
        f"Your invoice {invoice.reference} for {amount_str} is ready.\n"
        f"Due date: {due_str}\n\n"
        f"Please contact us to arrange payment.\n\n"
        f"PartyParadise"
    )

    return _send(
        to_email=client.email,
        to_name=full_name,
        subject=f"Invoice {invoice.reference} – GHS {invoice.total_amount:,.2f} | PartyParadise",
        html_body=_wrap_html(content, preheader=f"Your invoice for GHS {invoice.total_amount:,.2f} is ready"),
        text_body=plain,
        attachment_bytes=pdf_bytes,
        attachment_filename=f"Invoice-{invoice.reference}.pdf" if pdf_bytes else None,
    )


# ─── Contract email ───────────────────────────────────────────

def send_contract_email(
    contract,
    client,
    signing_url: str,
    pdf_bytes: Optional[bytes] = None,
) -> bool:
    """
    Send a contract signing request to the client.
    Includes a direct signing link and optionally a PDF preview.
    """
    full_name = f"{client.first_name} {client.last_name}"

    content = f"""
      <div class="greeting">Your service agreement is ready to sign</div>
      <p>Hi {safe(client).first_name},</p>
      <p>Your service agreement with PartyParadise is ready for review and signing. Please click the button below to read and sign your safe(contract).</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Contract</span><span class="detail-value">{safe(contract).reference}</span></div>
        <div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">{safe(contract).event_date}</span></div>
        {'<div class="detail-row"><span class="detail-label">Venue</span><span class="detail-value">' + (safe(contract).venue or "—") + '</span></div>' if safe(contract).venue else ''}
        <div class="detail-row"><span class="detail-label">Total Value</span><span class="detail-value amount">GHS {safe(contract).total_amount:,.2f}</span></div>
        {'<div class="detail-row"><span class="detail-label">Deposit Due</span><span class="detail-value">GHS ' + f"{safe(contract).deposit_amount:,.2f}" + '</span></div>' if safe(contract).deposit_amount else ''}
      </div>
      <a href="{signing_url}" class="cta-btn">Review &amp; Sign Contract →</a>
      <p style="font-size:12px;color:#aaa;">This signing link expires in 7 days. If you have any questions, please contact us directly.</p>
    """

    plain = (
        f"Hi {client.first_name},\n\n"
        f"Your service agreement {contract.reference} is ready for signing.\n"
        f"Event: {contract.event_date}\n"
        f"Total: GHS {contract.total_amount:,.2f}\n\n"
        f"Sign here: {signing_url}\n\n"
        f"This link expires in 7 days.\n\n"
        f"PartyParadise"
    )

    return _send(
        to_email=client.email,
        to_name=full_name,
        subject=f"Please sign your service agreement – {contract.reference} | PartyParadise",
        html_body=_wrap_html(content, preheader="Your PartyParadise service agreement is ready to sign"),
        text_body=plain,
        attachment_bytes=pdf_bytes,
        attachment_filename=f"Contract-{contract.reference}-draft.pdf" if pdf_bytes else None,
    )


# ─── Payment confirmation ─────────────────────────────────────

def send_payment_confirmation(
    payment,
    invoice,
    client,
) -> bool:
    """
    Send a payment receipt to the client.
    Triggered after a payment is recorded (manual or Paystack webhook).
    """
    full_name  = f"{client.first_name} {client.last_name}"
    amount_due = float(invoice.total_amount - (invoice.amount_paid or 0))
    is_settled = amount_due <= 0

    content = f"""
      <div class="greeting">Payment received ✓</div>
      <p>Hi {safe(client).first_name},</p>
      <p>We've received your safe(payment). Thank you!</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Payment Ref</span><span class="detail-value">{safe(payment).reference}</span></div>
        <div class="detail-row"><span class="detail-label">Invoice</span><span class="detail-value">{safe(invoice).reference}</span></div>
        <div class="detail-row"><span class="detail-label">Amount Paid</span><span class="detail-value amount amount-paid">GHS {float(safe(payment).amount):,.2f}</span></div>
        <div class="detail-row"><span class="detail-label">{"Fully Settled" if is_settled else "Remaining Balance"}</span>
          <span class="detail-value {'amount-paid' if is_settled else 'amount-due'}">
            {"✓ Settled" if is_settled else f"GHS {amount_due:,.2f}"}
          </span>
        </div>
      </div>
      {"<p>Your invoice is now fully paid. We look forward to making your event amazing!</p>" if is_settled else f"<p>The remaining balance of <strong>GHS {amount_due:,.2f}</strong> is due before the event. Please contact us if you have any questions.</p>"}
    """

    plain = (
        f"Hi {client.first_name},\n\n"
        f"We received your payment of GHS {float(payment.amount):,.2f} for invoice {invoice.reference}.\n"
        + (f"Your invoice is now fully settled.\n\n" if is_settled else f"Remaining balance: GHS {amount_due:,.2f}\n\n")
        + "PartyParadise"
    )

    return _send(
        to_email=client.email,
        to_name=full_name,
        subject=f"Payment received – GHS {float(payment.amount):,.2f} | PartyParadise",
        html_body=_wrap_html(content, preheader=f"Payment of GHS {float(payment.amount):,.2f} confirmed"),
        text_body=plain,
    )


# ─── Portal invite ────────────────────────────────────────────

def send_portal_invite(client, setup_url: str) -> bool:
    """
    Send a client a one-time link to choose their portal password.
    """
    full_name = f"{client.first_name} {client.last_name}"

    content = f"""
      <div class="greeting">Your client portal is ready</div>
      <p>Hi {safe(client).first_name},</p>
      <p>PartyParadise has set up a client portal for you. You can use it to view your bookings, invoices, and contracts at any time.</p>
      <a href="{setup_url}" class="cta-btn">Set Your Password →</a>
      <p style="font-size:12px;color:#aaa;">This link works once and expires in 48 hours. If you did not expect this, you can ignore this email.</p>
    """

    plain = (
        f"Hi {client.first_name},\n\n"
        f"Your PartyParadise client portal is ready.\n\n"
        f"Set your password: {setup_url}\n\n"
        f"This link works once and expires in 48 hours.\n\n"
        f"PartyParadise"
    )

    return _send(
        to_email=client.email,
        to_name=full_name,
        subject="Your PartyParadise client portal is ready",
        html_body=_wrap_html(content, preheader="View your bookings and invoices online"),
        text_body=plain,
    )


# ─── Staff account emails ─────────────────────────────────────

def send_staff_invite(user, setup_url: str) -> bool:
    """
    Invite a new staff member to choose their password.
    """
    content = f"""
      <div class="greeting">Welcome to PartyParadise</div>
      <p>Hi {safe(user).full_name},</p>
      <p>Your staff account is ready. Choose a password to sign in. This link works once and expires in 48 hours.</p>
      <a href="{setup_url}" class="cta-btn">Set Your Password →</a>
    """

    plain = (
        f"Hi {user.full_name},\n\n"
        f"Your PartyParadise staff account is ready.\n\n"
        f"Set your password: {setup_url}\n\n"
        f"This link works once and expires in 48 hours.\n\n"
        f"PartyParadise"
    )

    return _send(
        to_email=user.email,
        to_name=user.full_name,
        subject="Set up your PartyParadise account",
        html_body=_wrap_html(content, preheader="Choose a password to sign in"),
        text_body=plain,
    )


def send_password_reset(user, reset_url: str) -> bool:
    """
    Send a staff member a password reset link.
    """
    content = f"""
      <div class="greeting">Reset your password</div>
      <p>Hi {safe(user).full_name},</p>
      <p>Use the button below to choose a new password. This link works once and expires in 1 hour.</p>
      <a href="{reset_url}" class="cta-btn">Reset Password →</a>
      <p style="font-size:12px;color:#aaa;">If you did not request this, you can ignore this email.</p>
    """

    plain = (
        f"Hi {user.full_name},\n\n"
        f"Reset your password: {reset_url}\n\n"
        f"This link works once and expires in 1 hour. "
        f"If you did not request this, you can ignore this email.\n\n"
        f"PartyParadise"
    )

    return _send(
        to_email=user.email,
        to_name=user.full_name,
        subject="Reset your PartyParadise password",
        html_body=_wrap_html(content, preheader="Choose a new password"),
        text_body=plain,
    )


# ─── Contract signed notification (to staff) ─────────────────

def send_contract_signed_notification(
    contract,
    staff_email: str,
    staff_name: str,
) -> bool:
    """
    Notify the business when a client signs a contract.
    """
    content = f"""
      <div class="greeting">Contract signed ✓</div>
      <p>Hi {escape(staff_name)},</p>
      <p><strong>{safe(contract).client_name}</strong> has signed their service agreement.</p>
      <div class="detail-box">
        <div class="detail-row"><span class="detail-label">Contract</span><span class="detail-value">{safe(contract).reference}</span></div>
        <div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">{safe(contract).event_date}</span></div>
        <div class="detail-row"><span class="detail-label">Total Value</span><span class="detail-value">GHS {safe(contract).total_amount:,.2f}</span></div>
        <div class="detail-row"><span class="detail-label">Signed At</span><span class="detail-value">{safe(contract).signed_at.strftime("%d %b %Y %H:%M") if safe(contract).signed_at else "—"}</span></div>
      </div>
      <p>Log in to the dashboard to confirm the booking and generate an safe(invoice).</p>
    """

    plain = (
        f"Contract {contract.reference} signed by {contract.client_name}.\n"
        f"Event: {contract.event_date}\n"
        f"Value: GHS {contract.total_amount:,.2f}\n"
    )

    return _send(
        to_email=staff_email,
        to_name=staff_name,
        subject=f"Contract signed: {contract.reference} – {contract.client_name}",
        html_body=_wrap_html(content),
        text_body=plain,
    )
