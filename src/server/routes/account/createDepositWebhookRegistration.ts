import Router from '@koa/router'
import { DefaultContext } from 'koa'

import {
  AccountDepositWebhookRegistration,
  AccountDepositWebhookRegistrationApiJson,
} from '@/db'

import { DepositWebhookRegistrationState } from './depositWebhookRegistrationAuth'
import { validateAndNormalizeDepositWebhookRegistration } from './depositWebhookRegistrationUtils'

type CreateDepositWebhookRegistrationRequest = Pick<
  AccountDepositWebhookRegistration,
  | 'description'
  | 'endpointUrl'
  | 'authHeader'
  | 'authToken'
  | 'watchedWallets'
  | 'allowedNativeDenoms'
  | 'allowedCw20Contracts'
  | 'enabled'
>

type CreateDepositWebhookRegistrationResponse =
  | {
      registration: AccountDepositWebhookRegistrationApiJson
      managementToken: string
    }
  | {
      error: string
    }

export const createDepositWebhookRegistration: Router.Middleware<
  DepositWebhookRegistrationState,
  DefaultContext,
  CreateDepositWebhookRegistrationResponse
> = async (ctx) => {
  const body: CreateDepositWebhookRegistrationRequest = ctx.request.body

  const validation = validateAndNormalizeDepositWebhookRegistration({
    body,
    requireAll: true,
  })
  if ('error' in validation) {
    ctx.status = 400
    ctx.body = validation
    return
  }

  const { token: managementToken, hash: hashedManagementToken } =
    AccountDepositWebhookRegistration.generateManagementTokenAndHash()

  const registration = await AccountDepositWebhookRegistration.create({
    ...validation.normalized,
    enabled: validation.normalized.enabled ?? true,
    hashedManagementToken,
  })

  ctx.status = 201
  ctx.body = {
    registration: registration.apiJson,
    managementToken,
  }
}
