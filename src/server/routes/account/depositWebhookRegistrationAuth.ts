import { DefaultContext, DefaultState } from 'koa'

import { AccountDepositWebhookRegistration } from '@/db'

export const depositWebhookManagementTokenHeader = 'X-Deposit-Webhook-Token'

export type DepositWebhookRegistrationState = {
  depositWebhookRegistration?: AccountDepositWebhookRegistration
}

const setErrorResponse = (
  ctx: DefaultContext,
  status: number,
  error: string
): undefined => {
  ctx.status = status
  ctx.body = {
    error,
  }

  return
}

export const loadAuthorizedDepositWebhookRegistration = async (
  ctx: DefaultContext & {
    params: {
      id: string
    }
    state: DefaultState & DepositWebhookRegistrationState
  }
): Promise<AccountDepositWebhookRegistration | undefined> => {
  const registration = await AccountDepositWebhookRegistration.findByPk(
    ctx.params.id
  )

  if (!registration) {
    return setErrorResponse(ctx, 404, 'Deposit webhook registration not found.')
  }

  const managementToken = ctx.get(depositWebhookManagementTokenHeader)
  if (!managementToken) {
    return setErrorResponse(ctx, 401, 'No deposit webhook management token.')
  }

  if (
    registration.hashedManagementToken ===
    AccountDepositWebhookRegistration.hashManagementToken(managementToken)
  ) {
    ctx.state.depositWebhookRegistration = registration
    return registration
  }

  return setErrorResponse(ctx, 404, 'Deposit webhook registration not found.')
}
