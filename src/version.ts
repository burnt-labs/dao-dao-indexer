import { readFileSync } from 'fs'
import { join } from 'path'

const injectedVersion = process.env.APP_VERSION?.trim()
const packageVersion = () => {
  // Read version from package.json at startup. Using readFileSync since this
  // runs once at import time, not per-request.
  // Use process.cwd() instead of __dirname since bundlers like tsup change
  // __dirname resolution, but cwd is reliably /app in Docker.
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  )

  return pkg.version as string
}

// Prefer the image/build-injected version when available so `/status`
// reflects the published artifact version instead of the static repo file.
export const version: string = injectedVersion || packageVersion()
