import { describe, expect, it } from 'vitest'

import { getXionAuthenticatorIdentity } from './xionAccount'

describe('getXionAuthenticatorIdentity', () => {
  // Values sampled from account contract state (xion-mainnet-1 code ID 5 unless
  // noted).
  it.each([
    [
      {
        Jwt: {
          aud: 'project-live-7e4a3221-79cd-4f34-ac1d-fedac4bde13e',
          sub: 'user-live-7d46c3ea-420a-4f0e-8628-efcc937c3c52',
        },
      },
      {
        type: 'JWT',
        authenticator:
          'project-live-7e4a3221-79cd-4f34-ac1d-fedac4bde13e.user-live-7d46c3ea-420a-4f0e-8628-efcc937c3c52',
      },
    ],
    [
      { EthWallet: { address: '0x1cfd540baaa092124d8bfb29dbd5762bd80f1b56' } },
      {
        type: 'EthWallet',
        authenticator: '0x1cfd540baaa092124d8bfb29dbd5762bd80f1b56',
      },
    ],
    [
      { Secp256K1: { pubkey: 'AudnmtW63QNxgu48fy9fUhAoWsHtZVjaPMmyexc3OKKF' } },
      {
        type: 'Secp256K1',
        authenticator: 'AudnmtW63QNxgu48fy9fUhAoWsHtZVjaPMmyexc3OKKF',
      },
    ],
    [
      {
        Passkey: {
          url: 'https://disable-passkey-icon-in-inse.xion-dashboard-mainnet.pages.dev',
          // JSON go-webauthn Credential with untagged Go field names (`ID`).
          passkey:
            'eyJJRCI6IjBwRzE4VWY4Si9yUERyajdQWHBGTVE9PSIsIlB1YmxpY0tleSI6InBRRUNBeVlnQVNGWUlEdVQyQUZLeTAxNXpYNVg5MmFBUURzUkFFdmdmR1p3K2NPSW56dUNQcXRESWxnZ1lMVnU5RzNoM0dKZnBteWNWRDlqYXo3V1JVVi94QVYxMjBJUHNBVEJ2R0k9IiwiQXR0ZXN0YXRpb25UeXBlIjoibm9uZSIsIlRyYW5zcG9ydCI6WyJoeWJyaWQiLCJpbnRlcm5hbCJdLCJGbGFncyI6eyJVc2VyUHJlc2VudCI6dHJ1ZSwiVXNlclZlcmlmaWVkIjp0cnVlLCJCYWNrdXBFbGlnaWJsZSI6dHJ1ZSwiQmFja3VwU3RhdGUiOnRydWV9LCJBdXRoZW50aWNhdG9yIjp7IkFBR1VJRCI6IjZwdU5aazBCSFNFODVMYTBqTFYxMUE9PSIsIlNpZ25Db3VudCI6MCwiQ2xvbmVXYXJuaW5nIjpmYWxzZSwiQXR0YWNobWVudCI6InBsYXRmb3JtIn19',
        },
      },
      { type: 'Passkey', authenticator: '0pG18Uf8J/rPDrj7PXpFMQ==' },
    ],
    // xion-testnet-2, account v0.1.1 (code ID 1880).
    [
      {
        ZKEmail: {
          email_salt:
            '1230647954737870557369339116210069166041685765205936890411240898560648265508',
          allowed_email_hosts: ['zkauth+testnet@zk.burnt.com'],
        },
      },
      {
        type: 'ZKEmail',
        authenticator:
          '1230647954737870557369339116210069166041685765205936890411240898560648265508',
      },
    ],
  ])('decodes on-chain value %j', (value, expected) => {
    expect(getXionAuthenticatorIdentity(value)).toEqual(expected)
  })

  it('reads the credential ID from current go-webauthn JSON (`id`)', () => {
    const passkey = Buffer.from(
      JSON.stringify({
        id: 'q83vEjRWeJA=',
        publicKey: 'pQECAyYgASFYIA==',
        attestationType: 'none',
        attestation: { object: 'o2NmbXRkbm9uZQ==' },
      })
    ).toString('base64')

    expect(
      getXionAuthenticatorIdentity({
        Passkey: { url: 'https://settings.burnt.com', passkey },
      })
    ).toEqual({ type: 'Passkey', authenticator: 'q83vEjRWeJA=' })
  })

  it.each([
    ['null', null],
    ['empty object', {}],
    ['unknown variant', { Unknown: {} }],
    ['two variants', { Ed25519: { pubkey: 'a' }, Secp256R1: { pubkey: 'b' } }],
    ['non-string field', { Jwt: { aud: 1 } }],
    ['missing JWT sub', { Jwt: { aud: 'a' } }],
    ['snake_case variant', { eth_wallet: { address: '0xab' } }],
    ['non-object variant value', { Secp256K1: 'AudnmtW63QNxgu48' }],
    ['empty pubkey', { Secp256K1: { pubkey: '' } }],
    ['empty address', { EthWallet: { address: '' } }],
    ['Passkey blob not base64 JSON', { Passkey: { url: 'u', passkey: '!!' } }],
    [
      'Passkey credential without id',
      {
        Passkey: {
          url: 'u',
          passkey: Buffer.from('{"publicKey":"pQ=="}').toString('base64'),
        },
      },
    ],
  ])('returns undefined for %s', (_name, value) => {
    expect(getXionAuthenticatorIdentity(value)).toBeUndefined()
  })
})
