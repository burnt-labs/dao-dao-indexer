import request from 'supertest'
import { beforeEach, describe, it } from 'vitest'

import { AccountDepositWebhookRegistration } from '@/db'
import { depositWebhookManagementTokenHeader } from '@/server/routes/account/depositWebhookRegistrationAuth'

import { app } from '../indexer/app'

describe('GET /deposit-webhook-registrations/:id', () => {
  let registration: AccountDepositWebhookRegistration
  let anonymousRegistration: AccountDepositWebhookRegistration
  let anonymousManagementToken: string

  beforeEach(async () => {
    registration = await AccountDepositWebhookRegistration.create({
      description: 'Sandbox deposit listener',
      endpointUrl: 'https://partner.example/deposits',
      watchedWallets: ['xion1watchedwallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: [],
    })

    const { token: _anonymousManagementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    anonymousManagementToken = _anonymousManagementToken
    anonymousRegistration = await AccountDepositWebhookRegistration.create({
      description: 'Anonymous listener',
      endpointUrl: 'https://partner.example/anonymous-deposits',
      watchedWallets: ['xion1anonymouswallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: [],
      hashedManagementToken: hash,
    })
  })

  it('returns error if no management or account token', async () => {
    await request(app.callback())
      .get(`/deposit-webhook-registrations/${registration.id}`)
      .expect(401)
      .expect({
        error: 'No deposit webhook management token.',
      })
  })

  it('gets an existing registration with its management token', async () => {
    const { token: managementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    await registration.update({
      hashedManagementToken: hash,
    })

    await request(app.callback())
      .get(`/deposit-webhook-registrations/${registration.id}`)
      .set(depositWebhookManagementTokenHeader, managementToken)
      .expect(200)
      .expect({
        registration: registration.apiJson,
      })
  })

  it('gets an anonymous registration with the management token', async () => {
    await request(app.callback())
      .get(`/deposit-webhook-registrations/${anonymousRegistration.id}`)
      .set(depositWebhookManagementTokenHeader, anonymousManagementToken)
      .expect(200)
      .expect({
        registration: anonymousRegistration.apiJson,
      })
  })
})
