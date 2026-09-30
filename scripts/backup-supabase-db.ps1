# Manual full database backup for the spec-v Supabase project.
# Requirements: Supabase CLI, Docker Desktop, and SUPABASE_DB_URL in this process.
# The URI is passed only to the CLI and is never written or printed by this script.
param()

$ErrorActionPreference = 'Stop'
$projectRef = 'wmirenenjrsbljgpyxkn'
$backupRoot = 'C:\backup\spec-v-db'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dbUrl = $env:SUPABASE_DB_URL

if ([string]::IsNullOrWhiteSpace($dbUrl)) {
    throw 'Set SUPABASE_DB_URL in the current PowerShell process before running this script. The value is never printed.'
}

try {
    $uri = [Uri]$dbUrl
    $user = [Uri]::UnescapeDataString(($uri.UserInfo -split ':', 2)[0])
} catch {
    throw 'SUPABASE_DB_URL is not a valid PostgreSQL connection URI. Its value is never printed.'
}

if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'SUPABASE_DB_URL must use the postgres or postgresql scheme.'
}

if (($uri.Host -notmatch [regex]::Escape($projectRef)) -and ($user -notmatch [regex]::Escape($projectRef))) {
    throw "The connection URI does not identify the expected Supabase project ($projectRef). Its value is never printed."
}

$cli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $cli) {
    throw 'Supabase CLI was not found. Install it and Docker Desktop, then run this script again. No connection value was printed.'
}

$null = New-Item -ItemType Directory -Path $backupRoot -Force
$dumpKinds = @(
    @{ Name = 'roles'; Flags = @('--role-only') },
    @{ Name = 'schema'; Flags = @() },
    @{ Name = 'data'; Flags = @('--use-copy', '--data-only') }
)

foreach ($kind in $dumpKinds) {
    $path = Join-Path $backupRoot "spec-v-db-$stamp-$($kind.Name).sql"
    $arguments = @('db', 'dump', '--db-url', $dbUrl, '-f', $path) + $kind.Flags
    $null = & $cli.Source @arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase db dump failed for the $($kind.Name) file (exit code $LASTEXITCODE). CLI output was suppressed to protect connection details."
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Supabase CLI did not create the $($kind.Name) backup file. CLI output was suppressed."
    }
}

foreach ($kind in $dumpKinds) {
    $path = Join-Path $backupRoot "spec-v-db-$stamp-$($kind.Name).sql"
    $stream = [System.IO.StreamReader]::new($path)
    try {
        $lineCount = 0L
        while ($null -ne $stream.ReadLine()) { $lineCount++ }
    } finally {
        $stream.Dispose()
    }
    $file = Get-Item -LiteralPath $path
    if ($file.Length -eq 0) {
        throw "The $($kind.Name) backup file is empty. No connection value was printed."
    }
    [PSCustomObject]@{
        File = $file.Name
        Bytes = $file.Length
        Lines = $lineCount
    }
}
