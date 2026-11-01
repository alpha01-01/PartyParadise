import json
from typing import Optional


def parse_shop_sale_meta(notes: Optional[str]) -> dict:
    if not notes:
        return {}
    try:
        payload = json.loads(notes)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) and payload.get("type") == "shop_sale" else {}


def display_notes(notes: Optional[str]) -> Optional[str]:
    """Invoice notes as people should read them, without shop sale metadata."""
    meta = parse_shop_sale_meta(notes)
    return meta.get("notes") if meta else notes
