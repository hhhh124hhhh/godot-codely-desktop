param([Parameter(Mandatory = $true)][string]$MakeNsis)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$root = Join-Path ([IO.Path]::GetTempPath()) ('codely-permission-probe-' + [guid]::NewGuid().ToString('N'))
$denied = Join-Path $root 'protected-parent'
New-Item -ItemType Directory -Path $denied -Force | Out-Null
try {
  $source = @'
Unicode true
SilentInstall silent
RequestExecutionLevel user
OutFile "@ROOT@\probe.exe"
InstallDir "@ROOT@\protected-parent\Godot Codely"
!include "@REPO@\build\installer-directories.nsh"
!define DSH_SEVENZIP_PATH "@ROOT@\fixture.txt"
!define DSH_SEVENZIP_LICENSE_DIR "@ROOT@"
!macro installApplicationFiles
  File /oname=payload.txt "@ROOT@\fixture.txt"
!macroend
Section
  InitPluginsDir
  !insertmacro dshStageApplication
  SetErrorLevel 99
SectionEnd
'@
  $source = $source.Replace('@ROOT@', $root).Replace('@REPO@', $repo)
  Set-Content -LiteralPath (Join-Path $root 'probe.nsi') -Value $source -Encoding UTF8
  foreach ($name in @('fixture.txt', 'LICENSE.txt', 'COPYING')) {
    Set-Content -LiteralPath (Join-Path $root $name) -Value 'fixture'
  }
  & $MakeNsis /V2 (Join-Path $root 'probe.nsi')
  if ($LASTEXITCODE -ne 0) { throw 'NSIS probe compilation failed.' }
  $directoryNames = @('Godot Codely', 'NoSpaces')
  foreach ($name in $directoryNames) {
    $target = Join-Path $denied $name
    New-Item -ItemType Directory -Path $target | Out-Null
    Set-Content -LiteralPath (Join-Path $target 'previous-install.txt') -Value 'keep-old-install'
  }
  # Only this disposable parent loses write access. The owner retains the
  # ability to restore its DACL in finally; no system directory ACL is changed.
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
  & icacls.exe $denied /inheritance:r /grant:r "*$($identity.Value):(OI)(CI)(RX)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the disposable permission fixture.' }
  # Hosted runners are elevated and can retain an explicit Administrators grant.
  # Deny creation for this SID as well, so the fixture fails for either token.
  & icacls.exe $denied /deny "*$($identity.Value):(OI)(CI)(WD,AD)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not deny writes in the disposable permission fixture.' }
  foreach ($name in $directoryNames) {
    $target = Join-Path $denied $name
    $process = Start-Process -FilePath (Join-Path $root 'probe.exe') -ArgumentList "/D=$target" -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(15000)) { $process.Kill(); throw 'Permission probe timed out.' }
    if ($process.ExitCode -ne 2) { throw "Expected permission failure exit 2; got $($process.ExitCode)." }
    $logPath = Join-Path ([IO.Path]::GetTempPath()) 'godot-codely-installer-directories.log'
    $log = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Raw } else { '' }
    $failureLines = @($log -split '\r?\n' | Where-Object { $_.Contains($target+'.new-') -and $_.Contains('stage: create-directory failed, error 5,') })
    if ($failureLines.Count -ne 1) { throw 'Installer exited 2 without recording the protected target and Windows error 5: original silent failure reproduced.' }
    if ((Get-Content -LiteralPath (Join-Path $target 'previous-install.txt') -Raw).Trim() -ne 'keep-old-install') { throw 'Permission failure changed the old installation.' }
    Write-Output "PASS: inaccessible staging parent ($name) reports error 5 and preserves the old installation"
  }
  if (@(Get-ChildItem -LiteralPath $denied -Directory | Where-Object Name -Match '\.(new|old)-').Count) { throw 'Permission failure left a transaction directory.' }
} finally {
  # The fixture began with only inherited rules; restore those before removal.
  & icacls.exe $denied /reset | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restore the disposable permission fixture.' }
  $resolved = [IO.Path]::GetFullPath($root)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
