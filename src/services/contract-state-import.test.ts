import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Block,
  Computation,
  Contract,
  State,
  WasmCodeKey,
  WasmStateEvent,
  WasmStateEventTransformation,
} from '@/db'
import { compute, getTypedFormula } from '@/formulas'
import { WasmCodeService } from '@/services/wasm-codes'
import { FormulaType } from '@/types'
import { XION_ACCOUNT_CODE_IDS_KEY } from '@/utils'

import {
  ContractStateExport,
  ContractStateRecord,
  EXPORT_FORMAT,
  expectedIdentities,
  getExportBlock,
  importRecord,
  invalidateImportedComputations,
  recordSha256,
  transformContracts,
  validateExport,
  verifyRecord,
} from './contract-state-import'

const integrationTests =
  process.env.INTEGRATION_TESTS === 'true' ||
  process.env.INTEGRATION_TESTS === '1'

const AUTHENTICATORS_KEY = Buffer.from([
  0,
  14,
  ...Buffer.from('authenticators'),
  0,
]).toString('base64')
const CONTRACT_INFO_KEY = Buffer.from('contract_info').toString('base64')
const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64')

const JWT = { Jwt: { aud: 'project-test-1', sub: 'user-test-1' } }
const OTHER_JWT = { Jwt: { aud: 'project-test-1', sub: 'user-test-2' } }

const makeRecord = (
  overrides: Partial<ContractStateRecord> = {}
): ContractStateRecord => {
  const record = {
    address: 'xion1imported',
    codeId: 1,
    creator: 'xion1creator',
    admin: 'xion1imported',
    label: 'abstractaccount/1',
    instantiated: { blockHeight: '100', blockTimeUnixMs: '100000' },
    snapshots: [
      {
        blockHeight: '100',
        blockTimeUnixMs: '100000',
        entries: [
          { key: AUTHENTICATORS_KEY, value: b64(JWT) },
          {
            key: CONTRACT_INFO_KEY,
            value: b64({ contract: 'account', version: '0.1.0' }),
          },
        ],
      },
      {
        blockHeight: '200',
        blockTimeUnixMs: '200000',
        entries: [
          { key: AUTHENTICATORS_KEY, value: b64(JWT) },
          {
            key: CONTRACT_INFO_KEY,
            value: b64({ contract: 'account', version: '0.1.0' }),
          },
        ],
      },
    ],
    chainAuthenticators: { '0': JWT },
    sha256: '',
    ...overrides,
  }
  record.sha256 = recordSha256(record)
  return record
}

/** contract_info changes from 0.1.0 at 100 to 0.2.0 at 200. */
const makeUpgradedRecord = (overrides: Partial<ContractStateRecord> = {}) => {
  const base = makeRecord()
  return makeRecord({
    snapshots: [
      base.snapshots[0],
      {
        ...base.snapshots[1],
        entries: [
          base.snapshots[1].entries[0],
          {
            key: CONTRACT_INFO_KEY,
            value: b64({ contract: 'account', version: '0.2.0' }),
          },
        ],
      },
    ],
    ...overrides,
  })
}

const makeExport = (records: ContractStateRecord[]): ContractStateExport => ({
  format: EXPORT_FORMAT,
  chainId: 'xion-testnet-2',
  exportHeight: '200',
  count: records.length,
  records,
})

