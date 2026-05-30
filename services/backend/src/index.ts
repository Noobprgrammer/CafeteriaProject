import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { pool } from './db/client.js';
import { stallRoutes } from './routes/stalls.js';
import { adminRoutes } from './routes/admin.js';
import { staffRoutes } from './routes/staff.js';
import { staffMenuRoutes } from './routes/staffMenu.js';
import { stallAdminRoutes } from './routes/stallAdmin.js';
import { devRoutes } from './routes/dev.js';
import { studentAuthRoutes } from './routes/studentAuth.js';
import { meRoutes } from './routes/me.js';

const app = new Hono();

app.use('*', logger());

app.get('/health', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({ status: 'ok', service: 'backend', db: 'reachable' });
  } catch (err) {
    return c.json({ status: 'degraded', service: 'backend', db: 'unreachable' }, 503);
  }
});

app.route('/stalls', stallRoutes);
app.route('/admin', adminRoutes);
app.route('/staff', staffRoutes);
app.route('/staff/menu', staffMenuRoutes);
app.route('/stall-admin', stallAdminRoutes);
app.route('/dev', devRoutes);
app.route('/auth', studentAuthRoutes);
app.route('/me', meRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`Backend running on port ${config.port}`);