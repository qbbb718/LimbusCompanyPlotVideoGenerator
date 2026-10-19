<#
.SYNOPSIS
    Pre-populates the electron-builder "winCodeSign" cache so that a Windows
    build works without administrator rights.

.DESCRIPTION
    electron-builder's helper binary (app-builder.exe) needs the
    winCodeSign-2.6.0 package for two things on Windows:

      * rcedit-x64.exe  - writes the icon / version info into the app .exe
      * windows-10/x64/signtool.exe - only used when a certificate is set

    app-builder downloads winCodeSign-2.6.0.7z (GitHub release, or
    ELECTRON_BUILDER_BINARIES_MIRROR) and unpacks it with the bundled
    7za.exe. The archive contains two macOS symlinks
    (darwin/10.12/lib/libcrypto.dylib, darwin/10.12/lib/libssl.dylib), and
    creating a symlink on Windows requires administrator rights or Developer
    Mode. On a normal (non-elevated) account 7za therefore fails with

        ERROR: Cannot create symbolic link : a required privilege is not held
        by the client

    and electron-builder aborts the whole packaging step with

        app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
        (cannot execute ... cause=exit status 2)

    Before downloading anything app-builder checks this directory:

        %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0

    If it exists it is used as is and 7za never runs. This script creates
    exactly that directory, skipping the two symlinks (they are macOS-only,
    a Windows build never reads them). Everything else is unpacked verbatim,
    and the archive is verified against the same SHA-512 that app-builder
    checks.

    URL, mirror and checksum handling mirror app-builder's own code
    (pkg/download/tool.go, pkg/download/artifactDownloader.go), so this
    script prepares precisely the artifact electron-builder would have
    downloaded.

    The script is idempotent: when the cache is already prepared it does
    nothing. It is called by demo/build-package.bat; a failure there is only
    a warning, because an elevated shell can still unpack the archive itself.

.PARAMETER Force
    Re-create the cache directory even when it already exists.

.PARAMETER CacheRoot
    Override the electron-builder cache root. Defaults to
    $env:ELECTRON_BUILDER_CACHE, else %LOCALAPPDATA%\electron-builder\Cache.

.EXAMPLE
    node_modules-free check from the repo root:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-win-codesign.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-win-codesign.ps1 -Force
#>

[CmdletBinding()]
param(
    [switch] $Force,
    [string] $CacheRoot,
    [string] $Mirror
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Constants - these must match what app-builder.exe (app-builder-bin, which
# ships with electron-builder) asks for. Update the version together with
# electron-builder upgrades; if the two ever disagree this script only warms
# an unused directory and electron-builder falls back to its own download.
# ---------------------------------------------------------------------------
$PackageId      = 'winCodeSign-2.6.0'
$PackageVersion = '2.6.0'
$ExpectedSha512 = '6LQI2d9BPC3Xs0ZoTQe1o3tPiA28c7+PY69Q9i/pD8lY45psMtHuLwv3vRckiVr3Zx1cbNyLlBR8STwCdcHwtA=='
$DefaultGithubBase = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/'

# Symlink entries of the archive. Creating them needs SeCreateSymbolicLink
# privileges, they are macOS-only and a Windows build never reads them.
$SymlinkEntries = @(
    'darwin\10.12\lib\libcrypto.dylib',
    'darwin\10.12\lib\libssl.dylib'
)

# Files that are actually used on Windows. A cache directory without them is
# worse than no cache directory (app-builder trusts the directory blindly),
# so they are verified before the directory is moved into place.
$RequiredFiles = @(
    'rcedit-x64.exe',
    'windows-10\x64\signtool.exe'
)

$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step ([string] $Message) {
    Write-Host "       $Message"
}

function Get-FirstEnvValue {
    param([string[]] $Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }
    return $null
}

function Get-Sha512Base64 ([string] $Path) {
    $algorithm = [System.Security.Cryptography.SHA512]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return [Convert]::ToBase64String($algorithm.ComputeHash($stream))
    }
    finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Get-SevenZipPath {
    $candidates = @(
        (Join-Path $RepoRoot 'demo\frontend\electron-react-app\node_modules\7zip-bin\win\x64\7za.exe'),
        (Join-Path $RepoRoot 'demo\frontend\electron-react-app\node_modules\7zip-bin\win\ia32\7za.exe'),
        (Join-Path $RepoRoot 'demo\frontend\electron-react-app\node_modules\7zip-bin\linux\x64\7za')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $fromPath = Get-Command '7za.exe' -ErrorAction SilentlyContinue
    if ($null -ne $fromPath) {
        return $fromPath.Source
    }

    return $null
}

# ---------------------------------------------------------------------------
# Resolve the cache directory app-builder would use.
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($CacheRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($env:ELECTRON_BUILDER_CACHE)) {
        $CacheRoot = $env:ELECTRON_BUILDER_CACHE
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $CacheRoot = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
    }
    else {
        $CacheRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'electron-builder\Cache'
    }
}

# app-builder puts every artifact below the part of its name before the first
# hyphen (GetCacheDirectoryForArtifact), then uses the full name as directory:
# <cache>\winCodeSign\winCodeSign-2.6.0
$ArtifactCacheDir = Join-Path (Join-Path $CacheRoot 'winCodeSign') $PackageId

if ((Test-Path -LiteralPath $ArtifactCacheDir -PathType Container) -and -not $Force) {
    Write-Step "winCodeSign cache already prepared"
    exit 0
}

# ---------------------------------------------------------------------------
# Resolve the download URL exactly like app-builder's GetGithubBaseUrl /
# GetGithubReleaseUrl do.
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Mirror)) {
    $Mirror = Get-FirstEnvValue @(
        'NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR',
        'npm_config_electron_builder_binaries_mirror',
        'npm_package_config_electron_builder_binaries_mirror',
        'ELECTRON_BUILDER_BINARIES_MIRROR'
    )
}
if ([string]::IsNullOrWhiteSpace($Mirror)) {
    $Mirror = $DefaultGithubBase
}
if (-not $Mirror.EndsWith('/')) {
    $Mirror = $Mirror + '/'
}

