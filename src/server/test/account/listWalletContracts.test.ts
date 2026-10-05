import { toBech32 } from '@cosmjs/encoding'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountWalletContract } from '@/db'
import { getAccountWithAuth } from '@/test/utils'

import { app } from './app'

const address = (byte: number) =>
  toBech32('xion', new Uint8Array(20).fill(byte))

const chainId = 'xion-testnet-2'

const createWalletContract = (apiKey: string, body: Record<string, unknown>) =>
  request(app.callback())
    .post('/wallet-contracts')
    .set('x-api-key', apiKey)
    .send(body)

describe('GET /wallet-contracts', () => {
  let apiKey: string
  beforeEach(async () => {
    const { paidApiKey } = await getAccountWithAuth()
    apiKey = paidApiKey
  })

  it('returns error if no API key', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .query({ chainId })
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing API key.',
      })
  })

  it('returns error if invalid API key', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', 'invalid')
      .query({ chainId })
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid API key.',
      })
  })

  it('returns error if missing chainId', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Missing chainId.',
      })
  })

  it('returns error if invalid address filters', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId, walletAddress: 'invalid' })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid walletAddress or dossierContractAddress.',
      })

    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId, dossierContractAddress: 'invalid' })
      .expect(400)
      .expect('Content-Type', /json/)
      .expect({
        error: 'Invalid walletAddress or dossierContractAddress.',
      })
  })

  it('returns empty list if none', async () => {
    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId })
      .expect(200)
      .expect('Content-Type', /json/)
      .expect({
        walletContracts: [],
      })
  })

  it("only returns the API key account's mappings", async () => {
    const { paidApiKey: otherApiKey } = await getAccountWithAuth()

    await createWalletContract(apiKey, {
      chainId,
      walletAddress: address(1),
      dossierContractAddress: address(2),
    }).expect(201)

    // Other account sees nothing on either endpoint...
    await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', otherApiKey)
      .query({ chainId })
      .expect(200)
      .expect({
        walletContracts: [],
      })

    // ...while the owning account sees its mapping.
    const response = await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId })
      .expect(200)

    expect(response.body.walletContracts).toHaveLength(1)
  })

  it('separates mappings by chainId', async () => {
    const body = {
      walletAddress: address(1),
      dossierContractAddress: address(2),
    }

    await createWalletContract(apiKey, { ...body, chainId }).expect(201)
    await createWalletContract(apiKey, {
      ...body,
      chainId: 'xion-mainnet-1',
    }).expect(201)

    const response = await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId })
      .expect(200)

    expect(response.body.walletContracts).toHaveLength(1)
    expect(response.body.walletContracts[0].chainId).toBe(chainId)
  })

  it('reads mappings and their current flags in one SQL statement', async () => {
    const { paidApiKey: otherApiKey } = await getAccountWithAuth()
    const mappings = [
      { walletAddress: address(1), dossierContractAddress: address(2) },
      { walletAddress: address(1), dossierContractAddress: address(3) },
      { walletAddress: address(4), dossierContractAddress: address(2) },
    ]
    for (const mapping of mappings) {
      await createWalletContract(apiKey, { chainId, ...mapping }).expect(201)
    }
    // Newer IDs for the same wallet in another account or chain must not
    // affect this account's current mapping.
    await createWalletContract(otherApiKey, {
      chainId,
      ...mappings[0],
    }).expect(201)
    await createWalletContract(apiKey, {
      chainId: 'xion-mainnet-1',
      ...mappings[0],
    }).expect(201)

    // Observe actual database statements without replacing query execution.
    const query = vi.spyOn(AccountWalletContract.sequelize!, 'query')
    try {
      const response = await request(app.callback())
        .get('/wallet-contracts')
        .set('x-api-key', apiKey)
        .query({ chainId })
        .expect(200)

      expect(
        response.body.walletContracts.map(
          ({ walletAddress, dossierContractAddress, current }: any) => ({
            walletAddress,
            dossierContractAddress,
            current,
          })
        )
      ).toEqual([
        { ...mappings[2], current: true },
        { ...mappings[1], current: true },
        { ...mappings[0], current: false },
      ])
      expect(
        query.mock.calls.filter(
          ([sql]) =>
            typeof sql === 'string' &&
            /^SELECT\b/i.test(sql) &&
            sql.includes('FROM "AccountWalletContracts"')
        )
      ).toHaveLength(1)
    } finally {
      query.mockRestore()
    }
  })

  it('marks current based on latest mapping across all dossiers', async () => {
    const walletAddress = address(1)
    const dossierA = address(2)
    const dossierB = address(3)

    // Wallet registers dossier A, then dossier B.
    await createWalletContract(apiKey, {
      chainId,
      walletAddress,
      dossierContractAddress: dossierA,
    }).expect(201)
    await createWalletContract(apiKey, {
      chainId,
      walletAddress,
      dossierContractAddress: dossierB,
    }).expect(201)

    // Filtered by A: A is returned but is not current since B is newer across
    // the wallet's full history.
    const filtered = await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId, dossierContractAddress: dossierA })
      .expect(200)

    expect(filtered.body.walletContracts).toHaveLength(1)
    expect(filtered.body.walletContracts[0].dossierContractAddress).toBe(
      dossierA
    )
    expect(filtered.body.walletContracts[0].current).toBe(false)

    // Unfiltered: both returned, newest first, and only B is current.
    const unfiltered = await request(app.callback())
      .get('/wallet-contracts')
      .set('x-api-key', apiKey)
      .query({ chainId })
      .expect(200)

    expect(unfiltered.body.walletContracts).toHaveLength(2)
    expect(
      unfiltered.body.walletContracts.map(
        ({ dossierContractAddress, current }: any) => ({
          dossierContractAddress,
          current,
        })
      )
    ).toEqual([
      { dossierContractAddress: dossierB, current: true },
      { dossierContractAddress: dossierA, current: false },
    ])
  })
})
