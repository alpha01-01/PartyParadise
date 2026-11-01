from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: Optional[UUID] = None
    action: str
    module: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    changes: Optional[Any] = None
    extra_data: Optional[Any] = None
    created_at: datetime
