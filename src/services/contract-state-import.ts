/**
 * Import contract state from a state export file (raw contract storage read
 * from an archive node) through the contract state recovery path. Used by
 * `src/scripts/importContractState.ts`.
 */

import { createHash } from 'crypto'
import { readFile } from 'fs/promises'

import { Op } from 'sequelize'

import {
  Block as BlockModel,
  Contract,
  WasmStateEvent,
  invalidateComputationsDependentOnChanges,
} from '@/db'
import { compute, getTypedFormula } from '@/formulas'
import { transformParsedStateEvents } from '@/transformers'
import { getProcessedTransformers } from '@/transformers/transformers'
import {
  Block,
  DependableEventModel,
  FormulaType,
  ParsedWasmStateEvent,
} from '@/types'
import {
  XionAuthenticatorIdentity,
  getXionAuthenticatorIdentity,
} from '@/utils'

import {
  defaultSaveEvents,
  recoverContractState,
} from './contract-state-recovery'

export const EXPORT_FORMAT = 'xion-contract-state-export/v1'

export type ContractStateSnapshot = {
  blockHeight: string
  blockTimeUnixMs: string
  /** Raw storage entries; key and value are base64. */
  entries: { key: string; value: string }[]
}

export type ContractStateRecord = {
  address: string
  codeId: number
  creator: string | null
  admin: string | null
  label: string | null
  instantiated: { blockHeight: string; blockTimeUnixMs: string }
  /** Ascending by block height. */
  snapshots: ContractStateSnapshot[]
  /** Authenticators the chain returned for the account at export time. */
  chainAuthenticators?: Record<string, unknown>
  /** sha256 of the canonical JSON of the record without this field. */
  sha256: string
}

export type ContractStateExport = {
  format: string
  chainId: string
  exportHeight: string
  count: number
  records: ContractStateRecord[]
}

/** JSON with sorted object keys, so record hashes are reproducible. */
export const canonicalJson = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonicalJson).join(',')}]`
    : value && typeof value === 'object'
    ? `{${Object.keys(value)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalJson(
              (value as Record<string, unknown>)[key]
            )}`
        )
        .join(',')}}`
    : JSON.stringify(value)

export const recordSha256 = ({ sha256: _, ...record }: ContractStateRecord) =>
  createHash('sha256').update(canonicalJson(record)).digest('hex')

/**
 * Validate the export's structure and per-record hashes. Returns a list of
 * problems; empty means valid.
 */
export const validateExport = (data: ContractStateExport): string[] => {
  const problems: string[] = []
  if (data.format !== EXPORT_FORMAT) {
    problems.push(`unknown format ${data.format}, expected ${EXPORT_FORMAT}`)
  }
  if (!Array.isArray(data.records) || data.records.length !== data.count) {
    problems.push(
      `count ${data.count} does not match ${data.records?.length} records`
    )
  }
  const exportHeight = /^\d+$/.test(String(data.exportHeight))
    ? BigInt(data.exportHeight)
    : undefined
  if (exportHeight === undefined) {
    problems.push(`invalid export height ${data.exportHeight}`)
  }
  const seen = new Set<string>()
  for (const record of data.records ?? []) {
    if (seen.has(record.address)) {
      problems.push(`${record.address}: duplicate record`)
    }
    seen.add(record.address)
    if (recordSha256(record) !== record.sha256) {
      problems.push(`${record.address}: sha256 mismatch`)
    }
    if (!Number.isInteger(record.codeId) || record.codeId <= 0) {
      problems.push(`${record.address}: invalid code ID ${record.codeId}`)
    }
    if (!record.snapshots?.length) {
      problems.push(`${record.address}: no snapshots`)
    }
    const heights = record.snapshots.map(({ blockHeight }) =>
      BigInt(blockHeight)
    )
    if (heights.some((height, i) => i > 0 && height <= heights[i - 1])) {
      problems.push(`${record.address}: snapshots not ascending by height`)
    }
    if (
      exportHeight !== undefined &&
      heights.some((height) => height > exportHeight)
    ) {
      problems.push(`${record.address}: snapshot above export height`)
    }
    // Keys removed between snapshots would need delete events, which the
    // recovery path does not write.
    for (let i = 1; i < record.snapshots.length; i++) {
      const later = new Set(record.snapshots[i].entries.map(({ key }) => key))
      if (record.snapshots[i - 1].entries.some(({ key }) => !later.has(key))) {
        problems.push(
          `${record.address}: key removed before height ${record.snapshots[i].blockHeight}`
        )
      }
    }
  }
  return problems
}

/** Authenticator identities the chain reported, sorted by index. */
export const expectedIdentities = (
  record: ContractStateRecord
): (XionAuthenticatorIdentity & { index: number })[] =>
  Object.entries(record.chainAuthenticators ?? {})
    .flatMap(([index, value]) => {
      const identity = getXionAuthenticatorIdentity(value)
      return identity ? [{ index: Number(index), ...identity }] : []
    })
    .sort((a, b) => a.index - b.index)

const snapshotFetchPage =
  ({ entries }: ContractStateSnapshot) =>
  async () => ({
    models: entries.map(({ key, value }) => ({
      key: Buffer.from(key, 'base64'),
      value: Buffer.from(value, 'base64'),
    })),
  })

export const loadExport = async (source: string) => {
  let bytes: Buffer
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(
        `fetching export: ${response.status} ${response.statusText}`
      )
    }
    bytes = Buffer.from(await response.arrayBuffer())
  } else {
    bytes = await readFile(source)
  }

  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    data: JSON.parse(bytes.toString()) as ContractStateExport,
  }
}

