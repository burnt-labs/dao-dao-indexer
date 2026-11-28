# Team memory index

_Generated; do not edit by hand. Read full notes with memory_read._

## convention
- **Index changes must account for model sync and migrations separately** (`model-migration-index-parity`) ["{src/db/models/**,src/db/migrations/data/**,sql/**,docs/feegrant.md}"] — Model declarations and migrations are separate schema-creati
- **Infisical credentials stay out of process arguments** (`infisical-secret-transport`) ["{infisical/**,*infisical*.sh,package.json,README.md,tests/infisical-scripts.mjs}"] — Infisical tokens and client secrets must travel through envi
- **Model-sync CLIs preflight every selected database before changing either** (`populated-database-sync-preflight`) ["{src/db/setup.ts,src/scripts/db/{setup,alter}.ts,package.json}"] — `db:setup` and `db:alter` call `assertSyncAllowed` on all se

## gotcha
- **Config loading owns a persistent watcher beyond database connection lifetime** (`config-watcher-cli-shutdown`) ["{src/config/manager.ts,src/scripts/db/**}"] — `ConfigManager` starts `fs.watchFile` with a five-second int
- **Listener recovery needs a listener-owned completion checkpoint** (`listener-checkpoint-ownership`) ["src/{scripts/listener.ts,services/BlockIterator.ts,db/models/State.ts,tracer/handlers/**,queues/queues/extract.ts}"] — `State.latestBlockHeight` is a shared high-water mark, not p
