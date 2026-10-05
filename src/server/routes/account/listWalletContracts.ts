import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountWalletContract, AccountWalletContractApiJson } from '@/db'

import { ApiKeyAuthState } from './apiKeyAuth'
import { canonicalizeAddress } from './walletContractUtils'

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
  // Normalize query parameters the same way POST canonicalizes body values so
  // both endpoints match on identical stored values.
  const chainId =
    typeof ctx.query.chainId === 'string' ? ctx.query.chainId.trim() : undefined

  const rawWalletAddress =
    typeof ctx.query.walletAddress === 'string'
      ? ctx.query.walletAddress
      : undefined
  const rawDossierContractAddress =
    typeof ctx.query.dossierContractAddress === 'string'
      ? ctx.query.dossierContractAddress
      : undefined

  const walletAddress = rawWalletAddress
    ? canonicalizeAddress(rawWalletAddress)
    : undefined
  const dossierContractAddress = rawDossierContractAddress
    ? canonicalizeAddress(rawDossierContractAddress)
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

  // Supplied addresses must be valid Bech32 addresses for this chain.
  if (
    (rawWalletAddress && !walletAddress) ||
    (rawDossierContractAddress && !dossierContractAddress)
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid walletAddress or dossierContractAddress.',
    }
    return
  }

  const baseWhere = {
    accountPublicKey: ctx.state.account.publicKey,
    chainId,
    // Optional filter.
    ...(walletAddress ? { walletAddress } : {}),
  }

  // Compute each wallet's latest mapping ID in the database. `current` refers
  // to each wallet's latest mapping across all dossiers, so this aggregation
  // intentionally ignores the dossier contract address filter. Doing it here
  // keeps the (unboundedly growing) history out of application memory when a
  // dossier filter is applied below.
  const sequelize = AccountWalletContract.sequelize
  if (!sequelize) {
    throw new Error('Database connection not initialized.')
  }

  const latestPerWallet = await AccountWalletContract.findAll({
    attributes: [
      'walletAddress',
      [sequelize.fn('MAX', sequelize.col('id')), 'latestId'],
    ],
    where: baseWhere,
    group: ['walletAddress'],
    raw: true,
  })
  const latestIds = new Set(
    (latestPerWallet as unknown as { latestId: number | string }[]).map(
      ({ latestId }) => Number(latestId)
    )
  )

  const walletContracts = await AccountWalletContract.findAll({
    where: {
      ...baseWhere,
      // Optional filter. Safe to apply in the query now that `current` was
      // computed above.
      ...(dossierContractAddress ? { dossierContractAddress } : {}),
    },
    order: [['id', 'DESC']],
  })

  ctx.status = 200
  ctx.body = {
    walletContracts: walletContracts.map((walletContract) => ({
      ...walletContract.apiJson,
      current: latestIds.has(walletContract.id),
    })),
  }
}
