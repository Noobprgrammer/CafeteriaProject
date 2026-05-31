import { Hono } from 'hono';
import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  menuItem,
  stall,
  user,
  orderGroup,
  orderList,
  order,
  idempotencyKey,
} from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { studentAuth } from '../middleware/studentAuth.js';
import { debitWallet } from '../lib/walletClient.js';

type StudentSession = {
  userId: string;
  studentID: string;
};

export const orderRoutes = new Hono<{
  Variables: { student: StudentSession };
}>();

orderRoutes.use('*', studentAuth);

// POST /orders
// Body: {
//   stalls: [{ stallId, items: [{ menuItemId, quantity }] }],
//   idempotencyKey: "uuid-from-client"
// }
orderRoutes.post('/', async (c) => {
  const s = c.get('student');
  const body = await c.req.json<{
    stalls?: { stallId: string; items: { menuItemId: string; quantity: number }[] }[];
    idempotencyKey?: string;
  }>();

  // ─── Basic input validation ──────────────────────────

  if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
    return c.json({ error: 'idempotencyKey is required' }, 400);
  }

  const idempotency = body.idempotencyKey;

  if (!body.stalls || body.stalls.length === 0) {
    return c.json({ error: 'Cart cannot be empty' }, 400);
  }

  const stalls = body.stalls;

  for (const sg of stalls) {
    if (!sg.stallId || !sg.items || sg.items.length === 0) {
      return c.json({ error: 'Each stall group must have a stallId and at least one item' }, 400);
    }
    for (const it of sg.items) {
      if (!it.menuItemId || typeof it.quantity !== 'number' || it.quantity < 1) {
        return c.json({ error: 'Invalid item: menuItemId required, quantity must be >= 1' }, 400);
      }
    }
  }

  // ─── Idempotency check ───────────────────────────────

  const existingKey = await db
    .select()
    .from(idempotencyKey)
    .where(eq(idempotencyKey.key, idempotency));

  if (existingKey.length > 0) {
    return c.json(JSON.parse(existingKey[0].response_body));
  }

  // ─── Collect every menu item ID + check ownership ───

  const allItemIds = stalls.flatMap((sg) => sg.items.map((it) => it.menuItemId));
  const uniqueItemIds = [...new Set(allItemIds)];

  const menuRows = await db
    .select()
    .from(menuItem)
    .where(
      and(
        inArray(menuItem.id, uniqueItemIds),
        eq(menuItem.isAvailable, true),
        eq(menuItem.isDelete, false)
      )
    );

  if (menuRows.length !== uniqueItemIds.length) {
    return c.json({ error: 'One or more items are unavailable or no longer exist' }, 409);
  }

  const menuById = new Map(menuRows.map((m) => [m.id, m]));

  // ─── Verify each item is in the stall it claims to be ───

  for (const sg of stalls) {
    for (const it of sg.items) {
      const m = menuById.get(it.menuItemId);
      if (!m || m.stall_id !== sg.stallId) {
        return c.json({ error: 'Item does not belong to the specified stall' }, 400);
      }
    }
  }

  // ─── Verify all stalls exist and are open ───────────

  const stallIds = stalls.map((sg) => sg.stallId);
  const stallRows = await db.select().from(stall).where(inArray(stall.id, stallIds));

  if (stallRows.length !== stallIds.length) {
    return c.json({ error: 'One or more stalls do not exist' }, 404);
  }
  for (const st of stallRows) {
    if (!st.is_open) {
      return c.json({ error: `Stall '${st.stallName}' is currently closed` }, 409);
    }
  }
  const stallById = new Map(stallRows.map((st) => [st.id, st]));

  // ─── Compute total from current DB prices ───────────

  let total = 0;
  for (const sg of stalls) {
    for (const it of sg.items) {
      const m = menuById.get(it.menuItemId)!;
      total += Number(m.price) * it.quantity;
    }
  }
  total = Math.round(total * 100) / 100;  // round to 2 decimals

  if (total <= 0) {
    return c.json({ error: 'Order total must be greater than zero' }, 400);
  }

  // ─── Debit the wallet FIRST (before any DB inserts) ─

  const debit = await debitWallet(s.studentID, total);
  if (!debit.ok) {
    if (debit.reason === 'insufficient_funds') {
      return c.json({ error: 'Insufficient funds' }, 402);
    }
    if (debit.reason === 'not_found') {
      return c.json({ error: 'Wallet not found' }, 404);
    }
    return c.json({ error: 'Wallet service error' }, 502);
  }

  // ─── Insert everything in a transaction ─────────────
  // If this fails, we have to refund the debit (manual recovery).
  // For MVP, we'll log the issue and trust it's rare.

  try {
    const result = await db.transaction(async (tx) => {
      // 1. order_group
      const [og] = await tx
        .insert(orderGroup)
        .values({ user_id: s.userId })
        .returning();

      // 2. For each stall, one order_list with sequence-generated pickup code
      const subOrders: {
        stallId: string;
        stallName: string;
        pickupCode: string;
        orderListId: string;
        items: { name: string; quantity: number; price: number }[];
      }[] = [];

      for (const sg of stalls) {
        const st = stallById.get(sg.stallId)!;

        // Compute the per-stall subtotal
        let subtotal = 0;
        for (const it of sg.items) {
          const m = menuById.get(it.menuItemId)!;
          subtotal += Number(m.price) * it.quantity;
        }
        subtotal = Math.round(subtotal * 100) / 100;

        // Get next pickup number from the stall's sequence
        const seqName = `pickup_seq_${st.prefix.toLowerCase()}`;
        const seqResult = await tx.execute(
          sql`SELECT nextval(${sql.raw(`'${seqName}'`)})::int as nextnum`
        );
        const nextNum = (seqResult.rows[0] as { nextnum: number }).nextnum;
        const pickupCode = `${st.prefix}${nextNum}`;

        // Insert order_list
        const [ol] = await tx
          .insert(orderList)
          .values({
            order_group_id: og.id,
            stall_id: sg.stallId,
            pin: pickupCode,
            status: 'paid',
            total_amount: subtotal.toFixed(2),
          })
          .returning();

        // Insert each line item
        for (const it of sg.items) {
          await tx.insert(order).values({
            order_list_id: ol.id,
            menu_id: it.menuItemId,
            quantity: it.quantity,
          });
        }

        const itemsResponse = sg.items.map((it) => {
          const m = menuById.get(it.menuItemId)!;
          return {
            name: m.itemName,
            quantity: it.quantity,
            price: Number(m.price),
          };
        });

        subOrders.push({
          stallId: sg.stallId,
          stallName: st.stallName,
          pickupCode,
          orderListId: ol.id,
          items: itemsResponse,
        });
      }

      // 3. Update cached wallet amount on user
      await tx
        .update(user)
        .set({ walletAmount: debit.balance.toFixed(2) })
        .where(eq(user.id, s.userId));

      const responsePayload = {
        orderGroupId: og.id,
        total,
        balance: debit.balance,
        subOrders,
      };

      // 4. Save idempotency response
      await tx.insert(idempotencyKey).values({
        key: idempotency,
        user_id: s.userId,
        order_group_id: og.id,
        response_body: JSON.stringify(responsePayload),
      });

      return responsePayload;
    });

    return c.json(result);
  } catch (err) {
    // Catastrophic: wallet debited but DB inserts failed.
    console.error('Order DB insert failed AFTER wallet debit:', err);
    return c.json(
      {
        error: 'Order failed after wallet debit. Please contact support.',
        debitedAmount: total,
      },
      500
    );
  }
});