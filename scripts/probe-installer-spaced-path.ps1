param(
  [Parameter(Mandatory = $true)][string]$MakeNsis,
  [Parameter(Mandatory = $true)][string]$SevenZip
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$root = Join-Path ([IO.Path]::GetTempPath()) ('codely-path-probe-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
  # Exercise the production transaction without application registration,
  # shortcuts, elevation, or access to an existing installation/Profile.
  $source = @'
Unicode true
SilentInstall silent
RequestExecutionLevel user
OutFile "@ROOT@\probe.exe"
!include "@REPO@\build\installer-directories.nsh"
!macro installApplicationFiles
  File /oname=$PLUGINSDIR\payload.7z "@ROOT@\payload.7z"
  !insertmacro dshExtractPayload "$PLUGINSDIR\payload.7z"
!macroend
!define DSH_SEVENZIP_PATH "@SEVENZIP@"
!define DSH_SEVENZIP_LICENSE_DIR "@ROOT@"
Section
  InitPluginsDir
  StrCpy $INSTDIR "@ROOT@\Program Files\Godot Codely"
  !insertmacro dshStageApplication
  Call dshPromoteDirectories
  IfErrors 0 +3
    SetErrorLevel 2
    Quit
  !insertmacro dshFinishDirectories
SectionEnd
'@
  $source = $source.Replace('@ROOT@', $root).Replace('@REPO@', $repo).Replace('@SEVENZIP@', (Resolve-Path $SevenZip).Path)
  Set-Content -LiteralPath (Join-Path $root 'probe.nsi') -Value $source -Encoding UTF8
  foreach ($name in @('payload.txt', 'LICENSE.txt', 'COPYING')) {
    Set-Content -LiteralPath (Join-Path $root $name) -Value 'new-payload'
  }
  & $SevenZip a (Join-Path $root 'payload.7z') (Join-Path $root 'payload.txt') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Probe archive creation failed.' }
  & $MakeNsis /V2 (Join-Path $root 'probe.nsi')
  if ($LASTEXITCODE -ne 0) { throw 'NSIS probe compilation failed.' }
  $target = Join-Path $root 'Program Files\Godot Codely'
  $payload = Join-Path $target 'payload.txt'
  function Invoke-Probe([int]$expected) {
    $process = Start-Process -FilePath (Join-Path $root 'probe.exe') -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(120000)) { $process.Kill(); throw 'Probe timed out.' }
    if ($process.ExitCode -ne $expected) { throw "Expected $expected; got $($process.ExitCode)." }
    $leftovers = @(Get-ChildItem -LiteralPath (Split-Path $target) -Directory | Where-Object Name -Match '\.(new|old)-')
    if ($leftovers.Count -ne 0) { throw 'Transaction left staging or backup directories.' }
  }
  Invoke-Probe 0
  if ((Get-Content -LiteralPath $payload -Raw).Trim() -ne 'new-payload') { throw 'Fresh payload missing.' }
  Write-Output 'PASS: fresh install at a path containing spaces'
  Set-Content -LiteralPath $payload -Value 'old-payload'
  $lock = [IO.File]::Open($payload, 'Open', 'Read', 'Read')
  try { Invoke-Probe 2 } finally { $lock.Dispose() }
  if ((Get-Content -LiteralPath $payload -Raw).Trim() -ne 'old-payload') { throw 'Rollback lost the old payload.' }
  Write-Output 'PASS: locked upgrade preserves old payload and cleans staging'
  Invoke-Probe 0
  if ((Get-Content -LiteralPath $payload -Raw).Trim() -ne 'new-payload') { throw 'Upgrade did not replace old payload.' }
  Write-Output 'PASS: upgrade succeeds after unlocking'
} finally {
  $resolved = [IO.Path]::GetFullPath($root)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