type StoredStateEvent = Pick<
  WasmStateEvent,
  'blockHeight' | 'value' | 'valueJson' | 'delete'
>

/**
 * The stored event for each key at or before `blockHeight`, so an earlier
 * snapshot is compared with the state at its own height rather than with a
 * later snapshot already imported.
 */
export const getStoredEventsAtHeight = async (
  events: ParsedWasmStateEvent[],
  blockHeight: string
): Promise<Map<string, StoredStateEvent>> => {
  const stored = await WasmStateEvent.findAll({
    where: {
      contractAddress: {
        [Op.in]: [...new Set(events.map((event) => event.contractAddress))],
      },
      key: { [Op.in]: [...new Set(events.map((event) => event.key))] },
      blockHeight: { [Op.lte]: blockHeight },
    },
    order: [['blockHeight', 'DESC']],
    attributes: [
      'contractAddress',
      'key',
      'blockHeight',
      'value',
      'valueJson',
      'delete',
    ],
  })

  const byKey = new Map<string, StoredStateEvent>()
  stored.forEach((event) => {
    const key = `${event.contractAddress}:${event.key}`
    if (!byKey.has(key)) {
      byKey.set(key, event)
    }
  })
  return byKey
}

/**
 * The block to verify at: the export height, with the time of the indexed
 * block at (or just before) it. The export's `chainAuthenticators` are the
 * chain's answer at that height, so later changes must not count.
 */
export const getExportBlock = async (exportHeight: string): Promise<Block> => {
  const block = await BlockModel.getForHeight(exportHeight)
  if (!block) {
    throw new Error(`no indexed block at or before height ${exportHeight}`)
  }
  return { height: BigInt(exportHeight), timeUnixMs: BigInt(block.timeUnixMs) }
}

export type ImportResult = {
  address: string
  existed: boolean
  events: number
  transformations: string[]
  /** Cached computations depending on the written state. */
  computations: { destroyed: number; updated: number }
}

/**
 * Write one record's snapshots through the recovery path. In dry-run, nothing
 * is written and the would-be events and transformation names are returned.
 */
export const importRecord = async (
  record: ContractStateRecord,
  dryRun: boolean
): Promise<ImportResult> => {
  const existed =
    (await Contract.count({ where: { address: record.address } })) > 0
  const result: ImportResult = {
    address: record.address,
    existed,
    events: 0,
    transformations: [],
    computations: { destroyed: 0, updated: 0 },
  }

  // Dry-run writes nothing, so later snapshots must see earlier ones here.
  const pending = new Map<string, ParsedWasmStateEvent>()
  const transformers = getProcessedTransformers()
  // Written events and transformations, for cache invalidation.
  const changed: DependableEventModel[] = []

  for (const snapshot of record.snapshots) {
    const recovery = await recoverContractState({
      address: record.address,
      codeId: record.codeId,
      blockHeight: snapshot.blockHeight,
      blockTimeUnixMs: snapshot.blockTimeUnixMs,
      pageLimit: Math.max(1, snapshot.entries.length),
      fetchPage: snapshotFetchPage(snapshot),
      getLatestEvents: async (events) => {
        const stored = await getStoredEventsAtHeight(
          events,
          snapshot.blockHeight
        )
        pending.forEach((event, key) => {
          const existing = stored.get(key)
          if (
            !existing ||
            BigInt(event.blockHeight) >= BigInt(existing.blockHeight)
          ) {
            stored.set(key, event)
          }
        })
        return stored
      },
      // Keep instantiation info from the chain, not the snapshot height, and
      // never touch a contract row the tracer already wrote.
      ensureContract: async () => {
        if (dryRun) {
          return
        }
        await Contract.bulkCreate(
          [
            {
              address: record.address,
              codeId: record.codeId,
              admin: record.admin,
              creator: record.creator,
              label: record.label,
              instantiatedAtBlockHeight: record.instantiated.blockHeight,
              instantiatedAtBlockTimeUnixMs:
                record.instantiated.blockTimeUnixMs,
              instantiatedAtBlockTimestamp: new Date(
                Number(record.instantiated.blockTimeUnixMs)
              ),
            },
          ],
          { ignoreDuplicates: true }
        )
      },
      ...(dryRun
        ? {
            saveEvents: async (events) => {
              events.forEach((event) =>
                pending.set(`${event.contractAddress}:${event.key}`, event)
              )
              return events.map(() => ({ contract: undefined }))
            },
            transformEvents: async (events) => {
              result.transformations.push(
                ...events.flatMap((event) =>
                  transformers
                    .filter((transformer) => transformer.filter(event))
                    .flatMap((transformer) => {
                      const name =
                        typeof transformer.name === 'string'
                          ? transformer.name
                          : transformer.name(event)
                      return name ? [name] : []
                    })
                )
              )
              return []
            },
            updateState: async () => {},
          }
        : {
            saveEvents: async (events) => {
              const saved = await defaultSaveEvents(events)
              changed.push(...saved)
              return saved
            },
            transformEvents: async (events) => {
              const transformations = await transformParsedStateEvents(events)
              changed.push(...transformations)
              return transformations
            },
            // Record the block, but leave the indexer's cursors in `State`
            // alone: the listener resumes from `latestBlockHeight`, and
            // webhooks are suppressed below `lastWasmBlockHeightExported`.
            updateState: async ({ blockHeight, blockTimeUnixMs }) => {
              await BlockModel.createMany([
                { height: blockHeight, timeUnixMs: blockTimeUnixMs },
              ])
            },
          }),
    })

    result.events += recovery.events
  }

  // Cached computations (range queries) may already cover these heights, and
  // nothing else revalidates them when older events are inserted.
  result.computations = await invalidateComputationsDependentOnChanges(changed)

  return result
}

