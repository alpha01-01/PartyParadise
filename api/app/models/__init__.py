# app/models/__init__.py
# Import all models here so that:
#   1. Alembic's env.py can discover them via `from app.models import *`
#   2. SQLAlchemy's relationship() calls resolve correctly at startup
#   3. A single import gives access to every model

from app.models.auth import (       # noqa: F401
    User,
    Role,
    Permission,
    UserRole,
    RolePermission,
    UserSession,
    AuditLog,
    ReferenceCounter,
)

from app.models.clients import (    # noqa: F401
    Client,
    ClientAddress,
    Interaction,
    Tag,
    ClientTag,
)

from app.models.bookings import (   # noqa: F401
    Booking,
    BookingService,
    BookingEquipment,
    BookingStaff,
    BookingNote,
)

from app.models.inventory import (  # noqa: F401
    Supplier,
    InventoryItem,
    InventoryTransaction,
    Equipment,
    EquipmentMaintenance,
    PurchaseOrder,
    PurchaseOrderItem,
)

from app.models.invoicing import (  # noqa: F401
    Quote,
    QuoteItem,
    Invoice,
    InvoiceItem,
    Payment,
)

from app.models.accounting import ( # noqa: F401
    ExpenseCategory,
    Expense,
    AccountPeriod,
    JournalEntry,
    BankAccount,
    BankTransaction,
)

from app.models.staff import (      # noqa: F401
    StaffProfile,
    Shift,
    Attendance,
    PayrollPeriod,
    PayrollEntry,
    LeaveRequest,
)

from app.models.contracts import (  # noqa: F401
    ContractTemplate,
    Contract,
    Document,
)

from app.models.portal import (     # noqa: F401
    ClientPortalAccount,
    PortalSession,
    PortalNotification,
    PortalInquiry,
)

__all__ = [
    # Auth
    "User", "Role", "Permission", "UserRole", "RolePermission",
    "UserSession", "AuditLog", "ReferenceCounter",
    # Clients
    "Client", "ClientAddress", "Interaction", "Tag", "ClientTag",
    # Bookings
    "Booking", "BookingService", "BookingEquipment", "BookingStaff", "BookingNote",
    # Inventory
    "Supplier", "InventoryItem", "InventoryTransaction", "Equipment",
    "EquipmentMaintenance", "PurchaseOrder", "PurchaseOrderItem",
    # Invoicing
    "Quote", "QuoteItem", "Invoice", "InvoiceItem", "Payment",
    # Accounting
    "ExpenseCategory", "Expense", "AccountPeriod", "JournalEntry",
    "BankAccount", "BankTransaction",
    # Staff
    "StaffProfile", "Shift", "Attendance", "PayrollPeriod",
    "PayrollEntry", "LeaveRequest",
    # Contracts
    "ContractTemplate", "Contract", "Document",
    # Portal
    "ClientPortalAccount", "PortalSession", "PortalNotification", "PortalInquiry",
]
