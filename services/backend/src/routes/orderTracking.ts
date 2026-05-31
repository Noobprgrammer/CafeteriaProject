import { Hono } from 'hono';
import { eq, and, ne, inArray } from 'drizzle-orm';
import {
  menuItem,
  stall,
  orderGroup,
  orderList,
  order,
} from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { studentAuth } from '../middleware/studentAuth.js';

type StudentSession = {
  userId: string;
  studentID: string;
};

export const orderTrackingRoutes = new Hono<{
  Variables: { student: StudentSession };
}>();

// All tracking routes require student auth
orderTrackingRoutes.use('*', studentAuth);

// GET /orders/active — this student's currently active sub-orders
orderTrackingRoutes.get('/active', async (c) => {
  const s = c.get('student');

  const rows = await db
    .select({
      orderListId: orderList.id,
      orderGroupId: orderList.order_group_id,
      pickupCode: orderList.pin,
      status: orderList.status,
      total: orderList.total_amount,
      createdAt: orderList.created_at,
      stallId: stall.id,
      stallName: stall.stallName,
    })
    .from(orderList)
    .innerJoin(orderGroup, eq(orderGroup.id, orderList.order_group_id))
    .innerJoin(stall, eq(stall.id, orderList.stall_id))
    .where(
      and(
        eq(orderGroup.user_id, s.userId),
        ne(orderList.status, 'collected')
      )
    );

  if (rows.length === 0) {
    return c.json({ orders: [] });
  }

  // Batch-fetch line items for all these sub-orders
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
      stallId: r.stallId,
      stallName: r.stallName,
      pickupCode: r.pickupCode,
      status: r.status,
      total: Number(r.total),
      placedAt: r.createdAt,
      items: itemsByList.get(r.orderListId) ?? [],
    })),
  });
});