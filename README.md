# Argus

A state-based indexer and API builder for the Cosmos SDK, originally built for
[DAO DAO](https://daodao.zone).

## Setup

1. Create `config.json` from example `config.json.example`.

2. Install dependencies.

   ```bash
   npm install
   ```

3. Build the indexer.

   ```bash
   npm run build
   ```

4. Setup the database.

   ```bash
   # try migrating to generate the migrations table
   # this should FAIL, but that is ok
   npm run db:migrate:data

   npm run db:setup
   ```

5. Run the exporter or server.

   ```bash
   npm run export:prod
   # OR
   npm run serve:prod
   ```

6. Tell pm2 to run on startup.

   ```bash
   pm2 startup
   ```

### Config

Config defaults to loading from `config.json` in the root of the project, though
it supports loading from environment variables:

`env:KEY_NAME` in a field inside `config.json` will be replaced with the value of
the `KEY_NAME` environment variable, erroring if the variable is not set.

`envOptional:KEY_NAME` will not error if the variable is not set.

Environment variables/secrets are managed via
[Infisical](https://infisical.com) and used when deploying production servers.

```bash
# Log in via web browser (set INFISICAL_TOKEN in .env)
npx @infisical/cli login

# Log in via Infisical Universal Auth and save the token to .env
echo "INFISICAL_TOKEN=$(npx @infisical/cli login --method universal-auth --client-id <client-id> --client-secret <client-secret> --plain)" >> .env
# Save the project ID to .env
echo "INFISICAL_PROJECT_ID=$(cat .infisical.json | jq -r '.workspaceId')" >> .env
# Save the environment to .env
echo "INFISICAL_ENVIRONMENT=$(cat .infisical.json | jq -r '.defaultEnvironment')" >> .env

# Run a command with the environment variables set
npm run with-infisical -- <command>

# e.g. run the server
npm run with-infisical -- npm run serve

# if you need to run a command that uses inline env variables in the cmd, wrap
# it in `bash -c '...'` to avoid eager shell expansion since the variables
# aren't defined until the script is run
npm run with-infisical -- bash -c 'echo $INFISICAL_ENVIRONMENT'
```

## Usage

Test the indexer:

```bash
npm run docker:test
```

Build the indexer:

```bash
npm run build
```

Run the exporter:

```bash
npm run export
```

Run the API server:

```bash
npm run serve
```

Spawn a console to interact with the various database models and API formulas:

```bash
npm run console
```

### Testing transformations with a dump file

To test transformations with a dump file:

1. Place `dump.trace.pipe` in the root of the project.

2. Create `config.dump-test.json`, making sure to set `rpc`, `bech32Prefix`, and
   any `codeIds` you need to test:

   ```bash
   cp config.dump-test.json.example config.dump-test.json
   ```

3. Add your `*.test.ts` test files to `src/test/dump`.

4. Run:

```bash
npm run docker:test:dump
```

## Docker

To build the Docker image, run:

```bash
npm run docker:build
```

To tag and push to a container registry, run:

```bash
docker tag argus:latest your-registry/argus:latest
docker push your-registry/argus:latest
```

## Documentation

To understand how this indexer works and why it exists, read through the
[documentation](./docs/start.md).

## Database utilities

### Add read-only user in PostgreSQL

```sql
REVOKE ALL ON DATABASE db FROM readonly_user;
-- revoke access from all databases
SELECT format('REVOKE ALL ON DATABASE %I FROM readonly_user;', datname) FROM pg_database \gexec
-- grant connection access to all databases
SELECT format('GRANT CONNECT, SELECT ON DATABASE %I TO readonly_user;', datname) FROM pg_database WHERE datname = 'accounts' OR datname LIKE '%_%net' \gexec
-- grant access to use SELECT on all tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
-- grant access to list tables
GRANT USAGE ON SCHEMA public TO readonly_user;
-- grant read access to future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```

### Find the code IDs for a given Event key

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "WasmStateEvents" INNER JOIN "Contracts" ON "Contracts"."address" = "WasmStateEvents"."contractAddress" WHERE "key" = '' ORDER BY "codeId" ASC;
```

Find by contract name (key is `contract_info`)

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "WasmStateEvents" INNER JOIN "Contracts" ON "Contracts"."address" = "WasmStateEvents"."contractAddress" WHERE "key" = '99,111,110,116,114,97,99,116,95,105,110,102,111' AND value LIKE '%CONTRACT_NAME%' ORDER BY "codeId" ASC;
```

## Attribution

Credit to ekez for the initial idea and design of the state-based x/wasm
indexer, and noah for the subsequent architecting, implementation, and
optimization. Built for [DAO DAO](https://daodao.zone) and the CosmWasm
ecosystem as a whole.
