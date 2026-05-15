# dao-dao-indexer

> **Burnt Labs fork** of [Argus](https://github.com/noahsaso/argus) — the DAO DAO indexer for Cosmos SDK chains, adapted for **XION**.

This indexer listens to the XION blockchain, extracts DAO-related events, and serves indexed data via a REST API. The [Burnt dev dashboard](https://github.com/burnt-labs/dao-dao-ui) reads from this indexer to display DAO governance, proposals, and treasury data.

**Upstream:** [noahsaso/argus](https://github.com/noahsaso/argus)

---

## Burnt-Specific Modifications

This fork extends upstream Argus with the following XION-specific features:

| Feature | Description |
|---------|-------------|
| **XION extractors** | Custom extractors for XION assets (`xion-asset`) and marketplace (`xion-marketplace`) contracts — see `src/listener/extractors/xion/` |
| **Deposit webhooks** | Webhook-based deposit notifications for account-funded wallets — `src/listener/extractors/xion/depositWebhook.ts` |
| **cw-receipt payment integration** | Payment processing via the `cw-receipt` contract pattern with `uxion` native denom — configured via the `payment` block in config |
| **Account webhooks process** | Dedicated `account-webhooks` process in `ecosystem.config.js` for handling deposit webhook registrations |
| **Infisical-managed secrets** | Production config and secrets injected at runtime via [Infisical](https://infisical.com) — no production configs committed to the repo |

The upstream README is preserved at [`docs/upstream-argus-readme.md`](docs/upstream-argus-readme.md) for reference.

---

## Prerequisites

| Dependency | Version | Notes |
|-----------|---------|-------|
| **Node.js** | 22 | Used in Docker image and CI |
| **PostgreSQL** | 17 | For the accounts database |
| **TimescaleDB** | 2.18.1-pg17 | Required for the data database — plain Postgres will **not** work |
| **Redis** | Latest | Caching and job queue |
| **Docker** | 20+ | Recommended for local development |
| **Infisical CLI** | Latest | Required for production (secrets/config injection) |

---

## Quick Start

### Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/burnt-labs/dao-dao-indexer.git
cd dao-dao-indexer

# Copy the dev config (uses sensible defaults for Docker services)
cp config-dev.json config.json

# Start all services
docker compose -f compose.dev.yml up
```

This starts:
- **server** — API on port `3420`
- **listener** — blockchain event listener on port `3421`
- **workers** — background job processors
- **db_data** — TimescaleDB instance
- **db_accounts** — PostgreSQL instance
- **redis** — cache and queue

### Without Docker

```bash
# Install dependencies
npm install

# Build
npm run build

# Set up databases (requires running PostgreSQL + TimescaleDB + Redis)
npm run db:init -- -d
npm run db:seed:dev

# Start the API server
npm run serve:dev:nodocker
```

You'll need to provide a `config.json` (or use `-c <path>`) with your local database and Redis connection details. See [`config.json.example`](config.json.example) as a starting template.

---

## Configuration

### Config File Structure

The indexer reads a JSON config file (default: `config.json`, or via `-c <path>`). Key sections:

```jsonc
{
  "chainId": "xion-mainnet-1",       // XION chain ID
  "localRpc": "http://localhost:26657",
  "remoteRpc": "https://xion-rpc.burnt.com",
  "bech32Prefix": "xion",
  "home": "~/.xion/indexer",

  "redis": { "host": "127.0.0.1", "password": "" },

  "db": {
    "data": {
      "dialect": "postgres",
      "host": "localhost",
      "database": "data_db",
      "username": "user",
      "password": "pass"
    },
    "accounts": {
      "dialect": "postgres",
      "host": "localhost",
      "database": "accounts_db",
      "username": "user",
      "password": "pass"
    }
  },

  // Payment integration (Burnt-specific)
  "payment": {
    "cwReceiptAddress": "xion1...",
    "cwReceiptWebhookSecret": "secret",
    "nativeDenomAccepted": "uxion",
    "creditScaleFactor": 1
  },

  "accountsJwtSecret": "jwt-secret-for-accounts-api",

  "codeIds": {
    "dao-dao-core": [123],
    "xion-asset": [456],
    "xion-marketplace": [789]
  }
}
```

### XION Testnet / Mainnet

Production configs (`config.testnet.json`, `config.mainnet.json`) are **not committed** to this repo. They are injected at runtime via **Infisical**.

- **Testnet reference:** `xion-test.config.json` — the only committed XION config, used for E2E tests against `localxion-1`
- **Template:** `config.json.example` — upstream template (Jun-based, adapt for XION)
- **Dev:** `config-dev.json` — local Docker dev config

To run against a specific network:

```bash
# Testnet (config managed by Infisical)
npm run trace:prod    # starts tracer + workers
npm run listen:prod   # starts listener + workers

# Or manually with a config file:
npm run serve:dev:nodocker:testnet
npm run serve:dev:nodocker:mainnet
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CONFIG_FILE` | Path to config JSON (used by Docker Compose) |
| `NODE_ENV` | `development` or `production` |
| Infisical-managed | Database passwords, RPC URLs, secrets — injected by `npm run with-infisical` |

---

## Running Against XION

### Testnet

```bash
# 1. Ensure Infisical is configured for the project
infisical login

# 2. Run the tracer (indexes historical blocks)
npm run trace:prod

# 3. In a separate terminal, run the listener (live blocks)
npm run listen:prod
```

### Mainnet

Same as testnet — Infisical injects the correct `config.mainnet.json` with mainnet RPC endpoints and chain ID.

### Local Development (Docker)

```bash
# Start all services with dev config (connects to local XION node)
docker compose -f compose.dev.yml up
```

The dev config in `config-dev.json` points to `localhost:26657` by default. Override by editing the config or setting `CONFIG_FILE`.

---

## Architecture

The indexer consists of three core processes:

1. **Tracer** — Scans historical blocks from genesis, extracts events, and computes derived state via formulas
2. **Listener** — Subscribes to live blocks via Tendermint RPC and processes new events in real time
3. **Workers** — Background job processors for computationally expensive tasks (both foreground and background modes)

**Data flow:**
```
XION Blockchain (RPC)
  → Tracer/Listener (extract events)
    → Transformers (normalize data)
      → Database (TimescaleDB + PostgreSQL)
        → Server (REST API on port 3420)
          → Dev Dashboard / Consumers
```

For detailed architecture documentation, see the [`docs/`](docs/) directory. Note: those docs are from upstream Argus and reference Juno-specific details — the architecture is the same, but chain-specific config differs for XION.

---

## Deployment

### Docker Build

```bash
docker build -t dao-dao-indexer .
```

The Dockerfile uses `node:22-alpine` and builds the app in a multi-stage process.

### Production (PM2 + Infisical)

```bash
# Install dependencies and build
npm install && npm run build

# Run migrations with Infisical-managed config
npm run with-infisical -- npm run db:migrate:data

# Start processes via PM2
pm2 start ecosystem.config.js --only tracer,workers,workers-bg,renew-infisical-token
pm2 save
```

The `ecosystem.config.js` manages five processes:

| Process | Role |
|---------|------|
| `tracer` | Historical block indexing |
| `listener` | Live block indexing |
| `workers` | Foreground background jobs |
| `workers-bg` | Background jobs |
| `account-webhooks` | Deposit webhook delivery (Burnt-specific) |

---

## API

The server exposes a REST API on port **3420**. For API documentation, see [`docs/api.md`](docs/api.md).

Key endpoints include:
- DAO queries (proposals, votes, members)
- Treasury and staking data
- Account deposit webhook registrations
- Payment webhook processing

---

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires running XION test chain)
npm run test:e2e
```

---

## Related Projects

- [Argus (upstream)](https://github.com/noahsaso/argus) — Original DAO DAO indexer
- [DAO DAO UI](https://github.com/DA0-DA0/dao-dao) — DAO DAO front end
- [Burnt Dev Dashboard](https://github.com/burnt-labs/dao-dao-ui) — Burnt's dashboard consuming this indexer
- [XION](https://github.com/burnt-labs/xion) — XION blockchain

---

## License

[AGPL-3.0-only](LICENSE) — Same as upstream Argus.
