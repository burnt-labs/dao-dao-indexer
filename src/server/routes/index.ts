import Router from '@koa/router'
import Koa from 'koa'

import { Config } from '@/types'
import { version } from '@/version'

import { accountRouter } from './account'
import { setUpDocs } from './docs'
import { setUpIndexerRouter } from './indexer'
import { setUpBullBoard } from './jobs'

export type SetupRouterOptions = {
  config: Config
  // Whether to run the account server.
  accounts: boolean
  // Whether to also run the indexer server in the same process.
  both?: boolean
}

export const setUpRouter = async (
  app: Koa,
  { config, accounts, both }: SetupRouterOptions
) => {
  const router = new Router()

  // Ping.
  router.get('/ping', (ctx) => {
    ctx.status = 200
    ctx.body = 'pong'
  })

  // Health check for Kubernetes probes
  router.get('/health', (ctx) => {
    ctx.status = 200
    ctx.body = {
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
    }
  })

  if (accounts) {
    // Account API.
    router.use(accountRouter.routes(), accountRouter.allowedMethods())
  }

  if (!accounts || both) {
    // Background jobs dashboard.
    await setUpBullBoard(app, config)

    // Swagger API docs.
    setUpDocs(app)

    // Indexer API.
    await setUpIndexerRouter(router)
  }

  // Enable router.
  app.use(router.routes()).use(router.allowedMethods())
}
