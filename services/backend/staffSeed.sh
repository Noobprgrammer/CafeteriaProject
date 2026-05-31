#!/bin/bash
set -e

API="http://localhost:4000"
ADMIN_USER="superadmin"
ADMIN_PASS="changeme123"
STAFF_PASS="staffpass123"

# ─── Stall → staff list mapping ───────────────────
# Per stall: 2 stall admins + 2 chefs
# Format: "username:role" (role is 'admin' for stall admin, 'staff' for chef)

CHINESE_STAFF=(
  "chinese_admin_1:admin"
  "chinese_admin_2:admin"
  "chinese_chef_2:staff"
)

WESTERN_STAFF=(
  "western_admin_1:admin"
  "western_admin_2:admin"
  "western_chef_1:staff"
  "western_chef_2:staff"
)

INDIAN_STAFF=(
  "indian_admin_1:admin"
  "indian_admin_2:admin"
  "indian_chef_1:staff"
  "indian_chef_2:staff"
)

KOPITIAM_STAFF=(
  "kopitiam_admin_1:admin"
  "kopitiam_admin_2:admin"
  "kopitiam_chef_1:staff"
  "kopitiam_chef_2:staff"
)

# ─── Helpers ──────────────────────────────────────

need_jq() {
  if ! command -v jq > /dev/null; then
    echo "❌ 'jq' is required. Install: sudo apt install -y jq"
    exit 1
  fi
}

login_admin() {
  curl -s -X POST "$API/staff/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
    | jq -r '.token'
}

get_stall_id() {
  local name="$1"
  curl -s "$API/stalls" | jq -r --arg n "$name" '.stalls[] | select(.name==$n) | .id'
}

create_staff() {
  local username="$1"
  local role="$2"
  local stall_id="$3"
  local admin_token="$4"

  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$API/admin/staff" \
    -H "Authorization: Bearer $admin_token" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$STAFF_PASS\",\"role\":\"$role\",\"stall_id\":\"$stall_id\"}")

  local code
  code=$(echo "$resp" | tail -n1)
  local body
  body=$(echo "$resp" | sed '$d')

  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "  ✓ $username ($role)"
  elif [ "$code" = "409" ]; then
    echo "  ↷ $username already exists, skipped"
  else
    echo "  ❌ $username failed: HTTP $code — $body"
  fi
}

seed_stall_staff() {
  local stall_name="$1"
  shift
  local staff_list=("$@")

  echo ""
  echo "→ Seeding staff for $stall_name..."

  local stall_id
  stall_id=$(get_stall_id "$stall_name")
  if [ -z "$stall_id" ] || [ "$stall_id" = "null" ]; then
    echo "  ❌ Stall '$stall_name' not found"
    return 1
  fi

  for entry in "${staff_list[@]}"; do
    IFS=':' read -r username role <<< "$entry"
    create_staff "$username" "$role" "$stall_id" "$ADMIN_TOKEN"
  done
}

# ─── Main ─────────────────────────────────────────

need_jq

echo "========================================"
echo "Staff seeder"
echo "========================================"

echo ""
echo "→ Logging in as superadmin..."
ADMIN_TOKEN=$(login_admin)
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Superadmin login failed."
  exit 1
fi
echo "  ✓ Admin authenticated"

seed_stall_staff "Chinese"  "${CHINESE_STAFF[@]}"
seed_stall_staff "Western"  "${WESTERN_STAFF[@]}"
seed_stall_staff "Indian"   "${INDIAN_STAFF[@]}"
seed_stall_staff "Kopitiam" "${KOPITIAM_STAFF[@]}"

echo ""
echo "========================================"
echo "Done."
echo "  All staff passwords: $STAFF_PASS"
echo "========================================"