describe('validateExport', () => {
  it('accepts a well-formed export', () => {
    expect(validateExport(makeExport([makeRecord()]))).toEqual([])
  })

  it('rejects a record whose content no longer matches its sha256', () => {
    const record = makeRecord()
    record.snapshots[0].entries[0].value = b64({
      Jwt: { aud: 'other', sub: 'user-test-1' },
    })
    expect(validateExport(makeExport([record]))).toEqual([
      'xion1imported: sha256 mismatch',
    ])
  })

  it('rejects count mismatches, duplicates and unknown formats', () => {
    const record = makeRecord()
    expect(
      validateExport({
        ...makeExport([record, record]),
        format: 'other',
        count: 3,
      })
    ).toEqual([
      `unknown format other, expected ${EXPORT_FORMAT}`,
      'count 3 does not match 2 records',
      'xion1imported: duplicate record',
    ])
  })

  it('rejects keys removed between snapshots', () => {
    const base = makeRecord()
    const record = makeRecord({
      snapshots: [base.snapshots[0], { ...base.snapshots[1], entries: [] }],
    })
    expect(validateExport(makeExport([record]))).toEqual([
      'xion1imported: key removed before height 200',
    ])
  })

  it('rejects snapshots above the export height', () => {
    expect(
      validateExport({ ...makeExport([makeRecord()]), exportHeight: '150' })
    ).toEqual(['xion1imported: snapshot above export height'])
    expect(
      validateExport({ ...makeExport([makeRecord()]), exportHeight: 'latest' })
    ).toEqual(['invalid export height latest'])
  })
})

describe('expectedIdentities', () => {
  it('decodes chain authenticators sorted by index', () => {
    expect(
      expectedIdentities(
        makeRecord({
          chainAuthenticators: {
            '2': { EthWallet: { address: '0xabc' } },
            '0': JWT,
          },
        })
      )
    ).toEqual([
      {
        index: 0,
        type: 'JWT',
        authenticator: 'project-test-1.user-test-1',
      },
      { index: 2, type: 'EthWallet', authenticator: '0xabc' },
    ])
  })
})

