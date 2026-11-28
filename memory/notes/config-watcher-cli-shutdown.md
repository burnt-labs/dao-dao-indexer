---
title: Config loading owns a persistent watcher beyond database connection lifetime
type: gotcha
scope: "{src/config/manager.ts,src/scripts/db/**}"
confidence: 0.99
sources: [42]
updated: 2026-11-28
---
`ConfigManager` starts `fs.watchFile` with a five-second interval and default persistent behavior when constructed; closing Sequelize does not stop this handle.
`db:alter` therefore awaits closing its selected connections, returns an exit code from `main`, then explicitly calls `process.exit`: 0 for successful alter, 1 for guard refusal or alter failure.
Preserve the explicit termination or provide watcher teardown (`ConfigManager.instance.unwatchConfigFile()`) when changing one-shot CLI lifecycle; merely assigning `process.exitCode` leaves the watcher alive.
`alter.test.ts` builds the CLI and spawns a child with a timeout, checking actual termination for both databases, data only, populated refusal, and a PostgreSQL alter failure.
Use process-level termination assertions for this regression: an awaited main function or mocked database close alone does not establish that the CLI exits.
