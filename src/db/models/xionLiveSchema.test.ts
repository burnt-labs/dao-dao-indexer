import { QueryTypes, Sequelize } from 'sequelize'
import { describe, expect, it } from 'vitest'

import {
  Account,
  AccountDepositWebhookRegistration,
  AccountWalletContract,
  BankDenomBalance,
} from '@/db'

// The Xion production databases (xion_mainnet, xion_testnet and the shared
// accounts database) were set up with `sync`, and then some unused indexes
// were dropped on purpose to free disk. A later `sync` recreates any index the
// models still declare, some of them without CONCURRENTLY on large tables. These
// tests pin the indexes and foreign keys that a model-built database has to the
// ones in production, so a model change that would bring a dropped index back
// fails here first.
//
// The expected definitions are copied from read-only catalog dumps of
// xion_mainnet, xion_testnet and accounts taken on 2026-11-27. Both Xion data
// databases had the same index set for these tables.

const getSequelize = (model: { sequelize?: Sequelize }) => {
  if (!model.sequelize) {
    throw new Error('Model is not initialized')
  }
  return model.sequelize
}

const getIndexDefinitions = async (
  sequelize: Sequelize,
  table: string
): Promise<string[]> =>
  (
    await sequelize.query<{ definition: string }>(
      `
        SELECT pg_get_indexdef(i.indexrelid) AS "definition"
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid = :table::regclass
        ORDER BY c.relname
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { table: `"${table}"` },
      }
    )
  ).map(({ definition }) => definition)

const getForeignKeys = async (
  sequelize: Sequelize,
  table: string
): Promise<string[]> =>
  (
    await sequelize.query<{ name: string; definition: string }>(
      `
        SELECT conname AS "name",
               pg_get_constraintdef(oid) AS "definition"
        FROM pg_constraint
        WHERE conrelid = :table::regclass AND contype = 'f'
        ORDER BY conname
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { table: `"${table}"` },
      }
    )
  ).map(({ name, definition }) => `${name}: ${definition}`)

const LIVE_XION_DATA_INDEXES: Record<string, string[]> = {
  BankDenomBalances: [
    'CREATE UNIQUE INDEX "BankDenomBalances_pkey" ON public."BankDenomBalances" USING btree (id)',
    'CREATE UNIQUE INDEX bank_denom_balances_address_denom ON public."BankDenomBalances" USING btree (address, denom)',
  ],
  BankStateEvents: [
    'CREATE UNIQUE INDEX "BankStateEvents_pkey" ON public."BankStateEvents" USING btree (id)',
    'CREATE UNIQUE INDEX bank_state_events_address_denom_block_height ON public."BankStateEvents" USING btree (address, denom, "blockHeight" DESC)',
  ],
  FeegrantAllowances: [
    'CREATE UNIQUE INDEX "FeegrantAllowances_pkey" ON public."FeegrantAllowances" USING btree (id)',
    'CREATE INDEX feegrant_allowances_block_height ON public."FeegrantAllowances" USING btree ("blockHeight")',
    'CREATE INDEX feegrant_allowances_grantee_block_height ON public."FeegrantAllowances" USING btree (grantee text_pattern_ops, "blockHeight" DESC)',
    'CREATE UNIQUE INDEX feegrant_allowances_granter_grantee_block_height ON public."FeegrantAllowances" USING btree (granter, grantee, "blockHeight" DESC)',
  ],
  WasmStateEvents: [
    'CREATE UNIQUE INDEX "WasmStateEvents_pkey" ON public."WasmStateEvents" USING btree (id)',
    'CREATE INDEX wasm_state_events_block_height ON public."WasmStateEvents" USING btree ("blockHeight")',
    'CREATE UNIQUE INDEX wasm_state_events_contract_address_key_block_height ON public."WasmStateEvents" USING btree ("contractAddress", key text_pattern_ops, "blockHeight" DESC)',
    // dbKeyForKeys('contract_info')
    `CREATE INDEX wasm_state_events_contract_info_contract_address_block_height ON public."WasmStateEvents" USING btree ("contractAddress", "blockHeight" DESC) WHERE (key = '99,111,110,116,114,97,99,116,95,105,110,102,111'::text)`,
  ],
}

