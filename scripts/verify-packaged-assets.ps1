# Verify the asset payload / the packaged resources for one installer variant.
#
# Called from demo\build-package.bat and .github\workflows\release.yml, twice per variant:
#
#   Stage = payload    (before electron-builder) the payload folder is usable at all.
#                      A missing demo\pack is only a WARNING inside electron-builder
#                      ("file source doesn't exist"), so without this check a broken build
#                      happily produces an installer with no assets.
#
#   Stage = package    (after electron-builder) the packaged resources really contain what the
#                      payload promised, and - for the lite variant - nothing else.
#
# Two profiles, matching scripts\pack-assets.mjs:
#
#   full   demo\pack\assets + demo\pack\data, i.e. the curated set plus the locally developed
#          characters / animation clips / project.db.
#   lite   demo\pack\assets only ui/effects/fonts, and no demo\pack\data at all. The packaged
#          resources must not contain characters / backgrounds / audios / clips either, and
#          resources\data must be absent or empty - that is the whole point of the variant.
#
# Keep this file ASCII-only: it is started by cmd.exe (code page 65001 after chcp, but Windows
# PowerShell 5.1 reads a BOM-less .ps1 as ANSI, so Chinese text here would come out garbled) and
# its output lands in demo\logs\build-*.txt next to the otherwise English build log.
#
# Exit codes: 0 = ok, 1 = failed (details on stdout).

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("payload", "package")]
    [string]$Stage,

    [Parameter(Mandatory = $true)]
    [ValidateSet("full", "lite")]
    [string]$Profile,

    # demo\pack
    [Parameter(Mandatory = $true)]
    [string]$PayloadDir,

    # <output>\win-unpacked\resources (package stage only)
    [string]$ResourcesDir = ""
)

$ErrorActionPreference = "Stop"

# Runtime-required assets: preview rendering and video export hard-fail without them
# (mirrors AssetMaintenanceService.REQUIRED_UI_FILES / REQUIRED_FONT_FILES).
$RequiredUiFiles = @(
    "border_1080p.png",
    "dialogBox.png",
    "speaker-camp.png",
    "speaker-name.png",
    "location.png"
)

# Asset folders that only the full variant may ship.
$OptionalAssetDirs = @("characters", "animation-clips", "backgrounds", "audios", "thumbnails")

function Fail([string]$message) {
    Write-Host "[ERROR] $message"
    exit 1
}

# Every path is resolved to an absolute one up front: the payload -> package comparison builds
# relative names with Substring(<dir>.Length), which silently produces garbage for a relative
# directory ("_t\pack\assets" is shorter than the absolute file names below it).
function Resolve-FullPath([string]$path) {
    if ([System.IO.Path]::IsPathRooted($path)) {
        return [System.IO.Path]::GetFullPath($path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $path))
}

$PayloadDir = Resolve-FullPath $PayloadDir
if (-not [string]::IsNullOrWhiteSpace($ResourcesDir)) {
    $ResourcesDir = Resolve-FullPath $ResourcesDir
}

function Get-Files([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return @() }
    return @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue)
}

