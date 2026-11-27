# AGENTS.md

## Infisical

- Never put Infisical tokens or client secrets in command-line arguments, shell-history examples, or logs. Use `npm run with-infisical -- <command>` to supply `INFISICAL_TOKEN` through the environment, and use the scripts in `infisical/` for login, renewal, and revocation; send secrets in HTTPS request bodies and redact external error text with the helpers in `infisical/common.mjs`.
- When changing Infisical token handling, use `writeTokenToEnvFile` in `infisical/common.mjs` for token updates to preserve locking and atomic mode-600 writes; pass `expectedCurrent` when renewing so an overlapping rotation is not overwritten. Run `npm run test:infisical` after changing Infisical scripts or wrappers.

## Learned rules

<!-- tribunal:learned-rules:start -->
- When adding a model index needed by existing databases, add a data migration in `src/db/migrations/data/` using the same index name as the model; do not rely on `sequelize.sync` to update migration-only deployments.
- Build indexes on actively written tables with `CREATE INDEX CONCURRENTLY` outside a transaction; make retries handle invalid indexes left by interrupted builds by checking `pg_index.indisvalid` and dropping invalid indexes concurrently before using `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
<!-- tribunal:learned-rules:end -->
