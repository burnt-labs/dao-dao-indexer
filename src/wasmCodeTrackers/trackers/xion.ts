import { WasmCodeTracker } from '@/types'
import { XION_ACCOUNT_CODE_IDS_KEY } from '@/utils'

export const xionTreasury: WasmCodeTracker = {
  chainId: ['xion-mainnet-1', 'xion-testnet-2'],
  codeKey: 'xion-treasury',
  stateKeys: [
    {
      key: 'contract_info',
      partialValue: '"contract":"treasury"',
    },
  ],
}

export const xionAccount: WasmCodeTracker = {
  chainId: ['xion-mainnet-1', 'xion-testnet-2'],
  codeKey: XION_ACCOUNT_CODE_IDS_KEY,
  stateKeys: [
    {
      key: 'contract_info',
      partialValue: '"contract":"account"',
    },
  ],
}
