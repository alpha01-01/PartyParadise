from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer

# Exact in Python, a number in JSON. Pydantic would otherwise send a string,
# and the web client adds these values together.
Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