$CustomDir = Get-FirstEnvValue @(
    'NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR',
    'npm_config_electron_builder_binaries_custom_dir',
    'npm_package_config_electron_builder_binaries_custom_dir',
    'ELECTRON_BUILDER_BINARIES_CUSTOM_DIR'
)
if ([string]::IsNullOrWhiteSpace($CustomDir)) {
    $CustomDir = $PackageId
}

$Url = "$Mirror$CustomDir/$PackageId.7z"

$SevenZip = Get-SevenZipPath
if ($null -eq $SevenZip) {
    Write-Warning "7za.exe not found - run npm install in demo\frontend\electron-react-app first"
    exit 1
}

$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("winCodeSign-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$ArchivePath = Join-Path $TempRoot "$PackageId.7z"
$ExtractDir = Join-Path $TempRoot 'unpacked'

New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

try {
    Write-Step "Preparing winCodeSign cache (no admin rights needed): $ArtifactCacheDir"
    Write-Step "Downloading $Url"

    $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
    if ($null -ne $curl) {
        & $curl.Source '-fsSL' '--retry' '3' '--connect-timeout' '20' '--max-time' '600' '-o' $ArchivePath $Url
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
            throw "download failed (curl exit code $LASTEXITCODE): $Url"
        }
    }
    else {
        $previousProgress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try {
            Invoke-WebRequest -Uri $Url -OutFile $ArchivePath -UseBasicParsing
        }
        finally {
            $ProgressPreference = $previousProgress
        }
    }

    # Same integrity check app-builder performs before unpacking.
    $actualSha512 = Get-Sha512Base64 $ArchivePath
    if ($actualSha512 -ne $ExpectedSha512) {
        throw "SHA-512 mismatch for $Url`n  expected $ExpectedSha512`n  actual   $actualSha512"
    }
    Write-Step "Checksum verified"

    $sevenZipArgs = @('x', '-bd', '-y', $ArchivePath, "-o$ExtractDir")
    foreach ($entry in $SymlinkEntries) {
        # -x!<entry> keeps 7za from trying to create a symlink, which needs
        # administrator rights.
        $sevenZipArgs += "-x!$entry"
    }

    & $SevenZip @sevenZipArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "7za failed to unpack $ArchivePath (exit code $LASTEXITCODE)"
    }

    $missing = @()
    foreach ($file in $RequiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $ExtractDir $file) -PathType Leaf)) {
            $missing += $file
        }
    }
    if ($missing.Count -gt 0) {
        throw "unpacked package is incomplete, missing: $($missing -join ', ')"
    }

    $artifactParent = Split-Path -Parent $ArtifactCacheDir
    if (-not (Test-Path -LiteralPath $artifactParent -PathType Container)) {
        New-Item -ItemType Directory -Path $artifactParent -Force | Out-Null
    }
    if (Test-Path -LiteralPath $ArtifactCacheDir) {
        Remove-Item -LiteralPath $ArtifactCacheDir -Recurse -Force
    }

    Move-Item -LiteralPath $ExtractDir -Destination $ArtifactCacheDir
    Write-Step "winCodeSign cache ready"
    exit 0
}
catch {
    Write-Warning "could not prepare the winCodeSign cache: $($_.Exception.Message)"
    exit 1
}
finally {
    # The archive, the temporary unpack directory and any half-written
    # directory are all regenerable.
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