/**
 * Re-transform every state event of the given contracts, as the
 * transformations queue does for `npm run transform -- -a <addresses>`.
 *
 * One contract at a time, so each query is served by the `(contractAddress,
 * key, blockHeight)` index instead of a scan and sort of the whole table.
 * A transformation only reads earlier transformations of the same contract,
 * so block height order within each contract is all that is needed. Pages are
 * keyset-paginated on `(blockHeight, key)`, unique per contract.
 */
export const transformContracts = async (
  addresses: string[],
  batchSize = 5000
) => {
  let transformed = 0
  for (const contractAddress of addresses) {
    let after: { blockHeight: string; key: string } | undefined
    for (;;) {
      const events = await WasmStateEvent.findAll({
        where: {
          contractAddress,
          ...(after && {
            [Op.or]: [
              { blockHeight: { [Op.gt]: after.blockHeight } },
              {
                blockHeight: after.blockHeight,
                key: { [Op.gt]: after.key },
              },
            ],
          }),
        },
        include: { model: Contract, required: true },
        order: [
          ['blockHeight', 'ASC'],
          ['key', 'ASC'],
        ],
        limit: batchSize,
      })
      if (events.length) {
        transformed += (
          await transformParsedStateEvents(
            events.map((event) => event.asParsedEvent)
          )
        ).length
        const last = events[events.length - 1]
        after = { blockHeight: last.blockHeight, key: last.key }
      }
      if (events.length < batchSize) {
        break
      }
    }
  }
  return transformed
}

export type Verification = {
  address: string
  forward: boolean
  reverse: boolean
  problems: string[]
}

/** Check both xion account formulas for one record at the given block. */
export const verifyRecord = async (
  record: ContractStateRecord,
  chainId: string,
  block: Block
): Promise<Verification> => {
  const problems: string[] = []
  const expected = expectedIdentities(record)
  if (!expected.length) {
    problems.push('no decodable authenticator in export')
  }

  const forward = await compute({
    ...getTypedFormula(
      FormulaType.Contract,
      'xion/account/authenticatorIdentities'
    ),
    chainId,
    targetAddress: record.address,
    args: {},
    block,
  })
  const identities = forward.value as (XionAuthenticatorIdentity & {
    index: number
  })[]
  const forwardOk =
    identities.length > 0 &&
    canonicalJson(identities) === canonicalJson(expected)
  if (!forwardOk) {
    problems.push(
      `authenticatorIdentities returned ${
        identities.length
      } identities, expected ${expected.length}${
        identities.length ? ' (values differ)' : ''
      }`
    )
  }

  let reverseOk = expected.length > 0
  for (const { type, authenticator } of expected) {
    const reverse = await compute({
      ...getTypedFormula(FormulaType.Generic, 'xion/accountsByAuthenticator'),
      chainId,
      targetAddress: '_',
      args: { type, authenticator },
      block,
    })
    const accounts = reverse.value as { address: string }[]
    if (!accounts.some(({ address }) => address === record.address)) {
      reverseOk = false
      problems.push(`accountsByAuthenticator(${type}) does not resolve`)
    }
  }

  return {
    address: record.address,
    forward: forwardOk,
    reverse: reverseOk,
    problems,
  }
}
