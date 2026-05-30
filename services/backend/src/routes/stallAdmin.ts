import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { staff } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { hashPassword } from '../lib/auth.js';
import { staffAuth } from '../middleware/staffAuth.js';

type StaffUser = {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  stall_id: string | null;
};

export const stallAdminRoutes = new Hono<{
  Variables: { staff: StaffUser };
}>();

// Require: admin role AND assigned to a stall
stallAdminRoutes.use('*', staffAuth, async (c, next) => {
  const s = c.get('staff');
  if (s.role !== 'admin') {
    return c.json({ error: 'Stall admin access required' }, 403);
  }
  if (!s.stall_id) {
    return c.json({ error: 'Stall admin must be assigned to a stall' }, 403);
  }
  await next();
});

// POST /stall-admin/staff — create staff or admin for own stall
stallAdminRoutes.post('/staff', async (c) => {
  const self = c.get('staff');
  const body = await c.req.json<{
    username?: string;
    password?: string;
    role?: 'admin' | 'staff';
  }>();

  if (!body.username || !body.password || !body.role) {
    return c.json({ error: 'username, password, and role are required' }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }
  if (body.role !== 'admin' && body.role !== 'staff') {
    return c.json({ error: 'Role must be admin or staff' }, 400);
  }

  const existing = await db
    .select()
    .from(staff)
    .where(and(eq(staff.username, body.username), eq(staff.is_delete, false)));
  if (existing.length > 0) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  const hashed = await hashPassword(body.password);

  // stall_id is forced to the caller's own stall — they can't create staff for elsewhere
  const inserted = await db
    .insert(staff)
    .values({
      username: body.username,
      password: hashed,
      role: body.role,
      stall_id: self.stall_id,
    })
    .returning();

  return c.json({
    id: inserted[0].id,
    username: inserted[0].username,
    role: inserted[0].role,
    stall_id: inserted[0].stall_id,
  });
});

// GET /stall-admin/staff — list staff in own stall only
stallAdminRoutes.get('/staff', async (c) => {
  const self = c.get('staff');

  const list = await db
    .select({
      id: staff.id,
      username: staff.username,
      role: staff.role,
      stall_id: staff.stall_id,
      created_at: staff.created_at,
    })
    .from(staff)
    .where(and(eq(staff.stall_id, self.stall_id!), eq(staff.is_delete, false)));

  return c.json({ staff: list });
});

// DELETE /stall-admin/staff/:id — soft delete staff in own stall
stallAdminRoutes.delete('/staff/:id', async (c) => {
  const id = c.req.param('id');
  const self = c.get('staff');

  if (id === self.id) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  // Find target — must be in same stall and not already deleted
  const target = await db
    .select()
    .from(staff)
    .where(
      and(
        eq(staff.id, id),
        eq(staff.stall_id, self.stall_id!),
        eq(staff.is_delete, false)
      )
    );

  if (target.length === 0) {
    return c.json({ error: 'Staff not found in your stall' }, 404);
  }

  await db
    .update(staff)
    .set({ is_delete: true, token: null, last_active_at: null })
    .where(eq(staff.id, id));

  return c.json({ message: 'Staff deleted', id });
});