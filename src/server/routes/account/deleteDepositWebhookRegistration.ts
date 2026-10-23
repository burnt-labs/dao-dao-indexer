import Router from '@koa/router'
import { DefaultContext } from 'koa'

import {
  DepositWebhookRegistrationState,
  loadAuthorizedDepositWebhookRegistration,
} from './depositWebhookRegistrationAuth'

type DeleteDepositWebhookRegistrationResponse =
  | undefined
  | {
      error: string
    }

export const deleteDepositWebhookRegistration: Router.Middleware<
  DepositWebhookRegistrationState,
  DefaultContext,
  DeleteDepositWebhookRegistrationResponse
> = async (ctx) => {
  const registration = await loadAuthorizedDepositWebhookRegistration(
    ctx as any
  )
  if (!registration) {
    return
  }

  await registration.destroy()
  ctx.status = 204
}
