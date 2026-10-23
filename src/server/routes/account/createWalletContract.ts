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

// NOTE: A wallet-contract mapping is only an app's assertion. Bech32
// validation does not prove the dossier contract exists on-chain nor that the
// wallet deployed or owns it. Consumers must not treat these mappings as
// proof of ownership.

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

  // chainId is STRING(255) with no other length bound, so reject oversized
  // values here instead of failing at the database. The addresses cannot
  // exceed their columns: canonicalization re-encodes via Bech32, which
  // rejects anything over 90 characters.
  if (chainId.length > 255) {
    ctx.status = 400
    ctx.body = {
      error: 'chainId too long.',
    }
    return
  }

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
