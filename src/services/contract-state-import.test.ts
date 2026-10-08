import { beforeEach, describe, expect, it } from 'vitest'

import {
  Block,
  Contract,
  State,
  WasmCodeKey,
  WasmStateEvent,
  WasmStateEventTransformation,
} from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'
import { XION_ACCOUNT_CODE_IDS_KEY } from '@/utils'

import {
  ContractStateExport,
  ContractStateRecord,
  EXPORT_FORMAT,
  expectedIdentities,
  importRecord,
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
