#!/bin/bash
set -e

API="http://localhost:4000"
ADMIN_USER="superadmin"
ADMIN_PASS="changeme123"
CHEF_PASS="staffpass123"

# ─── Stall menus ──────────────────────────────────
# Format: "Name|Price|Description|ImageURL"
# Description and image can be left empty: "Name|Price||"

CHINESE_MENU=(
  "Chicken Rice|5.50|Hainanese style with cucumber and chili|"
  "Beef Noodles|6.50|Hand-pulled noodles in beef broth|"
  "Wonton Soup|4.50|Pork wontons in clear broth|"
)

WESTERN_MENU=(
  "Chicken Chop|8.50|Grilled chicken with black pepper sauce|"
  "Fish & Chips|9.00|Battered fish with fries and tartar sauce|"
  "Beef Burger|7.50|Beef patty with cheese and lettuce|"
)

INDIAN_MENU=(
  "Chicken Briyani|7.00|Aromatic rice with spiced chicken|"
  "Roti Canai|2.50|Flaky flatbread with curry|"
  "Butter Chicken|8.00|Creamy tomato curry with naan|"
)

KOPITIAM_MENU=(
  "Nasi Lemak|5.00|Coconut rice with sambal and anchovies|"
  "Mee Goreng|5.50|Spicy stir-fried noodles|"
  "Kaya Toast Set|4.00|Toast with kaya, eggs, and kopi|"
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

login_chef() {
  local username="$1"
  curl -s -X POST "$API/staff/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$CHEF_PASS\"}" \
    | jq -r '.token'
}

add_menu_item() {
  local chef_token="$1"
  local name="$2"
  local price="$3"
  local description="$4"
  local image="$5"

  local body="{\"name\":\"$name\",\"price\":$price"
  [ -n "$description" ] && body+=",\"description\":\"$description\""
  [ -n "$image" ]       && body+=",\"image\":\"$image\""
  body+="}"

  curl -s -X POST "$API/staff/menu" \
    -H "Authorization: Bearer $chef_token" \
    -H "Content-Type: application/json" \
    -d "$body" > /dev/null
}

seed_stall() {
  local stall_name="$1"
  local chef_username="$2"
  shift 2
  local menu=("$@")

  echo ""
  echo "→ Seeding $stall_name (as $chef_username)..."

  local stall_id
  stall_id=$(get_stall_id "$stall_name")
  if [ -z "$stall_id" ] || [ "$stall_id" = "null" ]; then
    echo "  ❌ Stall '$stall_name' not found."
    return 1
  fi

  local chef_token
  chef_token=$(login_chef "$chef_username")
  if [ -z "$chef_token" ] || [ "$chef_token" = "null" ]; then
    echo "  ❌ Chef login failed for $chef_username (did you run seed-staff.sh?)"
    return 1
  fi

  for entry in "${menu[@]}"; do
    IFS='|' read -r name price desc image <<< "$entry"
    add_menu_item "$chef_token" "$name" "$price" "$desc" "$image"
    echo "  ✓ Added: $name (\$$price)"
  done
}

# ─── Main ─────────────────────────────────────────

need_jq

echo "========================================"
echo "Menu seeder"
echo "========================================"

# Check for existing orders that would block menu wipe
echo ""
echo "→ Checking for existing orders..."
ORDER_COUNT=$(PGPASSWORD=cafeteria_pass psql -h localhost -p 5432 -U cafeteria_user -d cafeteria -tA \
  -c 'SELECT COUNT(*) FROM "order";' | tr -d '[:space:]')

if [ "$ORDER_COUNT" != "0" ]; then
  echo "❌ Cannot wipe menu_item while orders exist ($ORDER_COUNT order rows reference menu items)."
  echo "   Run ./reset-data.sh first to clear orders, then re-run this script."
  exit 1
fi
echo "  ✓ No orders blocking the menu wipe"

echo ""
echo "→ Wiping menu_item table..."
PGPASSWORD=cafeteria_pass psql -h localhost -p 5432 -U cafeteria_user -d cafeteria > /dev/null \
  -c "DELETE FROM menu_item;"
echo "  ✓ menu_item cleared"

echo ""
echo "→ Logging in as superadmin..."
ADMIN_TOKEN=$(login_admin)
if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Superadmin login failed."
  exit 1
fi
echo "  ✓ Admin authenticated"

seed_stall "Chinese"  "chinese_chef_1"  "${CHINESE_MENU[@]}"
seed_stall "Western"  "western_chef_1"  "${WESTERN_MENU[@]}"
seed_stall "Indian"   "indian_chef_1"   "${INDIAN_MENU[@]}"
seed_stall "Kopitiam" "kopitiam_chef_1" "${KOPITIAM_MENU[@]}"

echo ""
echo "========================================"
echo "Done. 12 menu items seeded (3 per stall)."
echo "========================================"