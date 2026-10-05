# Local Testing Commands — Wallet Contracts API

## 1. Start Postgres

```bash
docker compose -f compose.pg.yml up -d
```

Create the databases (first time only):

```bash
docker exec $(docker ps -qf ancestor=timescale/timescaledb:2.18.1-pg17) psql -U dev -c "CREATE DATABASE dev_data" -c "CREATE DATABASE dev_accounts"
```

If `docker exec` fails, find the container name with `docker ps` and use it directly:

```bash
docker exec <container_name> psql -U dev -c "CREATE DATABASE dev_data" -c "CREATE DATABASE dev_accounts"
```

## 2. Local config

Copy `config-dev.json` to `config.local.json` and change both DB hosts to `localhost`:

```json
"db": {
  "data": {
    "dialect": "postgres",
    "host": "localhost",
    "database": "dev_data",
    "username": "dev",
    "password": "dev"
  },
  "accounts": {
    "dialect": "postgres",
    "host": "localhost",
    "database": "dev_accounts",
    "username": "dev",
    "password": "dev"
  }
}
```

## 3. Build, migrate, seed

```bash
npm run build
CONFIG_FILE=config.local.json npm run db:init
CONFIG_FILE=config.local.json npm run db:migrate:accounts
CONFIG_FILE=config.local.json npm run db:seed:dev
```

The seed creates a dev account whose API key is literally `dev`.

## 4. Run the accounts server

```bash
CONFIG_FILE=config.local.json npm run serve:dev:nodocker:accounts
```

Serves on port 3420. Account routes are mounted at the root (no prefix).

## 5. Test the endpoints

```bash
curl -X POST http://localhost:3420/wallet-contracts \
  -H "x-api-key: dev" \
  -H "Content-Type: application/json" \
  -d '{"chainId": "xion-testnet-2", "walletAddress": "xion1...", "dossierContractAddress": "xion1..."}'
```

```bash
curl "http://localhost:3420/wallet-contracts?chainId=xion-testnet-2" -H "x-api-key: dev"
```

```bash
curl "http://localhost:3420/wallet-contracts?chainId=xion-testnet-2&walletAddress=xion1..." -H "x-api-key: dev"
```

Or use the `.http` file with the VS Code REST Client extension.

## Resetting the wallet-contracts table (dev only)

Needed if the migration file changed after it already ran locally (Sequelize won't re-run applied migrations):

```bash
docker exec $(docker ps -qf ancestor=timescale/timescaledb:2.18.1-pg17) psql -U dev -d dev_accounts -c "DROP TABLE IF EXISTS \"AccountWalletContracts\" CASCADE; DELETE FROM \"SequelizeMeta\" WHERE name LIKE '%account-wallet-contract%';"
```

```bash
CONFIG_FILE=config.local.json npm run db:migrate:accounts
```

## Notes

- Use Node 22 (`nvm use 22`). Newer Node versions break the `autodoc` postbuild step (`SlowBuffer` was removed).
- Addresses must be valid bech32 with the `xion` prefix, or POST returns 400.
- `chainId` is required on both POST (body) and GET (query param), and must be at most 255 characters.
- These endpoints only store an app's assertion. Bech32 validation does not prove the dossier contract exists on-chain or that the wallet deployed/owns it. Consumers must not treat mappings as proof of ownership.
- Every existing (non-test) API key can write these records, so keys must be backend-only. If keys are ever exposed to browser clients, introduce a separately scoped write credential first.
- From a physical mobile device, replace `localhost` with your machine's LAN IP. On Android emulator use `10.0.2.2`.
