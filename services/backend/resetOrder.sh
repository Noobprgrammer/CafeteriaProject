#!/bin/bash
set -e

echo "========================================"
echo "Resetting order data + wallets"
echo "========================================"

# ─── Cafeteria DB: wipe order-related tables only ─
echo ""
echo "→ Wiping order tables..."
PGPASSWORD=cafeteria_pass psql -h localhost -p 5432 -U cafeteria_user -d cafeteria > /dev/null <<'EOF'
DELETE FROM idempotency_key;
DELETE FROM "order";
DELETE FROM order_list;
DELETE FROM order_group;
EOF
echo "  ✓ Cleared: idempotency_key, order, order_list, order_group"
echo "  (menu_item preserved)"

# ─── Cafeteria DB: reset pickup sequences ─────────
echo ""
echo "→ Resetting pickup sequences..."
PGPASSWORD=cafeteria_pass psql -h localhost -p 5432 -U cafeteria_user -d cafeteria > /dev/null <<'EOF'
ALTER SEQUENCE pickup_seq_c RESTART WITH 1;
ALTER SEQUENCE pickup_seq_w RESTART WITH 1;
ALTER SEQUENCE pickup_seq_i RESTART WITH 1;
ALTER SEQUENCE pickup_seq_k RESTART WITH 1;
EOF
echo "  ✓ All pickup sequences reset to 1"

# ─── Wallet DB: reset balances ────────────────────
echo ""
echo "→ Resetting wallet balances..."
PGPASSWORD=wallet_pass psql -h localhost -p 5433 -U wallet_user -d wallet > /dev/null <<'EOF'
UPDATE wallet SET balance = 50.00,  updated_at = NOW() WHERE student_id = 'TP000001';
UPDATE wallet SET balance = 25.50,  updated_at = NOW() WHERE student_id = 'TP000002';
UPDATE wallet SET balance = 100.00, updated_at = NOW() WHERE student_id = 'TP000003';
UPDATE wallet SET balance = 5.00,   updated_at = NOW() WHERE student_id = 'TP000004';
UPDATE wallet SET balance = 200.00, updated_at = NOW() WHERE student_id = 'TP000005';
UPDATE wallet SET balance = 0.00,   updated_at = NOW() WHERE student_id = 'TP000006';
UPDATE wallet SET balance = 15.75,  updated_at = NOW() WHERE student_id = 'TP000007';
EOF
echo "  ✓ All 7 wallets reset"

echo ""
echo "========================================"
echo "Done."
echo "========================================"