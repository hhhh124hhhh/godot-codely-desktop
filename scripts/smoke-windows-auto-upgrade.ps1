param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$SeedVersion
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Automatic installer acceptance requires a disposable GitHub-hosted Windows runner.'
}
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$root = Join-Path $env:RUNNER_TEMP ('auto-upgrade-' + [guid]::NewGuid().ToString('N'))
$evidence = Join-Path $root 'evidence'
$install = Join-Path $root 'installed'
$nativeAppData = [Environment]::GetFolderPath('ApplicationData')
$nativeLocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
$env:APPDATA = Join-Path $root 'appdata'
$env:LOCALAPPDATA = Join-Path $root 'localappdata'
$env:USERPROFILE = Join-Path $root 'fixture-user'
$env:HOME = $env:USERPROFILE
$env:GODOT_CODELY_BRIDGE_PORT = '0'
$env:GODOT_CODELY_MEMORY_DIR = Join-Path $root 'memories'
New-Item -ItemType Directory -Path $evidence, $env:APPDATA, $env:LOCALAPPDATA, $env:USERPROFILE -Force | Out-Null
$setup = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$install") -WindowStyle Hidden -PassThru
if (-not $setup.WaitForExit(300000) -or $setup.ExitCode -ne 0) { throw 'Fixture initial installation failed.' }
$executable = Join-Path $install 'Godot Codely.exe'
$archive = Join-Path $install 'resources\app.asar'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed production executable is missing.' }
$debugEndpoint = 'http://127.0.0.1:49339'
$script:launchCount = 0
function Start-Desktop {
  $script:launchCount++
  return Start-Process -FilePath $executable -WorkingDirectory $install -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $root "stdout-$script:launchCount.log") `
    -RedirectStandardError (Join-Path $root "stderr-$script:launchCount.log") `
    -ArgumentList @('--remote-debugging-address=127.0.0.1', '--remote-debugging-port=49339', '--inspect=127.0.0.1:49338')
}
function Stop-OwnedDesktop([int]$processId) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $processId" | Select-Object -ExpandProperty ProcessId)
  foreach ($childId in $children) { Stop-OwnedDesktop $childId }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}
