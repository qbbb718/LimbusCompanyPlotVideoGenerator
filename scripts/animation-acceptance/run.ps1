<#
.SYNOPSIS
    Portrait animation frame-capture acceptance: backend export vs real browser preview (S3).

.DESCRIPTION
    Three steps: export the encoded video's frames + geometry manifest (Java) ->
    compile the REAL frontend modules to CommonJS (tsc) -> render them in an offscreen
    Electron window, screenshot, and compare intensity-weighted centroids.

    Pass criteria (asserted in capture.js):
      * per frame: backend centroid vs preview centroid within 2px (base layout agrees);
      * frame 9 vs frame 0: displacement differs by <= 1px (animation amount + anchor agree).

    Evidence stays in demo/target/animation-acceptance/ (backend/frame-*.png + preview-frame-*.png).

    NOTE: this file is ASCII-only on purpose -- Windows PowerShell 5.1 reads BOM-less
    scripts as ANSI, which would garble any Chinese text in here.

.EXAMPLE
    powershell -NoProfile -File scripts\animation-acceptance\run.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$fe = Join-Path $root "demo\frontend\electron-react-app"
$acceptDir = Join-Path $root "demo\target\animation-acceptance"
$tsDir = Join-Path $acceptDir "ts"
$electron = Join-Path $fe "node_modules\electron\dist\electron.exe"
$tsc = Join-Path $fe "node_modules\.bin\tsc.cmd"

if (-not (Test-Path $electron)) {
    throw "Electron not found: $electron (run npm install first)"
}
if (-not (Test-Path $tsc)) {
    throw "tsc not found: $tsc (run npm install first)"
}

Write-Host "[1/3] Exporting backend frames + manifest..." -ForegroundColor Cyan
Push-Location $root
try {
    # Quote the -D arguments: PowerShell splits "-Dlbc.acceptance=true" at the dot otherwise
    & mvn -f demo/pom.xml test "-Dtest=AnimationFrameAcceptanceExport" "-Dlbc.acceptance=true"
    if ($LASTEXITCODE -ne 0) { throw "backend export failed (mvn exit code $LASTEXITCODE)" }
} finally {
    Pop-Location
}

Write-Host "[2/3] Compiling frontend evaluator + DOM transform (same sources as the editor)..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $tsDir -ErrorAction SilentlyContinue
& $tsc `
    --outDir $tsDir `
    --rootDir (Join-Path $fe "src\features\record") `
    --module commonjs --target es2020 --moduleResolution node `
    --skipLibCheck --esModuleInterop `
    (Join-Path $fe "src\features\record\preview\domTransform.ts") `
    (Join-Path $fe "src\features\record\animation\spriteAnimator.ts")
if ($LASTEXITCODE -ne 0) { throw "tsc failed (exit code $LASTEXITCODE)" }

Write-Host "[3/3] Offscreen screenshot + comparison..." -ForegroundColor Cyan
& $electron (Join-Path $PSScriptRoot "capture.js")
$code = $LASTEXITCODE
if ($code -ne 0) { throw "frame acceptance FAILED (exit=$code)" }
Write-Host "Frame acceptance PASSED." -ForegroundColor Green
