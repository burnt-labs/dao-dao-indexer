---
title: Infisical credentials stay out of process arguments
type: convention
scope: "{infisical/**,*infisical*.sh,package.json,README.md,tests/infisical-scripts.mjs}"
confidence: 0.99
sources: [33]
updated: 2026-11-17
---
Infisical tokens and client secrets must travel through environment/file input and API request bodies, not command-line arguments (including expanded shell strings).
`package.json`'s `with-infisical` loads `.env` through dotenv; `infisical:run` and `with-infisical.sh` rely on the CLI reading `INFISICAL_TOKEN` from the environment.
Token lifecycle commands use `infisical/common.mjs`'s `renewToken`, `universalAuthLogin`, and `revokeToken` helpers to send JSON bodies rather than invoking CLI credential flags.
The prior CLI approach exposed credentials via `ps` and `/proc/<pid>/cmdline`; shell expansion is still an argument leak even when the script itself contains only a variable name.
Review new credential-handling paths against this boundary. Use the shared redaction helpers for external error text and log token IDs/expiry metadata rather than credential values.
