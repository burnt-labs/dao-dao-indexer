import Router from '@koa/router'
import { koaBody } from 'koa-body'

import { createDepositWebhookRegistration } from '../account/createDepositWebhookRegistration'
import { deleteDepositWebhookRegistration } from '../account/deleteDepositWebhookRegistration'
import { getDepositWebhookRegistration } from '../account/getDepositWebhookRegistration'
import { updateDepositWebhookRegistration } from '../account/updateDepositWebhookRegistration'
import { loadAggregator } from './aggregator'
import { loadComputer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const setUpIndexerRouter = async (root: Router) => {
  const indexerRouter = new Router()
  indexerRouter.use(koaBody())

  // Status.
  indexerRouter.get('/status', getStatus)

  // Check if indexer is caught up.
  indexerRouter.get('/up', up)

  // Anonymous, chain-scoped deposit webhook registration management.
  indexerRouter.post(
    '/deposit-webhook-registrations',
    createDepositWebhookRegistration
  )
  indexerRouter.get(
    '/deposit-webhook-registrations/:id',
    getDepositWebhookRegistration
  )
  indexerRouter.patch(
    '/deposit-webhook-registrations/:id',
    updateDepositWebhookRegistration
  )
  indexerRouter.delete(
    '/deposit-webhook-registrations/:id',
    deleteDepositWebhookRegistration
  )

  // Aggregator routes (with "a" prefix to distinguish from formulas).
  const aggregator = await loadAggregator()
  indexerRouter.get('/a/(.+)', aggregator)

  // Formula computer. This must be the last route since it's a catch-all.
  const computer = await loadComputer()
  indexerRouter.get('/(.+)', computer)

  root.use(indexerRouter.routes(), indexerRouter.allowedMethods())
}
