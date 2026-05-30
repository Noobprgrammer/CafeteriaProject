import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import { user } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';

type StudentSession = {
  userId: string;
  studentID: string;
};

const STUDENT_SESSION_TTL_MS = 30 * 60 * 1000;

export const studentAuth = createMiddleware<{
  Variables: { student: StudentSession };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid auth header' }, 401);
  }

  const token = authHeader.slice('Bearer '.length);

  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.token, token), eq(user.status, 'active')));

  if (rows.length === 0) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  const u = rows[0];

  // TODO: when orders exist, override expiry if the user has uncollected orders
  const elapsed = Date.now() - u.last_active_at.getTime();
  if (elapsed > STUDENT_SESSION_TTL_MS) {
    await db.update(user).set({ status: 'inactive' }).where(eq(user.id, u.id));
    return c.json({ error: 'Session expired' }, 401);
  }

  // Slide forward
  await db.update(user).set({ last_active_at: new Date() }).where(eq(user.id, u.id));

  c.set('student', { userId: u.id, studentID: u.studentID });

  await next();
});