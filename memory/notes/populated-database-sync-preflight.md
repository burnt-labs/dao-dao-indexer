---
title: Model-sync CLIs preflight every selected database before changing either
type: convention
scope: "{src/db/setup.ts,src/scripts/db/{setup,alter}.ts,package.json}"
confidence: 0.99
sources: [41, 42]
updated: 2026-11-28
---
`db:setup` and `db:alter` call `assertSyncAllowed` on all selected connections before any sync; preserve that ordering to avoid changing data DB before discovering a populated accounts DB.
Population means at least one row in a registered model table, excluding `States`, `WasmCodeKeys`, and `WasmCodeKeyIds`, which initialization itself seeds.
`getPopulatedTables` resolves explicit model schemas through PostgreSQL catalogs (even off search_path), otherwise uses visible relations, then probes with `LIMIT 1`; it rejects identifiers Sequelize would quote differently.
Only `--allow-populated` or `ALLOW_SYNC_ON_POPULATED_DB` equal to trimmed, case-insensitive `true` or `1` bypasses the check. Setup's `--force` skips confirmation, not this guard; `--destroy` is guarded too.
`db:init` runs migrations then setup, so these seed exclusions let empty initialization pass. Existing databases should use migrations instead of model sync.
The guard is at CLI level: the exported low-level `setup` helper itself calls sync without this check. Review new sync entry points for equivalent preflight.
See [[model-migration-index-parity]] for why rebuilding model indexes can undo deliberate production changes.
