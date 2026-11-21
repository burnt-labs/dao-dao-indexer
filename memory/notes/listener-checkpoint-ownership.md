---
title: Listener recovery needs a listener-owned completion checkpoint
type: gotcha
scope: "src/{scripts/listener.ts,services/BlockIterator.ts,db/models/State.ts,tracer/handlers/**,queues/queues/extract.ts}"
confidence: 0.99
sources: [35]
updated: 2026-11-21
---
`State.latestBlockHeight` is a shared high-water mark, not proof that the listener dispatched every transaction through that height.
The wasm tracer handler and extract queue both advance it with SQL `GREATEST`, independently of listener progress.
In the checked-out code, `src/scripts/listener.ts` resumes from that shared height and advances it in `onBlock`; `BlockIterator.iterate` invokes `onBlock` before its transaction callbacks.
Consequently a crash can leave the shared height beyond undispatched listener transactions; replaying only that height cannot recover earlier skipped blocks.
Review recovery changes against a listener-owned checkpoint committed only after all transaction matching and queue submissions for a block finish, including empty blocks.
PR #35 proposes `listenerLatestBlockHeight` for this purpose; that field is not yet present in the checked-out `State` model. Queue submission completion is distinct from extraction worker completion.
