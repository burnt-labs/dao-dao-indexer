import { toBech32 } from '@cosmjs/encoding'
import request from 'supertest'
import { beforeEach, describe, it } from 'vitest'

import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

// Route behavior is covered by the accounts API tests in
// src/server/test/account/*WalletContract*.test.ts. These check the indexer
// API serves the same routes instead of its formula catch-all.
describe('indexer API /wallet-contracts', () => {
  const chainId = 'xion-testnet-2'
  const walletAddress = toBech32('xion', new Uint8Array(20).fill(1))
  const dossierContractAddress = toBech32('xion', new Uint8Array(20).fill(2))

  let apiKey: string
  beforeEach(async () => {
    apiKey = (await getAccountWithAuth()).paidApiKey
  })

  it('creates and lists mappings', async () => {
    const { body: created } = await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send({ chainId, walletAddress, dossierContractAddress })
      .expect(201)

    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId, walletAddress })
      .expect(200)
      .expect({
        walletContracts: [
          {
            id: created.id,
            chainId,
            walletAddress,
            dossierContractAddress,
            current: true,
          },
        ],
      })
  })

  it('requires an API key', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .query({ chainId })
      .expect(401)
      .expect({ error: 'Missing API key.' })
  })
})
