# Team memory index

_Generated; do not edit by hand. Read full notes with memory_read._

## convention
- **Infisical credentials stay out of process arguments** (`infisical-secret-transport`) ["{infisical/**,*infisical*.sh,package.json,README.md,tests/infisical-scripts.mjs}"] — Infisical tokens and client secrets must travel through envi

## gotcha
- **Listener recovery needs a listener-owned completion checkpoint** (`listener-checkpoint-ownership`) ["src/{scripts/listener.ts,services/BlockIterator.ts,db/models/State.ts,tracer/handlers/**,queues/queues/extract.ts}"] — `State.latestBlockHeight` is a shared high-water mark, not p
