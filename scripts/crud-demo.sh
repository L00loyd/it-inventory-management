#!/usr/bin/env bash
# Demonstrates CREATE, READ, UPDATE and DELETE (plus error cases) against a running server.
# Usage:  ./scripts/crud-demo.sh https://your-app.onrender.com
#         ./scripts/crud-demo.sh http://localhost:3000
# Needs curl. Uses jq for tidy output if it is installed.
set -u
BASE="${1:-http://localhost:3000}"
H='Content-Type: application/json'
pretty() { if command -v jq >/dev/null; then jq .; else cat; fi; }

call() {  # call <title> <method> <path> [json-body]
  echo; echo "=== $1"; echo "$2 $3 ${4:+$4}"
  local out; out=$(curl -s -w '\n%{http_code}' -X "$2" "$BASE$3" -H "$H" ${4:+-d "$4"})
  echo "HTTP $(echo "$out" | tail -n1)"; echo "$out" | sed '$d' | pretty
}

BODY='{"sku":"DEMO-001","product_name":"Demo 27in Monitor","category":"Monitor","supplier":"Dell Technologies","unit_price":899.5,"stock_quantity":8,"reorder_level":3}'
BODY2='{"sku":"DEMO-001","product_name":"Demo 27in Monitor","category":"Monitor","supplier":"Dell Technologies","unit_price":850,"stock_quantity":2,"reorder_level":3}'

# Remove leftovers from an earlier run so the demo can be repeated.
OLD=$(curl -s "$BASE/api/products" | tr '{' '\n' | grep '"sku":"DEMO-001"' | sed 's/.*"product_id":\([0-9]*\).*/\1/')
[ -n "$OLD" ] && curl -s -o /dev/null -X DELETE "$BASE/api/products/$OLD"

call "0. Health check (app can reach the cloud database)" GET /api/health
call "1. CREATE a product" POST /api/products "$BODY"
ID=$(curl -s "$BASE/api/products" | tr '{' '\n' | grep '"sku":"DEMO-001"' | sed 's/.*"product_id":\([0-9]*\).*/\1/')
echo; echo "(new product_id = $ID)"
call "2. READ one product" GET "/api/products/$ID"
call "3. UPDATE the product (price and stock change)" PUT "/api/products/$ID" "$BODY2"
call "4. READ again: change is stored" GET "/api/products/$ID"
call "5. Error: invalid input" POST /api/products '{"sku":"x","product_name":"","category":"Monitor","supplier":"Dell Technologies","unit_price":-1,"stock_quantity":1,"reorder_level":1}'
call "6. Error: duplicate SKU" POST /api/products "$BODY"
call "7. DELETE the product" DELETE "/api/products/$ID"
call "8. Error: READ the deleted product" GET "/api/products/$ID"
