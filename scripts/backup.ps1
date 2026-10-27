param(
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PgDumpCommand = 'pg_dump'
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required.' }
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputFile)
$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}
& $PgDumpCommand --format=custom --no-owner --no-acl --file=$resolvedOutput --dbname=$DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
Write-Host "Backup created: $resolvedOutput"
