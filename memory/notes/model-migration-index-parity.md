---
title: Index additions must cover migrated and model-synced databases
type: convention
scope: "src/db/{models/**,migrations/data/**}"
confidence: 0.98
sources: [36]
updated: 2026-11-27
---
Model index declarations and data migrations are separate schema-creation paths; an index needed in production must cover both.
The original create-block migration created only the primary key, while `Block` declared `timeUnixMs`; migration-only databases therefore missed the index used by `Block.getForTime`.
The repair migration `20261126200000-add-blocks-time-unix-ms-index.ts` uses the model-generated name `blocks_time_unix_ms` so later syncs reuse it.
For live-table additions, follow its concurrent, nontransactional build pattern, including checking `pg_index.indisvalid` and dropping an invalid index before `IF NOT EXISTS` creation.
Its no-op `down` deliberately preserves indexes that sync or operators may have created before the migration; do not assume rollback owns a preexisting index.
`Block.test.ts` verifies missing-index creation, reuse, repeat execution, invalid-index repair, and preservation on rollback. Review index changes against both creation paths, not just the decorator.
