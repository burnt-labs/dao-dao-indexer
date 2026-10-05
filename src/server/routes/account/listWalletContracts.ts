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

  const sequelize = AccountWalletContract.sequelize
  if (!sequelize) {
    throw new Error('Database connection not initialized.')
  }

  // Compute `current` in the same SQL snapshot as the returned records so a
  // concurrent insert cannot make the flags inconsistent. The subquery uses
  // the wallet's full account/chain history, ignoring the dossier filter.
  const walletContracts = await AccountWalletContract.findAll({
    attributes: {
      include: [
        [
          sequelize.literal(`"AccountWalletContract"."id" = (
            SELECT MAX("latest"."id")
            FROM "AccountWalletContracts" AS "latest"
            WHERE "latest"."accountPublicKey" = "AccountWalletContract"."accountPublicKey"
              AND "latest"."chainId" = "AccountWalletContract"."chainId"
              AND "latest"."walletAddress" = "AccountWalletContract"."walletAddress"
          )`),
          'current',
        ],
      ],
    },
    where: {
      ...baseWhere,
      // Optional filter, applied only to the returned records.
      ...(dossierContractAddress ? { dossierContractAddress } : {}),
    },
    order: [['id', 'DESC']],
  })

  ctx.status = 200
  ctx.body = {
    walletContracts: walletContracts.map((walletContract) => ({
      ...walletContract.apiJson,
      current: walletContract.getDataValue('current'),
    })),
  }
}
