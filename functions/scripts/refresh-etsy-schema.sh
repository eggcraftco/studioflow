#!/usr/bin/env bash
# Re-vendor the slice of Etsy's OpenAPI document that etsy-schema-drift.test.js
# checks against. Run it when Etsy announces API changes; a diff in the output
# is the API moving under us, which is the whole point.
set -euo pipefail
cd "$(dirname "$0")/.."
curl -sf -m 40 "https://www.etsy.com/openapi/generated/oas/3.0.0.json" -o /tmp/etsy-oas.json
python3 - <<'PY'
import json, io, datetime
spec=json.load(io.open("/tmp/etsy-oas.json",encoding="utf-8"))
s=spec["components"]["schemas"]
out={"fetchedFrom":"https://www.etsy.com/openapi/generated/oas/3.0.0.json",
     "fetchedOn":datetime.date.today().isoformat(),
     "ShopReceipt":sorted((s["ShopReceipt"].get("properties") or {}).keys()),
     "ShopReceiptTransaction":sorted((s["ShopReceiptTransaction"].get("properties") or {}).keys()),
     "statusEnum":s["ShopReceipt"]["properties"]["status"].get("enum") or []}
io.open("test/fixtures/etsy-receipt-schema.json","w").write(json.dumps(out,indent=1)+"\n")
print(f"refreshed: {len(out['ShopReceipt'])} receipt fields, {len(out['ShopReceiptTransaction'])} transaction fields")
PY