$desktop = Start-Desktop
try {
  & node (Join-Path $PSScriptRoot 'inspect-installed-main.mjs') 'http://127.0.0.1:49338' |
    Set-Content -LiteralPath (Join-Path $evidence 'official-identity.json')
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect official application identity.' }
  $officialIdentity = Get-Content -LiteralPath (Join-Path $evidence 'official-identity.json') -Raw | ConvertFrom-Json
  if ($officialIdentity.version -ne $Version) { throw 'Installed official application version mismatch.' }
  $harnessHome = Join-Path $officialIdentity.userData 'harness'
  & node (Join-Path $PSScriptRoot 'verify-installed-ui.mjs') $debugEndpoint (Join-Path $evidence 'official-baseline.png')
  if ($LASTEXITCODE -ne 0) { throw 'Unmodified official application did not mount UI.' }
  Stop-OwnedDesktop $desktop.Id
  Start-Sleep -Seconds 2
  & node (Join-Path $PSScriptRoot 'seed-update-version.mjs') $archive $Version $SeedVersion |
    Set-Content -LiteralPath (Join-Path $evidence 'seed.json')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare declared version fixture.' }
  $seed = Get-Content -LiteralPath (Join-Path $evidence 'seed.json') -Raw | ConvertFrom-Json
  $desktop = Start-Desktop
  Start-Sleep -Seconds 3
  if ($desktop.HasExited) { throw "Version-only fixture exited early: $($desktop.ExitCode)" }
  & node (Join-Path $PSScriptRoot 'inspect-installed-main.mjs') 'http://127.0.0.1:49338' |
    Set-Content -LiteralPath (Join-Path $evidence 'fixture-identity.json')
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect fixture application identity.' }
  $fixtureIdentity = Get-Content -LiteralPath (Join-Path $evidence 'fixture-identity.json') -Raw | ConvertFrom-Json
  if ($fixtureIdentity.version -ne $SeedVersion -or $fixtureIdentity.userData -ne $officialIdentity.userData) { throw 'Fixture version or data directory mismatch.' }
  Write-Host "Actual installed fixture: $($fixtureIdentity.version); userData=$($fixtureIdentity.userData)"
  & node (Join-Path $PSScriptRoot 'inspect-installed-main.mjs') 'http://127.0.0.1:49338' check-updates |
    Set-Content -LiteralPath (Join-Path $evidence 'manual-check-identity.json')
  if ($LASTEXITCODE -ne 0) { throw 'Shipped check-for-updates menu command failed.' }
  & node (Join-Path $PSScriptRoot 'verify-auto-upgrade-ui.mjs') download $debugEndpoint $evidence $harnessHome $Version
  if ($LASTEXITCODE -ne 0) { throw 'Actual updater offer/download UI failed.' }

  $updateConfig = Get-Content -LiteralPath (Join-Path $install 'resources\app-update.yml') -Raw
  $cacheMatch = [regex]::Match($updateConfig, '(?m)^updaterCacheDirName:\s*(\S+)')
  if (-not $cacheMatch.Success) { throw 'Packaged update cache declaration is missing.' }
  $cacheName = $cacheMatch.Groups[1].Value.Trim('"', "'")
  $download = $null
  foreach ($base in @($env:LOCALAPPDATA, $nativeLocalAppData) | Select-Object -Unique) {
    $pending = Join-Path (Join-Path $base $cacheName) 'pending'
    if (Test-Path -LiteralPath $pending) { $download = Get-ChildItem -LiteralPath $pending -Filter '*.exe' | Select-Object -First 1 }
    if ($download) { break }
  }
  if (-not $download) { throw 'Updater did not retain a downloaded installer.' }
  $downloadHash = (Get-FileHash -LiteralPath $download.FullName -Algorithm SHA256).Hash
  $releaseHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
  if ($downloadHash -ne $releaseHash) { throw 'Updater download differs from verified published installer.' }
  & node (Join-Path $PSScriptRoot 'verify-auto-upgrade-ui.mjs') install $debugEndpoint $evidence $harnessHome $Version
  if ($LASTEXITCODE -ne 0) { throw 'Actual restart/update button failed.' }

  # Assisted NSIS may expose Next/Finish. Invoke only buttons owned by its exact downloaded executable.
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $deadline = (Get-Date).AddMinutes(5)
  $restart = $null
  $installerSeen = $false
  $installerPids = [System.Collections.Generic.HashSet[int]]::new()
  $lastInstallState = ''
  while ((Get-Date) -lt $deadline) {
    $processes = @(Get-CimInstance Win32_Process)
    foreach ($process in $processes) {
      if ($process.ExecutablePath -eq $download.FullName) { [void]$installerPids.Add([int]$process.ProcessId) }
    }
    # NSIS transfers its wizard to a temporary child executable. Keep the exact
    # downloaded installer's descendants as the ownership boundary.
    do {
      $added = $false
      foreach ($process in $processes) {
        if ($installerPids.Contains([int]$process.ParentProcessId) -and $installerPids.Add([int]$process.ProcessId)) { $added = $true }
      }
    } while ($added)
    foreach ($process in $processes | Where-Object { $installerPids.Contains([int]$_.ProcessId) }) {
      $installerSeen = $true
      $nativeProcess = Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
      if ($nativeProcess.MainWindowHandle -ne [IntPtr]::Zero) {
        $element = [System.Windows.Automation.AutomationElement]::FromHandle($nativeProcess.MainWindowHandle)
        $buttons = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,
          (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
        foreach ($button in $buttons) {
          Write-Host "Owned installer button: $($button.Current.Name); enabled=$($button.Current.IsEnabled)"
          if ($button.Current.IsEnabled -and $button.Current.Name -match '^(Next|Install|Finish|下一步|安装|完成|确定)') {
            $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            $pattern.Invoke()
          }
        }
      }
    }
    $installState = @($processes | Where-Object { $installerPids.Contains([int]$_.ProcessId) -or $_.ExecutablePath -eq $executable } | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine) | ConvertTo-Json -Depth 3
    if ($installState -ne $lastInstallState) {
      $installState | Add-Content -LiteralPath (Join-Path $evidence 'installation-processes.jsonl')
      $lastInstallState = $installState
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash -eq $seed.shippedAsarSha256) {
      $restart = $processes | Where-Object { $_.ExecutablePath -eq $executable -and $_.ProcessId -ne $desktop.Id -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
      if ($restart) { break }
    }
    Start-Sleep -Seconds 1
  }
  if (-not $restart) { throw 'Official ASAR replacement and automatic application restart were not observed.' }
  $afterHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if ($afterHash -ne $seed.shippedAsarSha256) { throw 'Updater did not restore the original official package.' }
  # The installer relaunch omits CDP switches. Observe it, then reopen solely for UI/data inspection.
  Stop-OwnedDesktop $restart.ProcessId
  Start-Sleep -Seconds 2
  $desktop = Start-Desktop
  & node (Join-Path $PSScriptRoot 'inspect-installed-main.mjs') 'http://127.0.0.1:49338' |
    Set-Content -LiteralPath (Join-Path $evidence 'upgraded-identity.json')
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect updated application identity.' }
  $upgradedIdentity = Get-Content -LiteralPath (Join-Path $evidence 'upgraded-identity.json') -Raw | ConvertFrom-Json
  if ($upgradedIdentity.version -ne $Version -or $upgradedIdentity.userData -ne $officialIdentity.userData) { throw 'Updated application version or userData mismatch.' }
  & node (Join-Path $PSScriptRoot 'verify-auto-upgrade-ui.mjs') verify $debugEndpoint $evidence $harnessHome $Version
  if ($LASTEXITCODE -ne 0) { throw 'Updated application UI/data recovery failed.' }
  [ordered]@{ passed = $true; targetVersion = $Version; fixtureVersion = $SeedVersion;
    sourceAsarSha256 = $seed.shippedAsarSha256; finalAsarSha256 = $afterHash;
    downloadedInstallerSha256 = $downloadHash; installerObserved = $installerSeen;
    automaticRestartPid = $restart.ProcessId; uiInspectedAfterDebugRelaunch = $true;
    limitation = 'Only manifest version lowered; not an official older release. No human UX or R1 approval.'
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'result.json')
  Write-Host 'Actual packaged update offer, download, NSIS install, automatic restart and data recovery: PASS'
} finally {
  & node (Join-Path $PSScriptRoot 'capture-installed-startup.mjs') $debugEndpoint $evidence final 2>$null
  if ($desktop) { Stop-OwnedDesktop $desktop.Id }
  foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.log') {
    (Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue) |
      ForEach-Object { $_ -replace '([?&]token=)[^\s&]+', '$1[redacted]' } |
      Set-Content -LiteralPath (Join-Path $evidence $file.Name)
  }
  foreach ($base in @($env:APPDATA, $nativeAppData) | Select-Object -Unique) {
    $log = Join-Path $base 'godot-codely\logs\harness.log'
    if (Test-Path -LiteralPath $log) {
      Get-Content -LiteralPath $log -Tail 80 | ForEach-Object { $_ -replace '([?&]token=)[^\s&]+', '$1[redacted]' } |
        Set-Content -LiteralPath (Join-Path $evidence 'harness-tail.log')
    }
  }
}
