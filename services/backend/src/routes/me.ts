import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { user } from '@cafeteria/db-cafeteria';
import { db } from '../db/client.js';
import { studentAuth } from '../middleware/studentAuth.js';
import { fetchWalletBalance } from '../lib/walletClient.js';

type StudentSession = {
  userId: string;
  studentID: string;
};

export const meRoutes = new Hono<{
  Variables: { student: StudentSession };
}>();

meRoutes.use('*', studentAuth);

meRoutes.get('/', async (c) => {
  const s = c.get('student');

  // Always fetch fresh balance — the wallet is the source of truth
  const balance = await fetchWalletBalance(s.studentID);
  if (balance === null) {
    return c.json({ error: 'Wallet not found' }, 500);
  }

  await db
    .update(user)
    .set({ walletAmount: balance.toFixed(2) })
    .where(eq(user.id, s.userId));

  return c.json({
    userId: s.userId,
    studentID: s.studentID,
    balance,
  });
});