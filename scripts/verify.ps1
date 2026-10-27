$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
corepack enable
pnpm install --frozen-lockfile
pnpm check
