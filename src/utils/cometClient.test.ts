import {
  Comet38Client,
  Tendermint34Client,
  Tendermint37Client,
} from '@cosmjs/tendermint-rpc'
import { afterEach, describe, expect, it, vi } from 'vitest'

import v32Block from '@/test/fixtures/cometbft-v0.40-xion-v32-block.json'

import {
  connectCometClient,
  connectCosmWasmClient,
  connectStargateClient,
} from './cometClient'

const RPC_URL = 'http://cometbft.test:26657'

// Answer JSON-RPC from a real xion v32 node's responses, with the reported
// CometBFT version swapped in.
const stubRpc = (version: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const { id, method, params } = JSON.parse(init?.body ?? '{}')
      const result =
        method === 'status'
          ? {
              ...v32Block.status,
              node_info: { ...v32Block.status.node_info, version },
            }
          : method === 'block_results' &&
            String(params?.height) === v32Block.block.block.header.height
          ? v32Block.block_results
          : undefined

      return new Response(
        JSON.stringify(
          result
            ? { jsonrpc: '2.0', id, result }
            : {
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: `unexpected ${method}` },
              }
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })
  )

describe('connectCometClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['0.34.27', Tendermint34Client],
    ['0.37.4', Tendermint37Client],
    ['0.38.26', Comet38Client],
    // CometBFT v0.40 (xion v32)
    ['0.39.0', Comet38Client],
    ['v0.38.19', Comet38Client],
    // CometBFT 1.x (needs CosmJS's Comet1Client, which 0.32 lacks) and
    // unparseable versions keep CosmJS's 0.34 fallback.
    ['1.0.0', Tendermint34Client],
    ['unknown', Tendermint34Client],
  ])('uses the right adaptor for version %s', async (version, adaptor) => {
    stubRpc(version)
    const client = await connectCometClient(RPC_URL)
    expect(client).toBeInstanceOf(adaptor)
    client.disconnect()
  })

  it('decodes CometBFT v0.40 block results', async () => {
    stubRpc('0.39.0')
    const client = await connectCometClient(RPC_URL)
    const height = Number(v32Block.block.block.header.height)
    const { results } = await client.blockResults(height)

    expect(results).toHaveLength(v32Block.block_results.txs_results.length)
    expect(results[0].events.map(({ type }) => type)).toEqual(
      v32Block.block_results.txs_results[0].events.map(({ type }) => type)
    )
    client.disconnect()
  })

  it('connects CosmWasm and Stargate clients on CometBFT v0.40', async () => {
    stubRpc('0.39.0')
    const cosmWasmClient = await connectCosmWasmClient(RPC_URL)
    expect(cosmWasmClient['forceGetCometClient']()).toBeInstanceOf(
      Comet38Client
    )
    expect(await cosmWasmClient.getChainId()).toBe('xion-local-v32')
    cosmWasmClient.disconnect()

    const stargateClient = await connectStargateClient(RPC_URL)
    expect(stargateClient['forceGetCometClient']()).toBeInstanceOf(
      Comet38Client
    )
    expect(await stargateClient.getChainId()).toBe('xion-local-v32')
    stargateClient.disconnect()
  })
})
