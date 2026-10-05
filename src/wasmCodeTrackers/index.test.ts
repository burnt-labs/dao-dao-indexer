import { describe, expect, it } from 'vitest'

import { Contract, WasmCodeKey, WasmStateEvent } from '@/db'
import { WasmCodeService } from '@/services/wasm-codes'
import { dbKeyForKeys } from '@/utils'

import { WasmCodeTrackerManager } from '.'

const integrationTests =
  process.env.INTEGRATION_TESTS === 'true' ||
  process.env.INTEGRATION_TESTS === '1'

const CONTRACT_INFO = dbKeyForKeys('contract_info')

const contractInfoEvent = (contractAddress: string, contract: string) => ({
  contractAddress,
  key: CONTRACT_INFO,
  value: JSON.stringify({ contract, version: '0.1.0' }),
  delete: false,
})

const getSavedCodeIds = async () =>
  Object.fromEntries(
    (await WasmCodeKey.findAllWithIds()).map(({ codeKey, codeKeyIds }) => [
      codeKey,
      codeKeyIds.map(({ codeKeyId }) => codeKeyId).sort((a, b) => a - b),
    ])
  )

describe.runIf(integrationTests)('WasmCodeTrackerManager.trackCodes', () => {
  it('saves each matching code ID once per code key', async () => {
    const contracts = [
      { address: 'xion1acct1', codeId: 5, contract: 'account' },
      { address: 'xion1acct2', codeId: 5, contract: 'account' },
      { address: 'xion1acct3', codeId: 55, contract: 'account' },
      { address: 'xion1treasury', codeId: 7, contract: 'treasury' },
      // Closing quote in the tracker's partial value excludes this.
      { address: 'xion1other', codeId: 9, contract: 'account-foo' },
    ]
    await Contract.bulkCreate(
      contracts.map(({ address, codeId }) => ({ address, codeId }))
    )
    await WasmStateEvent.bulkCreate(
      contracts.map(({ address, contract }) => ({
        ...contractInfoEvent(address, contract),
        blockHeight: '1',
        blockTimeUnixMs: '1',
        blockTimestamp: new Date(1),
        valueJson: { contract, version: '0.1.0' },
      }))
    )

    await new WasmCodeTrackerManager('xion-mainnet-1').trackCodes(contracts)

    expect(await getSavedCodeIds()).toEqual({
      'xion-account': [5, 55],
      'xion-treasury': [7],
    })
    expect(
      WasmCodeService.instance
        .findWasmCodeIdsByKeys('xion-account')
        .sort((a, b) => a - b)
    ).toEqual([5, 55])
  })

  it('tracks contracts from state updates not yet saved', async () => {
    await new WasmCodeTrackerManager('xion-testnet-2').trackCodes(
      [{ address: 'xion1new', codeId: 1880 }],
      [contractInfoEvent('xion1new', 'account')]
    )

    expect(await getSavedCodeIds()).toEqual({ 'xion-account': [1880] })
  })
})
