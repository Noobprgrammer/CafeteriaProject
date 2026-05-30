import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { user } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { generateToken } from '../lib/auth.js';
import { fetchWalletBalance } from '../lib/walletClient.js';
import { config } from '../config.js';
import { studentAuth } from '../middleware/studentAuth.js';

type StudentSession = {
  userId: string;
  studentID: string;
};

export const studentAuthRoutes = new Hono<{
  Variables: { student: StudentSession };
}>();

// GET /auth/session?studentID=TP000001
// Called by the uni app (or dev launcher) to start a student session
studentAuthRoutes.get('/session', async (c) => {
  // Verify shared secret
  const secret = c.req.header('X-App-Secret');
  if (secret !== config.appSecret) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const studentID = c.req.query('studentID');
  if (!studentID) {
    return c.json({ error: 'studentID is required' }, 400);
  }

  // Check the wallet — being in the wallet = being a valid student
  const balance = await fetchWalletBalance(studentID);
  if (balance === null) {
    return c.json({ error: 'Student not found in wallet system' }, 404);
  }

  // Resume existing active session if present
  const existing = await db
    .select()
    .from(user)
    .where(and(eq(user.studentID, studentID), eq(user.status, 'active')));

  if (existing.length > 0) {
    const u = existing[0];
    await db
      .update(user)
      .set({
        walletAmount: balance.toFixed(2),
        last_active_at: new Date(),
      })
      .where(eq(user.id, u.id));

    return c.json({
      token: u.token,
      student: { userId: u.id, studentID: u.studentID, balance },
      resumed: true,
    });
  }

  // Otherwise create a new user row
  const sessionToken = generateToken();
  const inserted = await db
    .insert(user)
    .values({
      studentID,
      walletAmount: balance.toFixed(2),
      token: sessionToken,
      status: 'active',
    })
    .returning();

  const u = inserted[0];
  return c.json({
    token: u.token,
    student: { userId: u.id, studentID: u.studentID, balance },
    resumed: false,
  });
});

// POST /auth/logout
studentAuthRoutes.post('/logout', studentAuth, async (c) => {
  const s = c.get('student');
  await db.update(user).set({ status: 'inactive' }).where(eq(user.id, s.userId));
  return c.json({ message: 'Logged out' });
});