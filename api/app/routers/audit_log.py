from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.dependencies import require_permission
from app.models import AuditLog
from app.schemas.audit_log import AuditLogOut

router = APIRouter()

@router.get("/", response_model=List[AuditLogOut])
def list_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_permission("users:read")),
):
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
