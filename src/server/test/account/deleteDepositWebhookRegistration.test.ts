import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { AccountDepositWebhookRegistration } from '@/db'
import { depositWebhookManagementTokenHeader } from '@/server/routes/account/depositWebhookRegistrationAuth'

import { app } from '../indexer/app'

describe('DELETE /deposit-webhook-registrations/:id', () => {
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
      description: 'Anonymous',
      endpointUrl: 'https://anonymous.example/deposits',
      watchedWallets: ['xion1anonymouswallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: [],
      hashedManagementToken: hash,
    })
  })

  it('returns error if no management or account token', async () => {
    await request(app.callback())
      .delete(`/deposit-webhook-registrations/${registration.id}`)
      .expect(401)
      .expect({
        error: 'No deposit webhook management token.',
      })
  })

  it('returns error if registration does not exist', async () => {
    const missingRegistrationId =
      Math.max(registration.id, anonymousRegistration.id) + 1000

    await request(app.callback())
      .delete(`/deposit-webhook-registrations/${missingRegistrationId}`)
      .set(depositWebhookManagementTokenHeader, anonymousManagementToken)
      .expect(404)
      .expect({
        error: 'Deposit webhook registration not found.',
      })
  })

  it('deletes a registration with its management token', async () => {
    const { token: managementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    await registration.update({
      hashedManagementToken: hash,
    })

    await request(app.callback())
      .delete(`/deposit-webhook-registrations/${registration.id}`)
      .set(depositWebhookManagementTokenHeader, managementToken)
      .expect(204)

    await expect(
      AccountDepositWebhookRegistration.findByPk(registration.id)
    ).resolves.toBeNull()
  })

  it('deletes an anonymous registration with the management token', async () => {
    await request(app.callback())
      .delete(`/deposit-webhook-registrations/${anonymousRegistration.id}`)
      .set(depositWebhookManagementTokenHeader, anonymousManagementToken)
      .expect(204)

    await expect(
      AccountDepositWebhookRegistration.findByPk(anonymousRegistration.id)
    ).resolves.toBeNull()
  })
})
