# Mock Wallet Service

A standalone HTTP service that simulates the university's wallet API. 
Built to be a drop-in stand-in: once the real university API is available, only the URL changes — the contract stays the same.

## What it does

This service is the **only thing** in the project allowed to touch the wallet database.
Other services (like the cafeteria backend) call it over HTTP to check and modify student balances.

It exposes two endpoints — the same shape a real wallet vendor would offer to a cafeteria partner:

| Endpoint | Purpose |
|---|---|
| `GET /wallet/:studentID` | Look up a student's balance |
| `POST /wallet/:studentID/debit` | Deduct money from a wallet (used at checkout) |

There is also a `GET /health` endpoint for service health verification.

The service **does not** support crediting wallets or seeding test data.
In real life, only the university can add money (via top-up stations or other internal systems).
To pre-load test data, insert rows directly into the wallet database via SQL — see `db/README.md`.

## Stack

- **Hono** — web framework
- **Drizzle ORM** — type-safe Postgres queries
- **PostgreSQL** — data storage (separate container)
- **Node 20** — runtime, Alpine base for the image

## Configuration

Environment variables (`.env`):

Note: hostname is `postgres-wallet` (the docker-compose service name), not `localhost`. The service runs inside the Docker network.

## Running

Built and managed via docker-compose from the project root:

```bash
docker compose build mock-wallet
docker compose up -d mock-wallet
docker compose logs mock-wallet
```

To stop:

```bash
docker compose stop mock-wallet
```

## Endpoints

### GET /health
Returns service health status.

**Response 200**
```json
{ "status": "ok", "service": "mock-wallet" }
```

### GET /wallet/:studentID
Returns the current balance for a student.

**Response 200**
```json
{
  "studentID": "TP000001",
  "balance": 50.00,
  "updated_at": "2026-05-28T14:36:21.059Z"
}
```

**Response 404** — Wallet not found
```json
{ "error": "Wallet not found" }
```

### POST /wallet/:studentID/debit
Deducts an amount from the wallet. Atomic — uses `SELECT ... FOR UPDATE` to prevent race conditions on concurrent debits.

**Request body**
```json
{ "amount": 14.50 }
```

**Response 200**
```json
{ "studentID": "TP000001", "balance": 35.50 }
```

**Response 400** — Invalid amount (must be a positive number)
**Response 402** — Insufficient funds
**Response 404** — Wallet not found

## Race condition protection

The `/debit` endpoint runs inside a Postgres transaction with `SELECT ... FOR UPDATE` on the wallet row. This means:

- Two concurrent debits on the same wallet are serialized. The second one waits, then re-reads the (now updated) balance and re-validates.
- A wallet with $20 can never be double-debited by two simultaneous $14 requests. The second debit sees $6 and fails the funds check.

## Folder structure
services/mock-wallet/
├── Dockerfile           # multi-stage: build + run
├── package.json
├── tsconfig.json
├── .env                 # local config (not committed)
└── src/
    ├── index.ts         # entry point: Hono app + server bootstrap
    ├── config.ts        # env var loader with validation
    ├── db/
        └── client.ts    # Drizzle/pg connection pool
    └── routes/
        └── wallet.ts    # all /wallet/* handlers

## Schema source

The wallet table schema is defined in `db/wallet/src/schema.ts` and imported here as `@cafeteria/db-wallet`. The package is a workspace dependency — there's only one source of truth.

## Swapping in the real university API later

When the real wallet API exists:

1. Update the cafeteria backend's `WALLET_API_URL` env var to point at the real service.
2. Stop the `mock-wallet` container.
3. Done. The cafeteria backend's code doesn't change — it always called an HTTP service, just at a different URL.