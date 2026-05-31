#!/bin/bash
set -e

API="http://localhost:4000"
APP_SECRET="this-is-the-shared-secret-between-uni-app-and-cafeteria"

# ─── Helpers ──────────────────────────────────────

uuid() {
  if command -v uuidgen > /dev/null; then uuidgen
  else cat /proc/sys/kernel/random/uuid
  fi
}

print_section() {
  echo ""
  echo "========================================"
  echo "$1"
  echo "========================================"
}

expect_status() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $label: $actual"
  else
    echo "  ❌ $label: expected '$expected', got '$actual'"
  fi
}

# ─── Step 0: reset ─────────────────────────────────

print_section "Step 0: Reset order data + wallets"
./resetOrder.sh > /dev/null
echo "  ✓ Reset complete"

# ─── Step 1: student session ───────────────────────

print_section "Step 1: Student session for TP000001"
SESSION=$(curl -s "$API/auth/session?studentID=TP000001" \
  -H "X-App-Secret: $APP_SECRET" | jq -r '.token')

if [ -z "$SESSION" ] || [ "$SESSION" = "null" ]; then
  echo "❌ Session failed"; exit 1
fi
echo "  ✓ Session token: ${SESSION:0:20}..."

# ─── Step 2: fetch stall + menu ────────────────────

print_section "Step 2: Fetch Chinese stall + first menu item"
CHINESE_ID=$(curl -s "$API/stalls" | jq -r '.stalls[] | select(.name=="Chinese") | .id')
ITEM_ID=$(curl -s "$API/stalls/$CHINESE_ID/menu" | jq -r '.items[0].id')
echo "  Chinese stall: $CHINESE_ID"
echo "  First item:    $ITEM_ID"

# ─── Step 3: place order ───────────────────────────

print_section "Step 3: Place an order"
ORDER_RESP=$(curl -s -X POST "$API/orders" \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"idempotencyKey\": \"$(uuid)\",
    \"stalls\": [
      { \"stallId\": \"$CHINESE_ID\", \"items\": [{ \"menuItemId\": \"$ITEM_ID\", \"quantity\": 1 }] }
    ]
  }")
echo "$ORDER_RESP" | jq .
PICKUP=$(echo "$ORDER_RESP" | jq -r '.subOrders[0].pickupCode')
OLID=$(echo "$ORDER_RESP" | jq -r '.subOrders[0].orderListId')

# ─── Step 4: student polls active ──────────────────

print_section "Step 4: Student polls /orders/active"
STATUS=$(curl -s "$API/orders/active" -H "Authorization: Bearer $SESSION" | jq -r '.orders[0].status')
expect_status "Student sees status" "$STATUS" "paid"

# ─── Step 5: staff login ───────────────────────────

print_section "Step 5: Chef logs in"
CHEF=$(curl -s -X POST "$API/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"chinese_chef_2","password":"staffpass123"}' | jq -r '.token')

if [ -z "$CHEF" ] || [ "$CHEF" = "null" ]; then
  echo "❌ Chef login failed"; exit 1
fi
echo "  ✓ Chef token: ${CHEF:0:20}..."

# ─── Step 6: staff sees order ──────────────────────

print_section "Step 6: Chef sees the incoming order"
STAFF_VIEW=$(curl -s "$API/staff/orders" -H "Authorization: Bearer $CHEF")
echo "$STAFF_VIEW" | jq '.orders[] | {pickup: .pickupCode, status, studentID}'

# ─── Step 7: advance paid → preparing ──────────────

print_section "Step 7: Advance status: paid → preparing"
R=$(curl -s -X PATCH "$API/staff/orders/$OLID/status" -H "Authorization: Bearer $CHEF")
echo "$R" | jq .
NEW=$(echo "$R" | jq -r '.status')
expect_status "Status now" "$NEW" "preparing"

# ─── Step 8: advance preparing → completed ─────────

print_section "Step 8: Advance status: preparing → completed"
R=$(curl -s -X PATCH "$API/staff/orders/$OLID/status" -H "Authorization: Bearer $CHEF")
echo "$R" | jq .
NEW=$(echo "$R" | jq -r '.status')
expect_status "Status now" "$NEW" "completed"

# ─── Step 9: try advancing past completed ──────────

print_section "Step 9: Try advancing again (should fail)"
R=$(curl -s -X PATCH "$API/staff/orders/$OLID/status" -H "Authorization: Bearer $CHEF")
echo "$R" | jq .
ERR=$(echo "$R" | jq -r '.error // "none"')
if [[ "$ERR" == *"Cannot advance"* ]]; then
  echo "  ✓ Correctly rejected"
else
  echo "  ❌ Should have been rejected"
fi

# ─── Step 10: student sees completed ───────────────

print_section "Step 10: Student now sees 'completed'"
STATUS=$(curl -s "$API/orders/active" -H "Authorization: Bearer $SESSION" | jq -r '.orders[0].status')
expect_status "Student sees status" "$STATUS" "completed"

# ─── Step 11: collect by pin ───────────────────────

print_section "Step 11: Chef collects order with pin '$PICKUP'"
R=$(curl -s -X POST "$API/staff/orders/collect-by-pin" \
  -H "Authorization: Bearer $CHEF" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PICKUP\"}")
echo "$R" | jq .
NEW=$(echo "$R" | jq -r '.status')
expect_status "Status now" "$NEW" "collected"

# ─── Step 12: both sides empty ─────────────────────

print_section "Step 12: Both active lists should be empty"

STUDENT_COUNT=$(curl -s "$API/orders/active" -H "Authorization: Bearer $SESSION" | jq '.orders | length')
echo "  Student active count: $STUDENT_COUNT"
[ "$STUDENT_COUNT" = "0" ] && echo "  ✓ Student list empty" || echo "  ❌ Expected 0"

STAFF_COUNT=$(curl -s "$API/staff/orders" -H "Authorization: Bearer $CHEF" | jq '.orders | length')
echo "  Staff active count:   $STAFF_COUNT"
[ "$STAFF_COUNT" = "0" ] && echo "  ✓ Staff list empty" || echo "  ❌ Expected 0"

# ─── Step 13: re-collect attempt ───────────────────

print_section "Step 13: Re-collect attempt (should fail)"
R=$(curl -s -X POST "$API/staff/orders/collect-by-pin" \
  -H "Authorization: Bearer $CHEF" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$PICKUP\"}")
echo "$R" | jq .
ERR=$(echo "$R" | jq -r '.error // "none"')
if [[ "$ERR" != "none" ]]; then
  echo "  ✓ Correctly rejected: $ERR"
else
  echo "  ❌ Should have been rejected"
fi

print_section "All lifecycle steps complete"