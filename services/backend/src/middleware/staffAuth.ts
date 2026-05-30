import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import { staff } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';

type StaffUser = {
  id: string;
  username: string;
  role: 'admin' | 'staff';
  stall_id: string | null;
};

// 30-minute idle expiry for staff
const STAFF_SESSION_TTL_MS = 30 * 60 * 1000;

export const staffAuth = createMiddleware<{
  Variables: { staff: StaffUser };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid auth header' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);

  const rows = await db.select().from(staff).where(and(eq(staff.token, token), eq(staff.is_delete, false)));

  if (rows.length === 0) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const s = rows[0];

  if (!s.last_active_at) {
    return c.json({ error: 'Session invalid' }, 401);
  }
  const elapsed = Date.now() - s.last_active_at.getTime();
  if (elapsed > STAFF_SESSION_TTL_MS) {
    await db.update(staff).set({ token: null, last_active_at: null }).where(eq(staff.id, s.id));
    return c.json({ error: 'Session expired' }, 401);
  }

  await db.update(staff).set({ last_active_at: new Date() }).where(eq(staff.id, s.id));

  c.set('staff', {
    id: s.id,
    username: s.username,
    role: s.role,
    stall_id: s.stall_id,
  });

  await next();
});

export const adminOnly = createMiddleware<{
  Variables: { staff: StaffUser };
}>(async (c, next) => {
  const s = c.get('staff');
  if (s.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
});