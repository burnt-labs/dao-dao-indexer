import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Block,
  Contract,
  State,
  WasmCodeKey,
  WasmStateEvent,
  WasmStateEventTransformation,
} from '@/db'
import { app } from '@/server/test/indexer/app'
import { WasmCodeService } from '@/services/wasm-codes'
import { getAccountWithAuth } from '@/test/utils'
import { transformParsedStateEvents } from '@/transformers'
import { ParsedWasmStateEvent } from '@/types'
import { XION_ACCOUNT_CODE_IDS_KEY, dbKeyForKeys } from '@/utils'

const integrationTests =
  process.env.INTEGRATION_TESTS === 'true' ||
  process.env.INTEGRATION_TESTS === '1'

const AUD = 'project-live-7e4a3221-79cd-4f34-ac1d-fedac4bde13e'
const SUB = 'user-live-7d46c3ea-420a-4f0e-8628-efcc937c3c52'
const OTHER_AUD = 'project-live-other'
const ETH = '0x1cfd540baaa092124d8bfb29dbd5762bd80f1b56'

// Raw authenticators map write (cw-storage-plus Map<u8, Authenticator>); a null
// value is a RemoveAuthMethod delete.
const authenticatorEvent = (
  contractAddress: string,
  blockHeight: number,
  id: number,
  valueJson: unknown
): ParsedWasmStateEvent => ({
  type: 'state',
  codeId: 5,
  contractAddress,
  blockHeight: blockHeight.toString(),
  blockTimeUnixMs: blockHeight.toString(),
  blockTimestamp: new Date(blockHeight),
  key: dbKeyForKeys('authenticators', Buffer.from([id])),
  value: valueJson === null ? '' : JSON.stringify(valueJson),
  valueJson,
  delete: valueJson === null,
})

describe.runIf(integrationTests)(
  'xion account authenticator index (tracer → transformer → formula)',
  () => {
    let apiKey: string

    beforeEach(async () => {
      apiKey = (await getAccountWithAuth()).paidApiKey

      // What the `xion-account` wasm code tracker persists for code ID 5.
      await WasmCodeKey.createFromKeyAndIds(XION_ACCOUNT_CODE_IDS_KEY, 5)
      await WasmCodeService.instance.reloadWasmCodeIdsFromDB()

      await Contract.bulkCreate([
        { address: 'xion1acct', codeId: 5 },
        { address: 'xion1other', codeId: 5 },
      ])

      const events = [
        authenticatorEvent('xion1acct', 1, 0, { Jwt: { aud: AUD, sub: SUB } }),
        authenticatorEvent('xion1other', 1, 0, {
          Jwt: { aud: OTHER_AUD, sub: SUB },
        }),
        authenticatorEvent('xion1acct', 2, 1, { EthWallet: { address: ETH } }),
        authenticatorEvent('xion1acct', 3, 0, null),
      ]
      await WasmStateEvent.bulkCreate(
        events.map(({ type: _type, codeId: _codeId, ...event }) => event)
      )
      await transformParsedStateEvents(events)

      await Block.createMany([
        { height: 1, timeUnixMs: 1 },
        { height: 2, timeUnixMs: 2 },
        { height: 3, timeUnixMs: 3 },
      ])
      await State.updateSingleton({
        latestBlockHeight: 3,
        latestBlockTimeUnixMs: 3,
      })
    })

    const query = (params: Record<string, string>) =>
      request(app.callback())
        .get('/generic/_/xion/accountsByAuthenticator')
        .query(params)
        .set('x-api-key', apiKey)

    it('indexes each added authenticator once and ignores removals', async () => {
      const transformations = await WasmStateEventTransformation.findAll({
        order: [
          ['blockHeight', 'ASC'],
          ['contractAddress', 'ASC'],
        ],
      })

      expect(
        transformations.map(
          ({ contractAddress, name, blockHeight, value }) => ({
            contractAddress,
            name,
            blockHeight,
            value,
          })
        )
      ).toEqual([
        {
          contractAddress: 'xion1acct',
          name: `hasAuthenticator:JWT:${AUD}.${SUB}`,
          blockHeight: '1',
          value: true,
        },
        {
          contractAddress: 'xion1other',
          name: `hasAuthenticator:JWT:${OTHER_AUD}.${SUB}`,
          blockHeight: '1',
          value: true,
        },
        {
          contractAddress: 'xion1acct',
          name: `hasAuthenticator:EthWallet:${ETH}`,
          blockHeight: '2',
          value: true,
        },
      ])
    })

    it('resolves a login identity to accounts holding it at that block', async () => {
      await query({
        block: '2:2',
        type: 'JWT',
        authenticator: `${AUD}.${SUB}`,
      })
        .expect(200)
        .expect([
          {
            address: 'xion1acct',
            codeId: 5,
            authenticators: [
              { index: 0, type: 'JWT', authenticator: `${AUD}.${SUB}` },
              { index: 1, type: 'EthWallet', authenticator: ETH },
            ],
          },
        ])

      // Removed at block 3.
      await query({
        block: '3:3',
        type: 'JWT',
        authenticator: `${AUD}.${SUB}`,
      })
        .expect(200)
        .expect([])

      await query({ type: 'EthWallet', authenticator: ETH })
        .expect(200)
        .expect([
          {
            address: 'xion1acct',
            codeId: 5,
            authenticators: [
              { index: 1, type: 'EthWallet', authenticator: ETH },
            ],
          },
        ])
    })

    it('matches JWT by sub with optional aud', async () => {
      const other = {
        address: 'xion1other',
        codeId: 5,
        authenticators: [
          { index: 0, type: 'JWT', authenticator: `${OTHER_AUD}.${SUB}` },
        ],
      }

      await query({ block: '2:2', type: 'JWT', sub: SUB })
        .expect(200)
        .expect([
          {
            address: 'xion1acct',
            codeId: 5,
            authenticators: [
              { index: 0, type: 'JWT', authenticator: `${AUD}.${SUB}` },
              { index: 1, type: 'EthWallet', authenticator: ETH },
            ],
          },
          other,
        ])

      await query({ type: 'JWT', sub: SUB }).expect(200).expect([other])

      await query({ block: '2:2', type: 'JWT', sub: SUB, aud: OTHER_AUD })
        .expect(200)
        .expect([other])
    })

    it('rejects a missing identity', async () => {
      await query({ type: 'Secp256K1' }).expect(400)
    })
  }
)
