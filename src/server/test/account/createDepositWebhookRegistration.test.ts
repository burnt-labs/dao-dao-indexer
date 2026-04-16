import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { AccountDepositWebhookRegistration } from '@/db'

import { app } from '../indexer/app'

describe('POST /deposit-webhook-registrations', () => {
  it('creates an anonymous registration without account auth', async () => {
    const response = await request(app.callback())
      .post('/deposit-webhook-registrations')
      .send({
        description: 'Sandbox deposit listener',
        endpointUrl: 'https://partner.example/deposits',
        authHeader: 'Authorization',
        authToken: 'secret-token',
        watchedWallets: ['xion1watchedwallet'],
        allowedNativeDenoms: ['uxion'],
        allowedCw20Contracts: ['xion1stablecoincontract'],
      })
      .expect(201)

    expect(response.body.managementToken).toBeTruthy()
    expect(response.body.registration).toMatchObject({
      description: 'Sandbox deposit listener',
      endpointUrl: 'https://partner.example/deposits',
      authHeader: 'Authorization',
      authToken: 'secret-token',
      watchedWallets: ['xion1watchedwallet'],
      allowedNativeDenoms: ['uxion'],
      allowedCw20Contracts: ['xion1stablecoincontract'],
      enabled: true,
    })

    const registrations = await AccountDepositWebhookRegistration.findAll()
    expect(registrations).toHaveLength(1)
    expect(registrations[0].hashedManagementToken).toBeTruthy()
  })

  it('validates required fields', async () => {
    await request(app.callback())
      .post('/deposit-webhook-registrations')
      .send({})
      .expect(400)
      .expect({
        error: 'Invalid endpoint URL.',
      })

    await request(app.callback())
      .post('/deposit-webhook-registrations')
      .send({
        endpointUrl: 'https://partner.example/deposits',
      })
      .expect(400)
      .expect({
        error: 'At least one watched wallet is required.',
      })

    await request(app.callback())
      .post('/deposit-webhook-registrations')
      .send({
        endpointUrl: 'https://partner.example/deposits',
        watchedWallets: ['xion1watchedwallet'],
      })
      .expect(400)
      .expect({
        error: 'At least one allowed asset filter is required.',
      })
  })
})
