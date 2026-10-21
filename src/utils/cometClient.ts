import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { StargateClient } from '@cosmjs/stargate'
import {
  Comet38Client,
  CometClient,
  HttpEndpoint,
  Tendermint34Client,
  Tendermint37Client,
} from '@cosmjs/tendermint-rpc'

/**
 * Connect to a CometBFT RPC, picking the CosmJS adaptor from the version the
 * node reports.
 *
 * CosmJS's own `connectComet` (used by `CosmWasmClient.connect` and
 * `StargateClient.connect`) only recognizes 0.37.x and 0.38.x and falls back
 * to the Tendermint 0.34 adaptor for anything else. CometBFT v0.40 (xion v32)
 * reports `node_info.version` "0.39.0", so it gets the 0.34 adaptor, which
 * base64-decodes event attributes and fails every `block_results` call with
 * "Invalid string. Length must be a multiple of 4".
 *
 * Here 0.34 and 0.37 keep their adaptors, and 0.38 and newer use the 0.38
 * adaptor, which also reads the CometBFT v0.40 responses. Unparseable versions
 * keep CosmJS's 0.34 fallback.
 */
export const connectCometClient = async (
  endpoint: string | HttpEndpoint
): Promise<CometClient> => {
  // The status response has the same shape on every version, so any adaptor
  // can read it.
  const tm37Client = await Tendermint37Client.connect(endpoint)
  const { version } = (await tm37Client.status()).nodeInfo

  const match = version.match(/^v?(\d+)\.(\d+)\./)
  const major = match ? Number(match[1]) : 0
  const minor = match ? Number(match[2]) : 0

  if (major === 0 && minor === 37) {
    return tm37Client
  }

  tm37Client.disconnect()

  if (match && (major > 0 || minor >= 38)) {
    return Comet38Client.connect(endpoint)
  }

  return Tendermint34Client.connect(endpoint)
}

/**
 * `CosmWasmClient.connect` with the adaptor picked by `connectCometClient`.
 */
export const connectCosmWasmClient = async (
  endpoint: string | HttpEndpoint
): Promise<CosmWasmClient> =>
  CosmWasmClient.create(await connectCometClient(endpoint))

/**
 * `StargateClient.connect` with the adaptor picked by `connectCometClient`.
 */
export const connectStargateClient = async (
  endpoint: string | HttpEndpoint
): Promise<StargateClient> =>
  StargateClient.create(await connectCometClient(endpoint))