describe.runIf(integrationTests)('contract state import', () => {
  beforeEach(async () => {
    await WasmCodeKey.createFromKeyAndIds(XION_ACCOUNT_CODE_IDS_KEY, 1)
    await WasmCodeService.instance.reloadWasmCodeIdsFromDB()
    await Block.createMany([{ height: 300, timeUnixMs: 300000 }])
    await State.updateSingleton({
      chainId: 'xion-testnet-2',
      latestBlockHeight: 300,
      latestBlockTimeUnixMs: 300000,
    })
  })

  it('dry-run writes nothing', async () => {
    const result = await importRecord(makeRecord(), true)

    expect(result).toMatchObject({ existed: false, events: 2 })
    expect(result.transformations).toContain(
      'hasAuthenticator:JWT:project-test-1.user-test-1'
    )
    expect(await Contract.count()).toBe(0)
    expect(await WasmStateEvent.count()).toBe(0)
    expect(await WasmStateEventTransformation.count()).toBe(0)
  })

  it('imports once, is idempotent, and both formulas resolve', async () => {
    const record = makeRecord()
    const state = await State.mustGetSingleton()

    const before = await verifyRecord(record, state.chainId, state.latestBlock)
    expect(before).toMatchObject({ forward: false, reverse: false })

    expect(await importRecord(record, false)).toMatchObject({
      existed: false,
      events: 2,
    })
    // Second snapshot is identical, so nothing new is written for it, even
    // though jsonb reorders the stored contract_info keys.
    expect(await WasmStateEvent.count()).toBe(2)

    const contract = await Contract.findByPk(record.address)
    expect(contract).toMatchObject({
      codeId: 1,
      creator: 'xion1creator',
      label: 'abstractaccount/1',
      instantiatedAtBlockHeight: '100',
    })

    // Re-run: no new rows.
    expect(await importRecord(record, false)).toMatchObject({
      existed: true,
      events: 0,
    })
    expect(await transformContracts([record.address])).toBeGreaterThan(0)
    expect(await WasmStateEvent.count()).toBe(2)
    const transformations = await WasmStateEventTransformation.findAll()
    expect(transformations.map(({ name }) => name).sort()).toEqual([
      'hasAuthenticator:JWT:project-test-1.user-test-1',
      'info',
    ])

    const after = await verifyRecord(record, state.chainId, state.latestBlock)
    expect(after).toEqual({
      address: record.address,
      forward: true,
      reverse: true,
      problems: [],
    })
  })

  it('re-transforms every event of every contract across pages', async () => {
    const addresses = ['xion1first', 'xion1second']
    for (const address of addresses) {
      await importRecord(makeUpgradedRecord({ address }), false)
    }
    // Three events per contract: both keys at 100, contract_info at 200.
    expect(await WasmStateEvent.count()).toBe(6)

    const findAll = vi.spyOn(WasmStateEvent, 'findAll')
    try {
      const all = await transformContracts(addresses)
      expect(findAll).toHaveBeenCalledTimes(2)
      // One contract per query, so the contractAddress index serves it.
      expect(
        findAll.mock.calls.map(
          ([options]) =>
            (options?.where as { contractAddress?: unknown }).contractAddress
        )
      ).toEqual(addresses)

      // A batch of 2 pages each contract as 2 + 1, with no trailing empty
      // query, and upserts the same transformations as a single page.
      findAll.mockClear()
      expect(await transformContracts(addresses, 2)).toBe(all)
      expect(findAll).toHaveBeenCalledTimes(4)

      findAll.mockClear()
      expect(await transformContracts(addresses, 1)).toBe(all)
      expect(findAll).toHaveBeenCalledTimes(8)
    } finally {
      findAll.mockRestore()
    }

    const transformations = await WasmStateEventTransformation.findAll({
      where: { name: 'info' },
      order: [
        ['contractAddress', 'ASC'],
        ['blockHeight', 'ASC'],
      ],
    })
    expect(
      transformations.map(({ contractAddress, blockHeight }) => [
        contractAddress,
        blockHeight,
      ])
    ).toEqual([
      ['xion1first', '100'],
      ['xion1first', '200'],
      ['xion1second', '100'],
      ['xion1second', '200'],
    ])
  })

  it('compares each snapshot with the state at its own height', async () => {
    const record = makeUpgradedRecord()
    expect(await importRecord(record, false)).toMatchObject({ events: 3 })

    // contract_info at 100 is not compared with the 0.2.0 stored at 200.
    expect(await importRecord(record, false)).toMatchObject({ events: 0 })
    const dryRun = await importRecord(record, true)
    expect(dryRun).toMatchObject({ events: 0, transformations: [] })
    expect(await WasmStateEvent.count()).toBe(3)
  })

  it('writes an earlier snapshot equal to later stored state', async () => {
    // The tracer already has the same contract_info, but only from 300.
    await importRecord(
      makeRecord({
        snapshots: [{ ...makeRecord().snapshots[0], blockHeight: '300' }],
      }),
      false
    )

    expect(await importRecord(makeRecord(), false)).toMatchObject({
      events: 2,
    })
    expect(
      (await WasmStateEvent.findAll({ order: [['blockHeight', 'ASC']] })).map(
        ({ blockHeight }) => blockHeight
      )
    ).toEqual(['100', '100', '300', '300'])
  })

  it('records blocks without moving the indexer cursors', async () => {
    await State.updateSingleton({
      latestBlockHeight: 150,
      latestBlockTimeUnixMs: 150000,
      lastWasmBlockHeightExported: 150,
    })

    await importRecord(makeUpgradedRecord(), false)

    expect(await State.mustGetSingleton()).toMatchObject({
      latestBlockHeight: '150',
      latestBlockTimeUnixMs: '150000',
      lastWasmBlockHeightExported: '150',
    })
    expect(
      (await Block.findAll({ order: [['height', 'ASC']] })).map(
        ({ height }) => height
      )
    ).toEqual(['100', '200', '300'])
  })

  it('verifies at the export height, not the latest block', async () => {
    const record = makeUpgradedRecord()
    await expect(getExportBlock('200')).rejects.toThrow(
      'no indexed block at or before height 200'
    )

    await importRecord(record, false)
    // The account switches authenticators after the export.
    await importRecord(
      makeRecord({
        snapshots: [
          {
            blockHeight: '250',
            blockTimeUnixMs: '250000',
            entries: [{ key: AUTHENTICATORS_KEY, value: b64(OTHER_JWT) }],
          },
        ],
      }),
      false
    )

    const state = await State.mustGetSingleton()
    expect(
      await verifyRecord(record, state.chainId, state.latestBlock)
    ).toMatchObject({ forward: false })

    const block = await getExportBlock('200')
    expect(block).toEqual({ height: 200n, timeUnixMs: 200000n })
    expect(await verifyRecord(record, state.chainId, block)).toMatchObject({
      forward: true,
      reverse: true,
    })
  })

  it('invalidates cached computations of the imported state on retry', async () => {
    const record = makeRecord()
    const state = await State.mustGetSingleton()
    const forward = getTypedFormula(
      FormulaType.Contract,
      'xion/account/authenticatorIdentities'
    )
    const reverse = getTypedFormula(
      FormulaType.Generic,
      'xion/accountsByAuthenticator'
    )
    const reverseArgs = {
      type: 'JWT',
      authenticator: 'project-test-1.user-test-1',
    }

    // Range queries cache `[]` as valid through 300, before the import.
    const forwardOutput = await compute({
      ...forward,
      chainId: state.chainId,
      targetAddress: record.address,
      args: {},
      block: state.latestBlock,
    })
    const reverseOutput = await compute({
      ...reverse,
      chainId: state.chainId,
      targetAddress: '_',
      args: reverseArgs,
      block: state.latestBlock,
    })
    expect(forwardOutput.value).toEqual([])
    expect(reverseOutput.value).toEqual([])
    const [cachedForward] = await Computation.createFromComputationOutputs(
      record.address,
      forward,
      {},
      [{ ...forwardOutput, latestBlockHeightValid: 300n }]
    )
    const [cachedReverse] = await Computation.createFromComputationOutputs(
      '_',
      reverse,
      reverseArgs,
      [{ ...reverseOutput, latestBlockHeightValid: 300n }]
    )
    // And one starting after the earliest imported height. The generic
    // computation also starts at 300, the block it was computed at.
    expect(cachedReverse.blockHeight).toBe('300')
    const [cachedLater] = await Computation.createFromComputationOutputs(
      record.address,
      forward,
      {},
      [
        {
          ...forwardOutput,
          block: { height: 150n, timeUnixMs: 150000n },
          latestBlockHeightValid: 300n,
        },
      ]
    )

    // A first attempt writes the state but fails before invalidating. The
    // retry writes nothing, and still invalidates from what is stored.
    expect(await importRecord(record, false)).toMatchObject({ events: 2 })
    expect(await importRecord(record, false)).toMatchObject({ events: 0 })
    await transformContracts([record.address])

    // Matched through the account's state key prefix (forward) and the
    // wildcard transformation key (reverse).
    expect(await invalidateImportedComputations(record)).toEqual({
      destroyed: 2,
      updated: 1,
    })
    expect(await invalidateImportedComputations(record)).toEqual({
      destroyed: 0,
      updated: 0,
    })

    expect(await Computation.findByPk(cachedLater.id)).toBeNull()
    expect(await Computation.findByPk(cachedReverse.id)).toBeNull()
    expect(await Computation.findByPk(cachedForward.id)).toMatchObject({
      latestBlockHeightValid: '99',
    })
  })

  it('leaves an existing contract row untouched', async () => {
    await Contract.create({
      address: 'xion1imported',
      codeId: 1,
      txHash: 'TRACER',
      instantiatedAtBlockHeight: '100',
    })

    await importRecord(makeRecord(), false)

    expect(await Contract.findByPk('xion1imported')).toMatchObject({
      txHash: 'TRACER',
      creator: null,
    })
  })
})
