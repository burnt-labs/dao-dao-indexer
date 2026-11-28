---
title: Index changes must account for model sync and migrations separately
type: convention
scope: "{src/db/models/**,src/db/migrations/data/**,sql/**,docs/feegrant.md}"
confidence: 0.98
sources: [36, 37, 40]
updated: 2026-11-28
---
Model declarations and migrations are separate schema-creation paths; a required new index must cover both.
`Block`'s `timeUnixMs` index needed migration `20261126200000-add-blocks-time-unix-ms-index.ts` for migration-only databases; its model-generated name lets sync reuse it.
For live-table additions, that migration demonstrates concurrent nontransactional creation, invalid-index repair before `IF NOT EXISTS`, and a no-op rollback preserving indexes it may not own.
Parity is not a mandate to restore every historical index: Xion deliberately retired unused bank address/block-height, feegrant granter/block-height and parsed-field indexes, plus the WASM key trigram index.
Their model declarations were removed to prevent sync rebuilding them; historical creation migrations remain intentionally unchanged (the feegrant model explicitly documents this divergence).
Manual SQL and documentation must also respect retirement: the WASM table-copy script no longer recreates the trigram index, and the feegrant example omits the retired granter index.
`WasmStateEvent` instead declares the partial `contract_info` index; the table-copy script currently does not restore that index after dropping the old table, so review table-swap index preservation separately.
See [[populated-database-sync-preflight]] for the CLI safeguard against accidental model sync on existing data.
