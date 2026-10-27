param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PgRestoreCommand = 'pg_restore'
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required.' }
$resolvedInput = (Resolve-Path -LiteralPath $InputFile).Path
& $PgRestoreCommand --clean --if-exists --no-owner --no-acl --dbname=$DatabaseUrl $resolvedInput
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }
Write-Host "Restore completed from: $resolvedInput"
