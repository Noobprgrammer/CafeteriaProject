import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { wallet } from '@cafeteria/db-wallet';
import { db } from '../db/client.js';

export const walletRoutes = new Hono();

// GET /wallet/:studentID
walletRoutes.get('/:studentID', async (c) => {
  const studentID = c.req.param('studentID');

  const rows = await db
    .select()
    .from(wallet)
    .where(eq(wallet.studentID, studentID));

  if (rows.length === 0) {
    return c.json({ error: 'Wallet not found' }, 404);
  }

  return c.json({
    studentID: rows[0].studentID,
    balance: Number(rows[0].balance),
    updated_at: rows[0].updated_at,
  });
});

// POST /wallet/:studentID/debit
walletRoutes.post('/:studentID/debit', async (c) => {
  const studentID = c.req.param('studentID');
  const body = await c.req.json<{ amount: number }>();

  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return c.json({ error: 'Invalid amount' }, 400);
  }

  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT balance FROM wallet WHERE student_id = ${studentID} FOR UPDATE`
    );

    if (locked.rows.length === 0) {
      return { ok: false as const, status: 404, error: 'Wallet not found' };
    }

    const currentBalance = Number(locked.rows[0].balance);
    if (currentBalance < body.amount) {
      return { ok: false as const, status: 402, error: 'Insufficient funds' };
    }

    const newBalance = currentBalance - body.amount;

    await tx
      .update(wallet)
      .set({ balance: newBalance.toFixed(2), updated_at: new Date() })
      .where(eq(wallet.studentID, studentID));

    return { ok: true as const, newBalance };
  });

  if (!result.ok) {
    return c.json({ error: result.error }, result.status as 404 | 402);
  }

  return c.json({ studentID, balance: result.newBalance });
});