# Relative paths (lower case, slash separated) of every file below $dir; used for the
# payload -> package comparison. Names legitimately contain characters that matter to PowerShell
# wildcards ([]) and to Windows path lookups (case), hence -LiteralPath plus a lower-cased table.
function Get-RelativeFileTable([string]$dir) {
    $table = @{}
    foreach ($file in (Get-Files $dir)) {
        $relative = $file.FullName.Substring($dir.Length).TrimStart("\")
        $table[$relative.ToLowerInvariant()] = $file.FullName
    }
    return $table
}

function Assert-DirNotEmpty([string]$dir, [string]$label) {
    $files = Get-Files $dir
    if ($files.Count -lt 1) {
        Fail "$label is empty or missing: $dir"
    }
    return $files.Count
}

# ---------------------------------------------------------------- payload stage

if ($Stage -eq "payload") {
    if (-not (Test-Path -LiteralPath $PayloadDir)) {
        Fail "asset payload does not exist: $PayloadDir (run scripts\pack-assets.mjs first)"
    }

    $assetsDir = Join-Path $PayloadDir "assets"
    if (-not (Test-Path -LiteralPath $assetsDir)) {
        Fail "asset payload has no assets folder: $assetsDir"
    }

    foreach ($name in $RequiredUiFiles) {
        $file = Join-Path $assetsDir "ui\$name"
        if (-not (Test-Path -LiteralPath $file)) {
            Fail "asset payload is missing ui\$name ($file)"
        }
    }
    $fontFile = Join-Path $assetsDir "fonts\ChineseFont.ttf"
    if (-not (Test-Path -LiteralPath $fontFile)) {
        Fail "asset payload is missing fonts\ChineseFont.ttf ($fontFile)"
    }
    $effectCount = Assert-DirNotEmpty (Join-Path $assetsDir "effects") "asset payload effects folder"

    $dataDir = Join-Path $PayloadDir "data"
    $dataFiles = Get-Files $dataDir

    if ($Profile -eq "full") {
        if ($dataFiles.Count -lt 1) {
            Fail "full payload has no data\project.db: $dataDir"
        }
        $assetCount = (Get-Files $assetsDir).Count
        Write-Host ("       payload ok (full): " + $assetCount + " asset files, " + $dataFiles.Count + " data files, effects: " + $effectCount)
        exit 0
    }

    # lite: nothing but ui/effects/fonts may be in there, and no database at all.
    if ($dataFiles.Count -gt 0) {
        Fail "lite payload must not carry a database, found $($dataFiles.Count) file(s) under $dataDir"
    }
    $unexpected = @()
    foreach ($child in @(Get-ChildItem -LiteralPath $assetsDir -Directory -Force -ErrorAction SilentlyContinue)) {
        if ($child.Name -notin @("ui", "effects", "fonts")) { $unexpected += $child.Name }
    }
    if ($unexpected.Count -gt 0) {
        Fail "lite payload must only contain ui / effects / fonts, also found: $($unexpected -join ', ')"
    }
    $assetCount = (Get-Files $assetsDir).Count
    Write-Host ("       payload ok (lite): " + $assetCount + " asset files (ui/effects/fonts), no database, effects: " + $effectCount)
    exit 0
}

# ---------------------------------------------------------------- package stage

if (-not (Test-Path -LiteralPath $ResourcesDir)) {
    Fail "packaged resources were not found: $ResourcesDir"
}

$packagedAssets = Join-Path $ResourcesDir "assets"
$packagedData = Join-Path $ResourcesDir "data"
if (-not (Test-Path -LiteralPath $packagedAssets)) {
    Fail "assets were not packaged: $packagedAssets"
}

foreach ($name in $RequiredUiFiles) {
    $file = Join-Path $packagedAssets "ui\$name"
    if (-not (Test-Path -LiteralPath $file)) {
        Fail "required asset missing from the package: ui\$name"
    }
}
$fontFile = Join-Path $packagedAssets "fonts\ChineseFont.ttf"
if (-not (Test-Path -LiteralPath $fontFile)) {
    Fail "required asset missing from the package: fonts\ChineseFont.ttf"
}
$effectCount = Assert-DirNotEmpty (Join-Path $packagedAssets "effects") "packaged effects folder"

# 1. every asset file the payload promised is in the package
$payloadAssets = Join-Path $PayloadDir "assets"
if (-not (Test-Path -LiteralPath $payloadAssets)) {
    Fail "payload assets are missing, run scripts\pack-assets.mjs first: $payloadAssets"
}
$payloadTable = Get-RelativeFileTable $payloadAssets
$packagedTable = Get-RelativeFileTable $packagedAssets
$lost = @()
foreach ($relative in $payloadTable.Keys) {
    if (-not $packagedTable.ContainsKey($relative)) { $lost += $relative }
}
if ($lost.Count -gt 0) {
    $sample = ($lost | Select-Object -First 5) -join ", "
    Fail ("packaged assets are incomplete: " + $lost.Count + " of " + $payloadTable.Count + " files from the payload were not packaged (e.g. " + $sample + ")")
}

# 2. every data file the payload promised is in the package
$payloadData = Join-Path $PayloadDir "data"
$payloadDataFiles = Get-Files $payloadData
foreach ($file in $payloadDataFiles) {
    $target = Join-Path $packagedData $file.Name
    if (-not (Test-Path -LiteralPath $target)) {
        Fail "packaged data is incomplete, missing under ${packagedData}: $($file.Name)"
    }
}

$packagedFiles = Get-Files $packagedAssets
$characters = @(Get-ChildItem -LiteralPath (Join-Path $packagedAssets "characters") -Directory -Force -ErrorAction SilentlyContinue)
$clips = @(Get-ChildItem -LiteralPath (Join-Path $packagedAssets "animation-clips") -Directory -Force -ErrorAction SilentlyContinue)

if ($Profile -eq "full") {
    Write-Host ("       assets ok (full): " + $packagedFiles.Count + " files packaged (" + $payloadTable.Count + " in the payload), characters: " + $characters.Count + ", animation clips: " + $clips.Count + ", effects: " + $effectCount + ", fonts: ok")
    Write-Host ("       data ok (full): " + $payloadDataFiles.Count + " files packaged")
    exit 0
}

# lite: the variant exists precisely because it does NOT carry the optional assets, so a leftover
# folder (for example because win-unpacked was not cleared between the two builds) has to fail the
# build - otherwise the "small" installer silently weighs 800 MB.
$leaked = @()
foreach ($name in $OptionalAssetDirs) {
    $dir = Join-Path $packagedAssets $name
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $count = (Get-Files $dir).Count
    if ($count -gt 0) { $leaked += "$name ($count files)" }
}
if ($leaked.Count -gt 0) {
    Fail ("lite package must not carry optional assets, found: " + ($leaked -join ", "))
}
$packagedDataFiles = Get-Files $packagedData
if ($packagedDataFiles.Count -gt 0) {
    Fail ("lite package must not carry resources\data, found " + $packagedDataFiles.Count + " file(s) under " + $packagedData)
}

Write-Host ("       assets ok (lite): " + $packagedFiles.Count + " files packaged (ui/effects/fonts only), effects: " + $effectCount + ", fonts: ok, no optional assets, no database")
exit 0
