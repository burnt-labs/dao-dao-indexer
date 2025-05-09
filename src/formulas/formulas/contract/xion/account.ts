import { ContractFormula } from '@/types'

import { Authenticator } from './types/Account.types'

const AccountStorageKeys = {
  AUTHENTICATORS: 'authenticators',
}

export const authenticators: ContractFormula<Authenticator[]> = {
  docs: {
    description: 'Get authenticator map for account',
  },
  compute: async (env) => {
    const { contractAddress, getMap } = env

    const authenticatorMap =
      (await getMap<number, Authenticator>(
        contractAddress,
        AccountStorageKeys.AUTHENTICATORS
      )) ?? {}

    return Object.values(authenticatorMap)
  },
}

/*
 * This returns the treasury contracts where the passed account is the admin.
 */
export const treasuries: ContractFormula<
  {
    contractAddress: string
    balances?: Record<string, string>
  }[]
> = {
  docs: {
    description:
      'retrieves treasury contracts where the passed account is the admin',
  },
  compute: async (env) => {
    const {
      contractAddress,
      getBalances,
      getTransformationMatches,
      getCodeIdsForKeys,
    } = env

    // Treasury contracts where the address is the admin.
    const treasuryContracts = await getTransformationMatches(
      undefined,
      'admin',
      contractAddress,
      getCodeIdsForKeys('xion-treasury')
    )

    return Promise.all(
      treasuryContracts?.map(async ({ contractAddress }) => ({
        contractAddress,
        balances: await getBalances(contractAddress),
      })) ?? []
    )
  },
}
