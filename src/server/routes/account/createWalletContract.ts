import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountWalletContract } from '@/db'
import { objectMatchesStructure } from '@/utils'

import { ApiKeyAuthState } from './apiKeyAuth'
import { canonicalizeAddress } from './walletContractUtils'

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

export const createWalletContract: Router.Middleware<
  ApiKeyAuthState,
  DefaultContext,
  CreateWalletContractResponse
> = async (ctx) => {
  // The public test API key is rate-limit/credit exempt and publicly known, so
  // it must not be able to persist data.
  if (ctx.state.accountKey.isTest) {
    ctx.status = 403
    ctx.body = {
      error: 'The test API key cannot create wallet contracts.',
    }
    return
  }

  const body: CreateWalletContractRequest = ctx.request.body

  // Validate chain ID and canonicalize addresses so the same address always
  // maps to one stored value regardless of client casing.
  const validStructure = objectMatchesStructure(body, {
    chainId: {},
    walletAddress: {},
    dossierContractAddress: {},
  })
  const canonicalWalletAddress =
    validStructure && canonicalizeAddress(body.walletAddress)
  const canonicalDossierContractAddress =
    validStructure && canonicalizeAddress(body.dossierContractAddress)

  if (
    !validStructure ||
    typeof body.chainId !== 'string' ||
    !body.chainId.trim() ||
    !canonicalWalletAddress ||
    !canonicalDossierContractAddress
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid chainId, walletAddress, or dossierContractAddress.',
    }
    return
  }

  const chainId = body.chainId.trim()
  const walletAddress = canonicalWalletAddress
  const dossierContractAddress = canonicalDossierContractAddress

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
