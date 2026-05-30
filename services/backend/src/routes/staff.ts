import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { staff } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { verifyPassword, generateToken } from '../lib/auth.js';
import { staffAuth } from '../middleware/staffAuth.js';

export const staffRoutes = new Hono();

// POST /staff/login
staffRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const rows = await db.select().from(staff).where(and(eq(staff.username, body.username), eq(staff.is_delete, false)));

  if (rows.length === 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const s = rows[0];
  const ok = await verifyPassword(body.password, s.password);
  if (!ok) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = generateToken();
  await db
    .update(staff)
    .set({ token, last_active_at: new Date() })
    .where(eq(staff.id, s.id));

  return c.json({
    token,
    staff: {
      id: s.id,
      username: s.username,
      role: s.role,
      stall_id: s.stall_id,
    },
  });
});

// GET /staff/me
staffRoutes.get('/me', staffAuth, async (c) => {
  const s = c.get('staff');
  return c.json({ staff: s });
});

// POST /staff/logout
staffRoutes.post('/logout', staffAuth, async (c) => {
  const s = c.get('staff');
  await db
    .update(staff)
    .set({ token: null, last_active_at: null })
    .where(eq(staff.id, s.id));
  return c.json({ message: 'Logged out' });
});