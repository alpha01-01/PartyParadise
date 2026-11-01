"""
app/routers/pdfs.py
───────────────────────────────────────────────────────────────
PDF download endpoints.

  GET /pdfs/invoices/{invoice_id}   → streams invoice PDF
  GET /pdfs/contracts/{contract_id} → streams contract PDF

These are staff-only endpoints (require auth).
The contract signing page generates its own PDF server-side
via the contracts router.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.dependencies import require_permission

router = APIRouter()


@router.get("/invoices/{invoice_id}")
def download_invoice_pdf(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("invoices:read")),
):
    """Generate and stream an invoice as a PDF file."""
    from app.models.invoicing import Invoice, InvoiceItem, Payment
    from app.models.clients import Client
    from app.services.pdf import generate_invoice_pdf

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    client = db.query(Client).filter(Client.id == invoice.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    items    = db.query(InvoiceItem).filter(InvoiceItem.invoice_id == invoice_id).all()
    payments = db.query(Payment).filter(Payment.invoice_id == invoice_id, Payment.status == "confirmed").all()

    try:
        pdf_bytes = generate_invoice_pdf(invoice, client, items, payments)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="PDF generation is not available on this server") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Invoice-{invoice.reference}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/contracts/{contract_id}")
def download_contract_pdf(
    contract_id: UUID,
    db: Session = Depends(get_db),
    _=Depends(require_permission("contracts:read")),
):
    """Generate and stream a contract as a PDF file."""
    from app.models.contracts import Contract
    from app.services.pdf import generate_contract_pdf

    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    try:
        pdf_bytes = generate_contract_pdf(contract)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="PDF generation is not available on this server") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Contract-{contract.reference}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
