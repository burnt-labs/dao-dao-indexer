import { Middleware } from 'koa'

import { Account, AccountKey } from '@/db'

import { AccountState } from './types'

export type ApiKeyAuthState = AccountState & {
  accountKey: AccountKey
}

// Middleware that authorizes requests via an API key in the `x-api-key`
// header, e.g. for server-to-server usage from various apps. If successful,
// the `account` field will be set on the request state, accessible by
// successive middleware and route handlers.
export const apiKeyAuth: Middleware<ApiKeyAuthState> = async (ctx, next) => {
  const key = ctx.headers['x-api-key']
  if (typeof key !== 'string' || !key) {
    ctx.status = 401
    ctx.body = {
      error: 'Missing API key.',
    }
    return
  }

  const accountKey = await AccountKey.findForKey(key)
  if (!accountKey) {
    ctx.status = 401
    ctx.body = {
      error: 'Invalid API key.',
    }
    return
  }

  const account = await Account.findByPk(accountKey.accountPublicKey)
  if (!account) {
    ctx.status = 401
    ctx.body = {
      error: 'Invalid API key.',
    }
    return
  }

  // Set account.
  ctx.state.account = account
  ctx.state.accountKey = accountKey

  // Continue.
  await next()
}
