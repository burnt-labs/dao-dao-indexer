import { fromBech32 } from '@cosmjs/encoding'
import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountWalletContract } from '@/db'
import { objectMatchesStructure } from '@/utils'

import { ApiKeyAuthState } from './apiKeyAuth'

type CreateWalletContractRequest = {
  chainId: string
  walletAddress: string
  dossierContractAddress: string
}

type CreateWalletContractResponse =
  | AccountWalletContract['apiJson']
  | {
      error: string
    }

const BECH32_PREFIX = 'xion'

const isValidAddress = (address: unknown): address is string => {
  if (typeof address !== 'string') {
    return false
  }

  try {
    return fromBech32(address.trim()).prefix === BECH32_PREFIX
  } catch {
    return false
  }
}

export const createWalletContract: Router.Middleware<
  ApiKeyAuthState,
  DefaultContext,
  CreateWalletContractResponse
> = async (ctx) => {
  const body: CreateWalletContractRequest = ctx.request.body

  // Validate chain ID and addresses.
  if (
    !objectMatchesStructure(body, {
      chainId: {},
      walletAddress: {},
      dossierContractAddress: {},
    }) ||
    typeof body.chainId !== 'string' ||
    !body.chainId.trim() ||
    !isValidAddress(body.walletAddress) ||
    !isValidAddress(body.dossierContractAddress)
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid chainId, walletAddress, or dossierContractAddress.',
    }
    return
  }

  const chainId = body.chainId.trim()
  const walletAddress = body.walletAddress.trim()
  const dossierContractAddress = body.dossierContractAddress.trim()

  // Upsert so repeated calls from various apps are idempotent.
  const [walletContract, created] = await AccountWalletContract.findOrCreate({
    where: {
      accountPublicKey: ctx.state.account.publicKey,
      chainId,
      walletAddress,
      dossierContractAddress,
    },
    defaults: {
      accountPublicKey: ctx.state.account.publicKey,
      chainId,
      walletAddress,
      dossierContractAddress,
    },
  })

  ctx.status = created ? 201 : 200
  ctx.body = walletContract.apiJson
}