// Dropped from both Xion data databases and intentionally not declared.
const DROPPED_XION_DATA_INDEXES = [
  'bank_denom_balances_address_block_height',
  'bank_state_events_address_block_height',
  'feegrant_allowances_granter_block_height',
  'feegrant_allowances_active_parsed_denom',
  'feegrant_allowances_active_parsed_allowance_type',
  'feegrant_allowances_parsed_denom',
  'feegrant_allowances_parsed_allowance_type',
  'wasm_state_events_key_trgm_idx',
]

describe('model-built schema matches live Xion', () => {
  describe('data database indexes', () => {
    it.each(Object.entries(LIVE_XION_DATA_INDEXES))(
      '%s has exactly the live index set',
      async (table, expected) => {
        expect(
          await getIndexDefinitions(getSequelize(BankDenomBalance), table)
        ).toEqual(expected)
      }
    )

    it('does not create any of the indexes dropped from Xion', async () => {
      const names = await getSequelize(BankDenomBalance).query<{
        name: string
      }>(
        `
          SELECT indexname AS "name" FROM pg_indexes
          WHERE schemaname = 'public' AND indexname IN (:names)
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { names: DROPPED_XION_DATA_INDEXES },
        }
      )

      expect(names).toEqual([])
    })
  })

  describe('accounts database', () => {
    it('AccountWalletContracts has the live indexes', async () => {
      expect(
        await getIndexDefinitions(
          getSequelize(AccountWalletContract),
          'AccountWalletContracts'
        )
      ).toEqual([
        'CREATE UNIQUE INDEX "AccountWalletContracts_pkey" ON public."AccountWalletContracts" USING btree (id)',
        'CREATE UNIQUE INDEX account_wallet_contracts_account_public_key_chain_id_wallet_add ON public."AccountWalletContracts" USING btree ("accountPublicKey", "chainId", "walletAddress", "dossierContractAddress")',
        'CREATE INDEX account_wallet_contracts_chain_id_dossier_contract_address ON public."AccountWalletContracts" USING btree ("chainId", "dossierContractAddress")',
        'CREATE INDEX account_wallet_contracts_chain_id_wallet_address ON public."AccountWalletContracts" USING btree ("chainId", "walletAddress")',
      ])
    })

    it('AccountWalletContracts has the live foreign key, with ON DELETE CASCADE', async () => {
      expect(
        await getForeignKeys(
          getSequelize(AccountWalletContract),
          'AccountWalletContracts'
        )
      ).toEqual([
        'AccountWalletContracts_accountPublicKey_fkey: FOREIGN KEY ("accountPublicKey") REFERENCES "Accounts"("publicKey") ON UPDATE CASCADE ON DELETE CASCADE',
      ])
    })

    it('deleting an account deletes its wallet contracts', async () => {
      const account = await Account.create({ publicKey: 'xion-live-schema' })
      await AccountWalletContract.create({
        accountPublicKey: account.publicKey,
        chainId: 'xion-testnet-2',
        walletAddress: 'xion1wallet',
        dossierContractAddress: 'xion1dossier',
      })

      await account.destroy()

      expect(
        await AccountWalletContract.count({
          where: { accountPublicKey: account.publicKey },
        })
      ).toBe(0)
    })
  })

  describe('AccountDepositWebhookRegistration', () => {
    it('is registered on the data database, not the accounts database', () => {
      const dataSequelize = getSequelize(BankDenomBalance)
      const accountsSequelize = getSequelize(AccountWalletContract)

      expect(getSequelize(AccountDepositWebhookRegistration)).toBe(
        dataSequelize
      )
      expect(
        accountsSequelize.isDefined('AccountDepositWebhookRegistration')
      ).toBe(false)
    })
  })
})
