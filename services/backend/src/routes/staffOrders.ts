import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and, ne, inArray } from 'drizzle-orm';
import {
  menuItem,
  stall,
  orderGroup,
  orderList,
  order,
  user,
} from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { staffAuth } from '../middleware/staffAuth.js';

type StaffUser = {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  stall_id: string | null;
};

export const staffOrderRoutes = new Hono<{
  Variables: { staff: StaffUser };
}>();

// All routes here require staff auth
staffOrderRoutes.use('*', staffAuth);

// Helper: enforce the staff has a stall_id (chef or stall_admin)
function requireStall(c: Context<{ Variables: { staff: StaffUser } }>): string | null {
  const s = c.get('staff') as StaffUser;
  if (!s.stall_id) {
    return null;
  }
  return s.stall_id;
}

// ─── GET /staff/orders — active orders for this stall ─────────

staffOrderRoutes.get('/', async (c) => {
  const stallId = requireStall(c);
  if (!stallId) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  const rows = await db
    .select({
      orderListId: orderList.id,
      orderGroupId: orderList.order_group_id,
      pickupCode: orderList.pin,
      status: orderList.status,
      total: orderList.total_amount,
      createdAt: orderList.created_at,
      studentID: user.studentID,
    })
    .from(orderList)
    .innerJoin(orderGroup, eq(orderGroup.id, orderList.order_group_id))
    .innerJoin(user, eq(user.id, orderGroup.user_id))
    .where(
      and(
        eq(orderList.stall_id, stallId),
        ne(orderList.status, 'collected')
      )
    );

  if (rows.length === 0) {
    return c.json({ orders: [] });
  }

  // Fetch line items
  const orderListIds = rows.map((r) => r.orderListId);
  const lineItems = await db
    .select({
      orderListId: order.order_list_id,
      quantity: order.quantity,
      itemName: menuItem.itemName,
      price: menuItem.price,
    })
    .from(order)
    .innerJoin(menuItem, eq(menuItem.id, order.menu_id))
    .where(inArray(order.order_list_id, orderListIds));

  const itemsByList = new Map<string, { name: string; quantity: number; price: number }[]>();
  for (const li of lineItems) {
    if (!itemsByList.has(li.orderListId)) {
      itemsByList.set(li.orderListId, []);
    }
    itemsByList.get(li.orderListId)!.push({
      name: li.itemName,
      quantity: li.quantity,
      price: Number(li.price),
    });
  }

  return c.json({
    orders: rows.map((r) => ({
      orderListId: r.orderListId,
      orderGroupId: r.orderGroupId,
      pickupCode: r.pickupCode,
      status: r.status,
      total: Number(r.total),
      placedAt: r.createdAt,
      studentID: r.studentID,
      items: itemsByList.get(r.orderListId) ?? [],
    })),
  });
});

// ─── PATCH /staff/orders/:orderListId/status ──────────────────

// Allowed transitions (strict, forward only)
const ALLOWED: Record<string, string> = {
  paid: 'preparing',
  preparing: 'completed',
};

staffOrderRoutes.patch('/:orderListId/status', async (c) => {
  const stallId = requireStall(c);
  if (!stallId) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  const orderListId = c.req.param('orderListId');

  // Look up the order_list, scoped to this stall
  const rows = await db
    .select()
    .from(orderList)
    .where(and(eq(orderList.id, orderListId), eq(orderList.stall_id, stallId)));

  if (rows.length === 0) {
    return c.json({ error: 'Order not found for your stall' }, 404);
  }

  const ol = rows[0];
  const currentStatus = ol.status;
  const nextStatus = ALLOWED[currentStatus];

  if (!nextStatus) {
    return c.json(
      {
        error: `Cannot advance status from '${currentStatus}'`,
        currentStatus,
      },
      409
    );
  }

  await db
    .update(orderList)
    .set({ status: nextStatus as 'paid' | 'preparing' | 'completed' | 'collected' })
    .where(eq(orderList.id, orderListId));

  return c.json({
    orderListId: ol.id,
    pickupCode: ol.pin,
    previousStatus: currentStatus,
    status: nextStatus,
  });
});

// ─── POST /staff/orders/collect-by-pin ────────────────────────

staffOrderRoutes.post('/collect-by-pin', async (c) => {
  const stallId = requireStall(c);
  if (!stallId) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  const body = await c.req.json<{ pin?: string }>();
  if (!body.pin || typeof body.pin !== 'string') {
    return c.json({ error: 'pin is required' }, 400);
  }

  // Look up the order_list by pin AND this stall's id (exact match, case-sensitive)
  const rows = await db
    .select()
    .from(orderList)
    .where(and(eq(orderList.pin, body.pin), eq(orderList.stall_id, stallId)));

  if (rows.length === 0) {
    return c.json({ error: 'No order with that pin at your stall' }, 404);
  }

  const ol = rows[0];

  if (ol.status === 'collected') {
    return c.json(
      { error: 'This order has already been collected', orderListId: ol.id },
      409
    );
  }

  if (ol.status !== 'completed') {
    return c.json(
      {
        error: 'Order is not ready for pickup yet',
        currentStatus: ol.status,
      },
      409
    );
  }

  await db
    .update(orderList)
    .set({ status: 'collected' })
    .where(eq(orderList.id, ol.id));

  return c.json({
    orderListId: ol.id,
    pickupCode: ol.pin,
    previousStatus: 'completed',
    status: 'collected',
  });
});