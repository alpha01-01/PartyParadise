"""008 contracts and documents

Revision ID: 008
Revises: 007
Create Date: 2025-01-01 00:07:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- contract_templates ---
    op.create_table(
        "contract_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("service_type", sa.String(30), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- contracts ---
    op.create_table(
        "contracts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("contract_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reference", sa.String(20), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("client_name", sa.String(150), nullable=False),
        sa.Column("client_phone", sa.String(20), nullable=True),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("venue", sa.String(250), nullable=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("deposit_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("special_terms", sa.Text, nullable=True),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("signed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("signature_data", sa.Text, nullable=True),
        sa.Column("signed_ip", sa.String(45), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- documents ---
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("booking_id", UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("file_url", sa.Text, nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("is_visible_to_client", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- indexes ---
    op.create_index("idx_contracts_booking_id", "contracts", ["booking_id"])
    op.create_index("idx_contracts_client_id", "contracts", ["client_id"])
    op.create_index("idx_contracts_status", "contracts", ["status"])
    op.create_index("idx_documents_booking_id", "documents", ["booking_id"])
    op.create_index("idx_documents_client_id", "documents", ["client_id"])

    # --- seed contract templates ---
    op.execute("""
        INSERT INTO contract_templates (id, name, service_type, body) VALUES
        (gen_random_uuid(), 'Standard Décor Agreement', 'decor',
        'SERVICE AGREEMENT

This agreement is between PartyParadise (the "Company") and {{client_name}} (the "Client").

Event Date: {{event_date}}
Venue: {{venue}}

SERVICES
{{service_description}}

PAYMENT TERMS
Total Amount: {{total_amount}}
Deposit Required: {{deposit_amount}}

By signing this agreement, the Client confirms acceptance of all terms.

Client Name: ____________________
Signature: ____________________
Date: ____________________'),

        (gen_random_uuid(), '360 Photobooth Service Agreement', 'photobooth_360',
        'PHOTOBOOTH SERVICE AGREEMENT

This agreement is between PartyParadise (the "Company") and {{client_name}} (the "Client").

Event Date: {{event_date}}
Venue: {{venue}}

SERVICES
{{service_description}}

EQUIPMENT & LIABILITY
The Client accepts responsibility for any damage to equipment caused by guests.

PAYMENT TERMS
Total Amount: {{total_amount}}
Deposit Required: {{deposit_amount}}

Client Name: ____________________
Signature: ____________________
Date: ____________________'),

        (gen_random_uuid(), '360 Photobooth Rental Agreement', 'photobooth_rental',
        'EQUIPMENT RENTAL AGREEMENT

This agreement is between PartyParadise (the "Company") and {{client_name}} (the "Client").

Rental Date: {{event_date}}
Delivery Address: {{venue}}

RENTAL ITEMS
{{service_description}}

RENTAL CONDITIONS
Equipment must be returned in the same condition as received.
The Client is liable for any damage or loss during the rental period.

PAYMENT TERMS
Total Amount: {{total_amount}}
Deposit Required: {{deposit_amount}}

Client Name: ____________________
Signature: ____________________
Date: ____________________')
    """)


def downgrade() -> None:
    op.drop_table("documents")
    op.drop_table("contracts")
    op.drop_table("contract_templates")
