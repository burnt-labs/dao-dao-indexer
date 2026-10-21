import { sha256 } from '@cosmjs/crypto'
import { fromBase64, toHex } from '@cosmjs/encoding'
import { afterEach, describe, expect, it, vi } from 'vitest'

import v31Block from '@/test/fixtures/cometbft-v0.38-xion-v31-block.json'
import v32Block from '@/test/fixtures/cometbft-v0.40-xion-v32-block.json'
import { AutoCosmWasmClient } from '@/utils'

import { BlockIterator, BlockIteratorError, TxData } from './BlockIterator'

type RpcFixture = typeof v31Block | typeof v32Block

const RPC_URL = 'http://cometbft.test:26657'

/**
 * Replace the HTTP transport under CosmJS with a JSON-RPC server that answers
 * from responses captured from a real node. Everything above the transport is
 * the real CosmJS and the real indexer code.
 */
const stubRpc = (fixture: RpcFixture) => {
  const height = fixture.block.block.header.height
  const methods: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const { id, method, params } = JSON.parse(init?.body ?? '{}')
      methods.push(method)

      const result =
        method === 'status'
          ? fixture.status
          : method === 'block' && String(params?.height) === height
          ? fixture.block
          : method === 'block_results' && String(params?.height) === height
          ? fixture.block_results
          : undefined

      return new Response(
        JSON.stringify(
          result
            ? { jsonrpc: '2.0', id, result }
            : {
                jsonrpc: '2.0',
                id,
                error: {
                  code: -32603,
                  message: 'Internal error',
                  data: `unexpected request ${method} ${JSON.stringify(
                    params
                  )}`,
                },
              }
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
  )

  return methods
}

describe('BlockIterator against real CometBFT responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['xion v31 (CometBFT 0.38.26)', v31Block],
    ['xion v32 (CometBFT v0.40, reports 0.39.0)', v32Block],
  ])(
    'decodes block results and tx events on %s',
    async (_name, fixture: RpcFixture) => {
      const methods = stubRpc(fixture)
      const height = Number(fixture.block.block.header.height)

      const autoCosmWasmClient = await AutoCosmWasmClient.create(RPC_URL)
      autoCosmWasmClient.stop()

      const blockIterator = new BlockIterator({
        rpcUrl: RPC_URL,
        autoCosmWasmClient,
      })
      await blockIterator['fetchBlockData'](height)
      const item = blockIterator['buffer'].get(height)

      // Surface the decode error itself if the block failed to load.
      expect(
        item instanceof BlockIteratorError ? item.message : undefined
      ).toBeUndefined()
      if (!item || item instanceof BlockIteratorError) {
        throw new Error('block not buffered')
      }

      expect(item.block).toEqual({
        version: {
          // CometBFT omits `app` when it is 0.
          app: '0',
          block: fixture.block.block.header.version.block,
        },
        chainId: fixture.block.block.header.chain_id,
        height,
        time: new Date(fixture.block.block.header.time).toISOString(),
      })

      const rawTxs = fixture.block.block.data.txs
      const txResults = fixture.block_results.txs_results
      expect(rawTxs.length).toBeGreaterThan(0)
      expect(item.txs).toHaveLength(rawTxs.length)

      item.txs.forEach((tx, index) => {
        expect(tx).not.toBeInstanceOf(BlockIteratorError)
        const { hash, code, events, messages } = tx as TxData
        expect(hash).toBe(
          toHex(sha256(fromBase64(rawTxs[index]))).toUpperCase()
        )
        expect(code).toBe(txResults[index].code)
        expect(messages.length).toBeGreaterThan(0)
        // Event attributes are plain strings since CometBFT 0.38, and must come
        // through unchanged.
        expect(events).toEqual(
          txResults[index].events.map(({ type, attributes }) => ({
            type,
            attributes: attributes.map(({ key, value }) => ({ key, value })),
          }))
        )
      })

      // The extractors match on wasm events; make sure they are there.
      expect(
        (item.txs[0] as TxData).events.some(({ type }) => type === 'wasm')
      ).toBe(true)

      expect(methods).toContain('block_results')
    },
    // A block that fails to decode is retried 30 times, 1 second apart.
    60_000
  )
})
