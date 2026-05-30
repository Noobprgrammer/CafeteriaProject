import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { menuItem } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { staffAuth } from '../middleware/staffAuth.js';

type StaffUser = {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  stall_id: string | null;
};

export const staffMenuRoutes = new Hono<{
  Variables: { staff: StaffUser };
}>();

// All routes in this file require staff auth
staffMenuRoutes.use('*', staffAuth);

// GET /staff/menu — list this chef's stall's menu (excluding soft-deleted)
staffMenuRoutes.get('/', async (c) => {
  const s = c.get('staff');

  if (!s.stall_id) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  const items = await db
    .select()
    .from(menuItem)
    .where(
      and(
        eq(menuItem.stall_id, s.stall_id),
        eq(menuItem.isDelete, false)
      )
    );

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.itemName,
      description: item.description,
      price: Number(item.price),
      isAvailable: item.isAvailable,
      image: item.image,
      created_at: item.created_at,
    })),
  });
});

// POST /staff/menu — add a menu item
staffMenuRoutes.post('/', async (c) => {
  const s = c.get('staff');

  if (!s.stall_id) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  const body = await c.req.json<{
    name?: string;
    description?: string;
    price?: number;
    image?: string;
    isAvailable?: boolean;
  }>();

  if (!body.name || typeof body.price !== 'number') {
    return c.json({ error: 'name and price are required' }, 400);
  }
  if (body.price < 0) {
    return c.json({ error: 'price cannot be negative' }, 400);
  }

  const inserted = await db
    .insert(menuItem)
    .values({
      stall_id: s.stall_id,
      itemName: body.name,
      description: body.description ?? null,
      price: body.price.toFixed(2),
      isAvailable: body.isAvailable ?? true,
      image: body.image ?? null,
      isDelete: false,
    })
    .returning();

  const item = inserted[0];
  return c.json({
    id: item.id,
    name: item.itemName,
    description: item.description,
    price: Number(item.price),
    isAvailable: item.isAvailable,
    image: item.image,
    created_at: item.created_at,
  });
});

// PATCH /staff/menu/:id — partial update
staffMenuRoutes.patch('/:id', async (c) => {
  const s = c.get('staff');
  const id = c.req.param('id');

  if (!s.stall_id) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  // Verify the item belongs to this chef's stall
  const existing = await db
    .select()
    .from(menuItem)
    .where(and(eq(menuItem.id, id), eq(menuItem.stall_id, s.stall_id)));

  if (existing.length === 0) {
    return c.json({ error: 'Menu item not found in your stall' }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    description?: string | null;
    price?: number;
    image?: string | null;
    isAvailable?: boolean;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.itemName = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) {
    if (typeof body.price !== 'number' || body.price < 0) {
      return c.json({ error: 'Invalid price' }, 400);
    }
    updates.price = body.price.toFixed(2);
  }
  if (body.image !== undefined) updates.image = body.image;
  if (body.isAvailable !== undefined) updates.isAvailable = body.isAvailable;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const updated = await db
    .update(menuItem)
    .set(updates)
    .where(eq(menuItem.id, id))
    .returning();

  const item = updated[0];
  return c.json({
    id: item.id,
    name: item.itemName,
    description: item.description,
    price: Number(item.price),
    isAvailable: item.isAvailable,
    image: item.image,
  });
});

// DELETE /staff/menu/:id — soft delete
staffMenuRoutes.delete('/:id', async (c) => {
  const s = c.get('staff');
  const id = c.req.param('id');

  if (!s.stall_id) {
    return c.json({ error: 'Staff is not assigned to a stall' }, 400);
  }

  // Verify the item belongs to this chef's stall
  const existing = await db
    .select()
    .from(menuItem)
    .where(and(eq(menuItem.id, id), eq(menuItem.stall_id, s.stall_id)));

  if (existing.length === 0) {
    return c.json({ error: 'Menu item not found in your stall' }, 404);
  }

  await db
    .update(menuItem)
    .set({ isDelete: true })
    .where(eq(menuItem.id, id));

  return c.json({ message: 'Menu item deleted', id });
});