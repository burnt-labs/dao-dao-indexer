/**
 * Import contract state from a state export file into the data DB, for
 * contracts whose state events the tracer never wrote.
 *
 * Each record in the file holds raw contract storage (cw-storage-plus keys and
 * values, base64) at one or more block heights, read from an archive node.
 * Every snapshot is written through `recoverContractState`, the same path as
 * `POST /contract/{address}/state/recover`: unchanged keys are skipped, events
 * are upserted on (contractAddress, key, blockHeight) and transformed. Re-runs
 * write nothing new.
 *
 * After the import, all state events of the imported contracts are
 * re-transformed (what `npm run transform -- -a <addresses>` does, in process,
 * without the worker queue), then xion account formulas are verified:
 * `authenticatorIdentities` must return the authenticators recorded in the
 * file and `accountsByAuthenticator` must resolve each of them back to the
 * account.
 *
 * Usage:
 *   npm run import-contract-state -- -f <file or https URL> [--dry-run]
 */

import { Command } from 'commander'

import { ConfigManager } from '@/config'
import { State, loadDb } from '@/db'
import {
  Verification,
  importRecord,
  loadExport,
  transformContracts,
  validateExport,
  verifyRecord,
} from '@/services/contract-state-import'
import { WasmCodeService } from '@/services/wasm-codes'
import { XION_ACCOUNT_CODE_IDS_KEY } from '@/utils'

const main = async () => {
  const program = new Command()
  program.option(
    '-c, --config <path>',
    'path to config file, falling back to config.json'
  )
  program.requiredOption(
    '-f, --file <path or URL>',
    'state export file (local path or https URL)'
  )
  program.option('-d, --dry-run', 'print what would be written; write nothing')
  program.option('--verify-only', 'skip the import; only run the verification')
  program.parse()
  const {
    config: _config,
    file,
    dryRun = false,
    verifyOnly = false,
  } = program.opts()

  ConfigManager.load(_config)
  const sequelize = await loadDb()
  const wasmCodeService = await WasmCodeService.setUpInstance()
  await wasmCodeService.reloadWasmCodeIdsFromDB()

  let exitCode = 0
  try {
    const { sha256, data } = await loadExport(file)
    console.log(
      `export ${file}\n  sha256 ${sha256}\n  chain ${data.chainId}, ${data.count} records, export height ${data.exportHeight}`
    )

    const problems = validateExport(data)
    if (problems.length) {
      throw new Error(`invalid export:\n  ${problems.join('\n  ')}`)
    }

    const state = await State.mustGetSingleton()
    if (state.chainId !== data.chainId) {
      throw new Error(
        `export is for ${data.chainId} but this indexer DB is ${state.chainId}`
      )
    }

    const accountCodeIds = wasmCodeService.findWasmCodeIdsByKeys(
      XION_ACCOUNT_CODE_IDS_KEY
    )
    const untracked = [
      ...new Set(
        data.records
          .map(({ codeId }) => codeId)
          .filter((codeId) => !accountCodeIds.includes(codeId))
      ),
    ]
    if (untracked.length) {
      throw new Error(
        `code IDs ${untracked.join(
          ', '
        )} are not tracked under '${XION_ACCOUNT_CODE_IDS_KEY}' ` +
          `(tracked: ${
            accountCodeIds.join(', ') || 'none'
          }), so their authenticators would not be transformed`
      )
    }

    if (!verifyOnly) {
      console.log(
        dryRun ? '\nDRY RUN: nothing will be written\n' : '\nimporting\n'
      )
      let events = 0
      let created = 0
      for (const record of data.records) {
        const result = await importRecord(record, dryRun)
        events += result.events
        created += result.existed ? 0 : 1
        console.log(
          [
            record.address,
            `code ${record.codeId}`,
            result.existed ? 'contract row exists' : 'contract row missing',
            `${result.events} events ${dryRun ? 'to write' : 'written'}`,
            ...(dryRun
              ? [
                  result.transformations.length
                    ? result.transformations
                        .map((name) =>
                          name.length > 72 ? `${name.slice(0, 69)}...` : name
                        )
                        .join(' ')
                    : 'no transformations',
                ]
              : []),
          ].join('  ')
        )
      }
      console.log(
        `\n${data.records.length} contracts, ${events} state events ${
          dryRun ? 'to write' : 'written'
        }, ${created} contract rows ${dryRun ? 'to create' : 'created'}`
      )

      if (!dryRun) {
        const transformed = await transformContracts(
          data.records.map(({ address }) => address)
        )
        console.log(
          `re-transformed the imported contracts: ${transformed} transformations upserted`
        )
      }
    }

    const latest = await State.mustGetSingleton()
    console.log(
      `\nverifying at latest block ${latest.latestBlockHeight}${
        dryRun ? ' (current state, before any import)' : ''
      }`
    )
    const results: Verification[] = []
    for (const record of data.records) {
      results.push(
        await verifyRecord(record, latest.chainId, latest.latestBlock)
      )
    }
    const failed = results.filter(
      ({ forward, reverse }) => !forward || !reverse
    )
    // Before an import every record is expected to fail; only list failures
    // after one.
    if (!dryRun) {
      failed
        .slice(0, 50)
        .forEach(({ address, problems }) =>
          console.log(`  FAIL ${address}: ${problems.join('; ')}`)
        )
    }
    console.log(
      `authenticatorIdentities non-empty and matching the chain: ${
        results.filter(({ forward }) => forward).length
      }/${results.length}\n` +
        `accountsByAuthenticator resolving every identity:        ${
          results.filter(({ reverse }) => reverse).length
        }/${results.length}`
    )
    if (failed.length && !dryRun) {
      exitCode = 1
    } else if (!dryRun) {
      console.log('OK')
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    exitCode = 1
  }

  await sequelize.close()
  process.exit(exitCode)
}

main()
