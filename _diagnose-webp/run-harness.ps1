param(
  [Parameter(Mandatory=$true)][string]$Tag,
  [Parameter(Mandatory=$true)][string]$Root,
  [string]$NativeJars = "",
  [string]$JavaExe = "C:\Program Files\Java\jdk-21\bin\java.exe"
)

$ErrorActionPreference = 'Stop'
$base     = "E:\LimbusCompanyPlotVideoGenerator\_diagnose-webp"
$classes  = Join-Path $base "flat\BOOT-INF\classes"
$libDir   = Join-Path $base "flat\BOOT-INF\lib"
$home2    = Join-Path $base "userhome2\limbus-company-plot-video-generator"

# ---- data root: reuse the already-seeded sandbox (has assets + the webp portrait)
$dataRoot = Join-Path $base "userhome2\limbus-company-plot-video-generator"
$webp = Join-Path $dataRoot "assets\characters\char_diag\portrait_diag.webp"
if (-not (Test-Path $webp)) { throw "missing seeded webp: $webp" }

# ---- classpath: app classes + every lib jar, except platform native jars when overridden
$jars = Get-ChildItem $libDir -Filter *.jar | ForEach-Object { $_.FullName }
if ($NativeJars -ne "") {
  $allow = $NativeJars.Split(';') | Where-Object { $_ -ne "" }
  $jars = $jars | Where-Object { $n = Split-Path $_ -Leaf; -not ($n -like '*windows-x86_64*') -or ($allow -contains $n) }
}
$cp = ($classes + ";" + ($jars -join ";"))

$out = Join-Path $base "$Tag.log"
if (Test-Path $out) { Remove-Item $out -Force }

Write-Host "[$Tag] java     : $JavaExe"
Write-Host "[$Tag] dataRoot : $dataRoot"
Write-Host "[$Tag] natives  : $(($jars | Where-Object { $_ -like '*windows-x86_64*' } | ForEach-Object { Split-Path $_ -Leaf }) -join ', ')"
Write-Host "[$Tag] log      : $out"

$args = @("-Duser.home=$Root", "-Dlbc.data.dir=$dataRoot", "-cp", $cp, "com.lbc_plot.MainApplication")
$p = Start-Process -FilePath $JavaExe -ArgumentList $args -RedirectStandardOutput $out -RedirectStandardError "$out.err" -PassThru -WindowStyle Hidden
Write-Host "[$Tag] pid      : $($p.Id)"

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  if ($p.HasExited) { Write-Host "[$Tag] process exited early (code $($p.ExitCode))"; break }
  try { $null = Invoke-WebRequest "http://127.0.0.1:8081/api/health" -UseBasicParsing -TimeoutSec 3; $ready = $true; break } catch {}
}
Write-Host "[$Tag] ready    : $ready"

if ($ready) {
  $body = '{"characterID":"char_diag","characterName":"DIAG","faction":"无阵营","portraits":[{"portraitID":"p_diag","characterID":"char_diag","imagePath":"char_diag/portrait_diag.webp","portName":"diag","emotionName":"NORMAL"}]}'
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:8081/api/characters" -Method POST -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing -TimeoutSec 120
    Write-Host "[$Tag] POST     : $($r.StatusCode)"
  } catch { Write-Host "[$Tag] POST err : $($_.Exception.Message)" }
  Start-Sleep -Seconds 2
  try {
    $l = Invoke-WebRequest "http://127.0.0.1:8081/api/characters" -UseBasicParsing -TimeoutSec 120
    Write-Host "[$Tag] GET      : $($l.StatusCode) len=$($l.Content.Length)"
  } catch { Write-Host "[$Tag] GET err  : $($_.Exception.Message)" }
  Start-Sleep -Seconds 3
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "================ [$Tag] decoder evidence ================"
foreach ($f in @($out, "$out.err")) {
  if (Test-Path $f) {
    Select-String -Path $f -Pattern 'WebpImageDecoder|构建 Portrait|无法加载图像|bytedeco|UnsatisfiedLink|URISyntax|已用 FFmpeg 解码' |
      Select-Object -First 15 | ForEach-Object { Write-Host ("  " + $_.Line) }
  }
}
