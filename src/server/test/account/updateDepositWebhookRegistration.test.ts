import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { AccountDepositWebhookRegistration } from '@/db'
import { depositWebhookManagementTokenHeader } from '@/server/routes/account/depositWebhookRegistrationAuth'

import { app } from '../indexer/app'

describe('PATCH /deposit-webhook-registrations/:id', () => {
  let registration: AccountDepositWebhookRegistration
  let anonymousRegistration: AccountDepositWebhookRegistration
  let anonymousManagementToken: string

  beforeEach(async () => {
    registration = await AccountDepositWebhookRegistration.create({
      description: 'Sandbox deposit listener',
      endpointUrl: 'https://partner.example/deposits',
      authHeader: 'Authorization',
      authToken: 'secret-token',
      watchedWallets: ['xion1watchedwallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: [],
    })

    const { token: _anonymousManagementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    anonymousManagementToken = _anonymousManagementToken
    anonymousRegistration = await AccountDepositWebhookRegistration.create({
      description: 'Anonymous deposit listener',
      endpointUrl: 'https://partner.example/anonymous-deposits',
      watchedWallets: ['xion1anonymouswallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: [],
      hashedManagementToken: hash,
    })
  })

  it('returns error if no management or account token', async () => {
    await request(app.callback())
      .patch(`/deposit-webhook-registrations/${registration.id}`)
      .expect(401)
      .expect({
        error: 'No deposit webhook management token.',
      })
  })

  it('returns error if registration not found', async () => {
    await request(app.callback())
      .patch(`/deposit-webhook-registrations/${registration.id + 1}`)
      .set(depositWebhookManagementTokenHeader, anonymousManagementToken)
      .expect(404)
      .expect({
        error: 'Deposit webhook registration not found.',
      })
  })

  it('updates an anonymous registration with the management token', async () => {
    const response = await request(app.callback())
      .patch(`/deposit-webhook-registrations/${anonymousRegistration.id}`)
      .set(depositWebhookManagementTokenHeader, anonymousManagementToken)
      .send({
        endpointUrl: 'https://partner.example/updated-anonymous-deposits',
        allowedNativeDenoms: [],
        allowedCw20Contracts: ['xion1stablecoincontract'],
      })
      .expect(200)

    expect(response.body.registration).toMatchObject({
      id: anonymousRegistration.id,
      endpointUrl: 'https://partner.example/updated-anonymous-deposits',
      allowedNativeDenoms: [],
      allowedCw20Contracts: ['xion1stablecoincontract'],
    })
  })

  it('updates an existing registration with its management token', async () => {
    const { token: managementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    await registration.update({
      hashedManagementToken: hash,
    })

    const response = await request(app.callback())
      .patch(`/deposit-webhook-registrations/${registration.id}`)
      .set(depositWebhookManagementTokenHeader, managementToken)
      .send({
        endpointUrl: 'https://partner.example/prod-deposits',
        watchedWallets: ['xion1watchedwallet', 'xion1secondwallet'],
        allowedNativeDenoms: [],
        allowedCw20Contracts: ['xion1stablecoincontract'],
        enabled: false,
      })
      .expect(200)

    expect(response.body.registration).toMatchObject({
      id: registration.id,
      endpointUrl: 'https://partner.example/prod-deposits',
      watchedWallets: ['xion1watchedwallet', 'xion1secondwallet'],
      allowedNativeDenoms: [],
      allowedCw20Contracts: ['xion1stablecoincontract'],
      enabled: false,
    })
  })

  it('rejects removing all watched wallets or asset filters', async () => {
    const { token: managementToken, hash } =
      AccountDepositWebhookRegistration.generateManagementTokenAndHash()
    await registration.update({
      hashedManagementToken: hash,
    })

    await request(app.callback())
      .patch(`/deposit-webhook-registrations/${registration.id}`)
      .set(depositWebhookManagementTokenHeader, managementToken)
      .send({
        watchedWallets: [],
      })
      .expect(400)
      .expect({
        error: 'At least one watched wallet is required.',
      })

    await request(app.callback())
      .patch(`/deposit-webhook-registrations/${registration.id}`)
      .set(depositWebhookManagementTokenHeader, managementToken)
      .send({
        allowedNativeDenoms: [],
        allowedCw20Contracts: [],
      })
      .expect(400)
      .expect({
        error: 'At least one allowed asset filter is required.',
      })
  })
})
