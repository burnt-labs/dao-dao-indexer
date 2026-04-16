import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { AccountDepositWebhookRegistrationApiJson } from '@/db'

import {
  DepositWebhookRegistrationState,
  loadAuthorizedDepositWebhookRegistration,
} from './depositWebhookRegistrationAuth'

type GetDepositWebhookRegistrationResponse =
  | {
      registration: AccountDepositWebhookRegistrationApiJson
    }
  | {
      error: string
    }

export const getDepositWebhookRegistration: Router.Middleware<
  DepositWebhookRegistrationState,
  DefaultContext,
  GetDepositWebhookRegistrationResponse
> = async (ctx) => {
  const registration = await loadAuthorizedDepositWebhookRegistration(
    ctx as any
  )
  if (!registration) {
    return
  }

  ctx.status = 200
  ctx.body = {
    registration: registration.apiJson,
  }
}
