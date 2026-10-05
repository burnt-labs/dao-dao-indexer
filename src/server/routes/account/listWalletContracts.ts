import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountWalletContract, AccountWalletContractApiJson } from '@/db'

import { ApiKeyAuthState } from './apiKeyAuth'

type WalletContractApiJson = AccountWalletContractApiJson & {
  // Whether this is the most recently added mapping for its wallet address.
  current: boolean
}

type ListWalletContractsResponse =
  | {
      walletContracts: WalletContractApiJson[]
    }
  | {
      error: string
    }

export const listWalletContracts: Router.Middleware<
  ApiKeyAuthState,
  DefaultContext,
  ListWalletContractsResponse
> = async (ctx) => {
  // Normalize query parameters the same way POST trims body values so both
  // endpoints match on identical stored values.
  const chainId =
    typeof ctx.query.chainId === 'string' ? ctx.query.chainId.trim() : undefined
  const walletAddress =
    typeof ctx.query.walletAddress === 'string'
      ? ctx.query.walletAddress.trim()
      : undefined
  const dossierContractAddress =
    typeof ctx.query.dossierContractAddress === 'string'
      ? ctx.query.dossierContractAddress.trim()
      : undefined

  // Chain ID is required so mappings from different environments (e.g.
  // testnet vs. mainnet) never mix.
  if (!chainId) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing chainId.',
    }
    return
  }

  // Do not apply the dossier contract address filter in the query: `current`
  // refers to each wallet's latest mapping across all dossiers, so it must be
  // computed before that filter is applied.
  const walletContracts = await AccountWalletContract.findAll({
    where: {
      accountPublicKey: ctx.state.account.publicKey,
      chainId,
      // Optional filter.
      ...(walletAddress ? { walletAddress } : {}),
    },
    // Newest first so the first row seen per wallet address is current.
    order: [['id', 'DESC']],
  })

  const seenWalletAddresses = new Set<string>()

  ctx.status = 200
  ctx.body = {
    walletContracts: walletContracts
      .map((walletContract) => {
        const current = !seenWalletAddresses.has(walletContract.walletAddress)
        seenWalletAddresses.add(walletContract.walletAddress)

        return {
          ...walletContract.apiJson,
          current,
        }
      })
      .filter(
        (walletContract) =>
          !dossierContractAddress ||
          walletContract.dossierContractAddress === dossierContractAddress
      ),
  }
}
