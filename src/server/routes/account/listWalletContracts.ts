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
  const chainId = ctx.query.chainId
  const walletAddress = ctx.query.walletAddress
  const dossierContractAddress = ctx.query.dossierContractAddress

  // Chain ID is required so mappings from different environments (e.g.
  // testnet vs. mainnet) never mix.
  if (typeof chainId !== 'string' || !chainId) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing chainId.',
    }
    return
  }

  const walletContracts = await AccountWalletContract.findAll({
    where: {
      accountPublicKey: ctx.state.account.publicKey,
      chainId,
      // Optional filters.
      ...(typeof walletAddress === 'string' && walletAddress
        ? { walletAddress }
        : {}),
      ...(typeof dossierContractAddress === 'string' && dossierContractAddress
        ? { dossierContractAddress }
        : {}),
    },
    // Newest first so the first row seen per wallet address is current.
    order: [['id', 'DESC']],
  })

  const seenWalletAddresses = new Set<string>()

  ctx.status = 200
  ctx.body = {
    walletContracts: walletContracts.map((walletContract) => {
      const current = !seenWalletAddresses.has(walletContract.walletAddress)
      seenWalletAddresses.add(walletContract.walletAddress)

      return {
        ...walletContract.apiJson,
        current,
      }
    }),
  }
}
