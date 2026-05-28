import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { walletRoutes } from './routes/wallet.js';

const app = new Hono();

app.use('*', logger());

app.get('/health', (c) => c.json({ status: 'ok', service: 'mock-wallet' }));

app.route('/wallet', walletRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

serve({
  fetch: app.fetch,
  port: config.port,
});

console.log(`Mock wallet running on port ${config.port}`);