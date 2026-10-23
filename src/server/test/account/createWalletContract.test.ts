import { toBech32 } from '@cosmjs/encoding'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { AccountKey, AccountWalletContract } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

const address = (byte: number) =>
  toBech32('xion', new Uint8Array(20).fill(byte))

const validBody = {
  chainId: 'xion-testnet-2',
  walletAddress: address(1),
  dossierContractAddress: address(2),
}

describe('POST /wallet-contracts', () => {
  let apiKey: string
  beforeEach(async () => {
    const { paidApiKey } = await getAccountWithAuth()
    apiKey = paidApiKey
  })

  it('returns error if no API key', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .send(validBody)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing API key.',
      })
  })

  it('returns error if invalid API key', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', 'invalid')
      .send(validBody)
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid API key.',
      })
  })

  it('returns error if test API key', async () => {
    const { account } = await getAccountWithAuth()
    await account.$create<AccountKey>('key', {
      name: 'test',
      description: null,
      hashedKey: AccountKey.hashKey('test'),
    })

    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', 'test')
      .send(validBody)
      .expect(403)
      .expect('Content-Type', /json/)
      .expect({
        error: 'The test API key cannot create wallet contracts.',
      })

    // Verify not created.
    expect(await AccountWalletContract.count()).toBe(0)
  })

  it('returns error if invalid fields', async () => {
    await Promise.all(
      [
        {},
        { chainId: 'xion-testnet-2' },
        { ...validBody, chainId: '' },
        { ...validBody, chainId: '  ' },
        { ...validBody, chainId: 1 },
        { ...validBody, walletAddress: 'invalid' },
        { ...validBody, walletAddress: address(1).replace('xion', 'other') },
        { ...validBody, dossierContractAddress: 'invalid' },
        { ...validBody, dossierContractAddress: undefined },
      ].map((body) =>
        request(app.callback())
          .post('/wallet-contracts')
          .set('x-api-key', apiKey)
          .send(body)
          .expect(400)
          .expect('Content-Type', /json/)
          .expect({
            error: 'Invalid chainId, walletAddress, or dossierContractAddress.',
          })
      )
    )

    // Verify none created.
    expect(await AccountWalletContract.count()).toBe(0)
  })

  it('returns error if chainId too long', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send({
        ...validBody,
        chainId: 'c'.repeat(256),
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'chainId too long.',
      })

    // Verify not created.
    expect(await AccountWalletContract.count()).toBe(0)
  })

  it('returns error if address too long', async () => {
    // Valid Bech32 but over 90 characters, which canonicalization rejects.
    const longAddress = toBech32('xion', new Uint8Array(160).fill(3), Infinity)
    expect(longAddress.length).toBeGreaterThan(255)

    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send({
        ...validBody,
        dossierContractAddress: longAddress,
      })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid chainId, walletAddress, or dossierContractAddress.',
      })

    // Verify not created.
    expect(await AccountWalletContract.count()).toBe(0)
  })

  it('creates a wallet contract', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send(validBody)
      .expect(201)
      .expect('Content-Type', /json/)

    expect(await AccountWalletContract.count()).toBe(1)
    const walletContract = await AccountWalletContract.findOne()
    expect(walletContract!.chainId).toBe(validBody.chainId)
    expect(walletContract!.walletAddress).toBe(validBody.walletAddress)
    expect(walletContract!.dossierContractAddress).toBe(
      validBody.dossierContractAddress
    )
  })

  it('trims and canonicalizes inputs', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send({
        chainId: `  ${validBody.chainId}  `,
        walletAddress: validBody.walletAddress.toUpperCase(),
        dossierContractAddress: validBody.dossierContractAddress,
      })
      .expect(201)

    const walletContract = await AccountWalletContract.findOne()
    expect(walletContract!.chainId).toBe(validBody.chainId)
    expect(walletContract!.walletAddress).toBe(validBody.walletAddress)
  })

  it('is idempotent on duplicate write', async () => {
    const first = await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send(validBody)
      .expect(201)

    const second = await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send(validBody)
      .expect(200)

    expect(second.body.id).toBe(first.body.id)
    expect(await AccountWalletContract.count()).toBe(1)
  })

  it('stores only one record on concurrent duplicate writes', async () => {
    const responses = await Promise.all(
      [...Array(5)].map(() =>
        request(app.callback())
          .post('/wallet-contracts')
          .set('x-api-key', apiKey)
          .send(validBody)
      )
    )

    // All requests succeed.
    for (const response of responses) {
      expect([200, 201]).toContain(response.status)
    }

    // Only one record created, and all responses reference it.
    expect(await AccountWalletContract.count()).toBe(1)
    const { id } = (await AccountWalletContract.findOne())!
    for (const response of responses) {
      expect(response.body.id).toBe(id)
    }
  })

  it('treats the same wallet and contract on different chains as distinct', async () => {
    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send(validBody)
      .expect(201)

    await request(app.callback())
      .post('/wallet-contracts')
      .set('x-api-key', apiKey)
      .send({
        ...validBody,
        chainId: 'xion-mainnet-1',
      })
      .expect(201)

    expect(await AccountWalletContract.count()).toBe(2)
  })
})
