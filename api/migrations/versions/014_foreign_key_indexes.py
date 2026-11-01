"""014 foreign key indexes

Foreign keys were not indexed, so joins and deletes scanned whole tables, and
refresh token lookups had no index at all.

Revision ID: 014
Revises: 013
Create Date: 2026-11-01 00:04:00
"""
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

INDEXES = [
    ("idx_bank_transactions_journal_entry_id", "bank_transactions", "journal_entry_id"),
    ("idx_booking_equipment_equipment_id", "booking_equipment", "equipment_id"),
    ("idx_booking_notes_user_id", "booking_notes", "user_id"),
    ("idx_booking_services_booking_id", "booking_services", "booking_id"),
    ("idx_bookings_created_by", "bookings", "created_by"),
    ("idx_client_addresses_client_id", "client_addresses", "client_id"),
    ("idx_client_tags_tag_id", "client_tags", "tag_id"),
    ("idx_contracts_created_by", "contracts", "created_by"),
    ("idx_contracts_template_id", "contracts", "template_id"),
    ("idx_documents_uploaded_by", "documents", "uploaded_by"),
    ("idx_equipment_maintenance_equipment_id", "equipment_maintenance", "equipment_id"),
    ("idx_equipment_maintenance_user_id", "equipment_maintenance", "user_id"),
    ("idx_expenses_recorded_by", "expenses", "recorded_by"),
    ("idx_expenses_supplier_id", "expenses", "supplier_id"),
    ("idx_interactions_user_id", "interactions", "user_id"),
    ("idx_inventory_transactions_booking_id", "inventory_transactions", "booking_id"),
    ("idx_inventory_transactions_user_id", "inventory_transactions", "user_id"),
    ("idx_invoice_items_booking_service_id", "invoice_items", "booking_service_id"),
    ("idx_invoice_items_invoice_id", "invoice_items", "invoice_id"),
    ("idx_invoices_created_by", "invoices", "created_by"),
    ("idx_journal_entries_created_by", "journal_entries", "created_by"),
    ("idx_leave_requests_reviewed_by", "leave_requests", "reviewed_by"),
    ("idx_payments_received_by", "payments", "received_by"),
    ("idx_portal_inquiries_portal_account_id", "portal_inquiries", "portal_account_id"),
    ("idx_portal_sessions_portal_account_id", "portal_sessions", "portal_account_id"),
    ("idx_portal_sessions_token_hash", "portal_sessions", "token_hash"),
    ("idx_purchase_order_items_item_id", "purchase_order_items", "item_id"),
    ("idx_purchase_order_items_order_id", "purchase_order_items", "order_id"),
    ("idx_purchase_orders_created_by", "purchase_orders", "created_by"),
    ("idx_quote_items_quote_id", "quote_items", "quote_id"),
    ("idx_quotes_client_id", "quotes", "client_id"),
    ("idx_quotes_created_by", "quotes", "created_by"),
    ("idx_role_permissions_permission_id", "role_permissions", "permission_id"),
    ("idx_sessions_token_hash", "sessions", "token_hash"),
    ("idx_shifts_assigned_by", "shifts", "assigned_by"),
    ("idx_user_roles_role_id", "user_roles", "role_id"),
]


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
