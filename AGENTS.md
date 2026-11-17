# AGENTS.md

## Infisical

- Never put Infisical tokens or client secrets in command-line arguments, shell-history examples, or logs. Use `npm run with-infisical -- <command>` to supply `INFISICAL_TOKEN` through the environment, and use the scripts in `infisical/` for login, renewal, and revocation; send secrets in HTTPS request bodies and redact external error text with the helpers in `infisical/common.mjs`.
- When changing Infisical token handling, use `writeTokenToEnvFile` in `infisical/common.mjs` for token updates to preserve locking and atomic mode-600 writes; pass `expectedCurrent` when renewing so an overlapping rotation is not overwritten. Run `npm run test:infisical` after changing Infisical scripts or wrappers.
