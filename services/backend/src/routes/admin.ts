import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { staff } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { hashPassword } from '../lib/auth.js';
import { staffAuth, adminOnly } from '../middleware/staffAuth.js';

type StaffUser = {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  stall_id: string | null;
};

export const adminRoutes = new Hono<{
  Variables: { staff: StaffUser };
}>();

// System admin only: must be admin AND have stall_id = NULL
adminRoutes.use('*', staffAuth, adminOnly, async (c, next) => {
  const s = c.get('staff');
  if (s.stall_id !== null) {
    return c.json({ error: 'System admin access required' }, 403);
  }
  await next();
});

// POST /admin/staff — create staff or admin
adminRoutes.post('/staff', async (c) => {
  const body = await c.req.json<{
    username?: string;
    password?: string;
    role?: 'admin' | 'staff';
    stall_id?: string | null;
  }>();

  if (!body.username || !body.password || !body.role) {
    return c.json({ error: 'username, password, and role are required' }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }
  if (body.role === 'staff' && !body.stall_id) {
    return c.json({ error: 'stall_id is required for staff role' }, 400);
  }

  // Check username is free (among non-deleted)
  const existing = await db
    .select()
    .from(staff)
    .where(and(eq(staff.username, body.username), eq(staff.is_delete, false)));
  if (existing.length > 0) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  const hashed = await hashPassword(body.password);

  const inserted = await db
    .insert(staff)
    .values({
      username: body.username,
      password: hashed,
      role: body.role,
      stall_id: body.stall_id ?? null,
    })
    .returning();

  return c.json({
    id: inserted[0].id,
    username: inserted[0].username,
    role: inserted[0].role,
    stall_id: inserted[0].stall_id,
  });
});

// GET /admin/staff — list all non-deleted staff
adminRoutes.get('/staff', async (c) => {
  const all = await db
    .select({
      id: staff.id,
      username: staff.username,
      role: staff.role,
      stall_id: staff.stall_id,
      created_at: staff.created_at,
    })
    .from(staff)
    .where(eq(staff.is_delete, false));

  return c.json({ staff: all });
});

// DELETE /admin/staff/:id — soft delete
adminRoutes.delete('/staff/:id', async (c) => {
  const id = c.req.param('id');
  const self = c.get('staff');

  if (id === self.id) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  const existing = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, id), eq(staff.is_delete, false)));
  if (existing.length === 0) {
    return c.json({ error: 'Staff not found' }, 404);
  }

  await db
    .update(staff)
    .set({ is_delete: true, token: null, last_active_at: null })
    .where(eq(staff.id, id));

  return c.json({ message: 'Staff deleted', id });
});