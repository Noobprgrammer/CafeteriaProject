import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { stall, menuItem } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';

export const stallRoutes = new Hono();

stallRoutes.get('/', async (c) => {
  const stalls = await db.select().from(stall);
  return c.json({
    stalls: stalls.map((s) => ({ id: s.id, name: s.stallName })),
  });
});

stallRoutes.get('/:id/menu', async (c) => {
  const stallId = c.req.param('id');

  const stallRows = await db.select().from(stall).where(eq(stall.id, stallId));
  if (stallRows.length === 0) {
    return c.json({ error: 'Stall not found' }, 404);
  }

  const items = await db
    .select()
    .from(menuItem)
    .where(
      and(
        eq(menuItem.stall_id, stallId),
        eq(menuItem.isAvailable, true),
        eq(menuItem.isDelete, false)
      )
    );

  return c.json({
    stall: { id: stallRows[0].id, name: stallRows[0].stallName},
    items: items.map((item) => ({
      id: item.id,
      name: item.itemName,
      description: item.description,
      price: Number(item.price),
      image: item.image,
    })),
  });
});