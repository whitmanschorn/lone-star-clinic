"""Print the API's OpenAPI document as JSON.

The frontend's TypeScript types are generated from this output (`npm run
gen:types` at the repo root), so the API schema is the single source of truth.
It needs no database or running server.
"""

import json

from app.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
