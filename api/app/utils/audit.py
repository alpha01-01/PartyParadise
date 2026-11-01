from typing import Any, Optional
from uuid import UUID

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.models.auth import AuditLog


def record_audit(
    db: Session,
    *,
    user_id: Optional[UUID],
    action: str,
    module: str,
    entity_type: str,
    entity_id: Any,
    changes: Optional[dict] = None,
    extra: Optional[dict] = None,
) -> None:
    """Add an audit row to the caller's transaction. The caller commits."""
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=str(entity_id),
        changes=jsonable_encoder(changes),
        extra_data=jsonable_encoder(extra),
    ))
