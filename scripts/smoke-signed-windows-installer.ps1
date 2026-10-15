param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$PublisherName,
  [switch]$Unsigned,
  [string]$ExecutableName = 'Godot Codely.exe',
  [string]$UserDataName = 'godot-codely'
)

$ErrorActionPreference = 'Stop'
# Installation changes shortcuts and registration even with a custom /D path.
# Run only on disposable GitHub-hosted Windows runners, never a developer PC.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Installer smoke requires a disposable GitHub-hosted runner.'
}
if (-not $Unsigned -and [string]::IsNullOrWhiteSpace($PublisherName)) {
  throw 'Signed installer smoke requires PublisherName.'
}
$installer = (Resolve-Path $Installer).Path
$root = Join-Path $env:RUNNER_TEMP ('dsh-signed-smoke-' + [guid]::NewGuid().ToString('N'))
$env:APPDATA = Join-Path $root 'appdata'
$env:LOCALAPPDATA = Join-Path $root 'localappdata'
New-Item -ItemType Directory -Path $env:APPDATA, $env:LOCALAPPDATA -Force | Out-Null

function Assert-Signature([string]$path, [bool]$requirePublisher = $false) {
  if ($Unsigned) { return }
  $signature = Get-AuthenticodeSignature -FilePath $path
  if ($signature.Status -ne 'Valid') { throw "Invalid signature on ${path}: $($signature.Status)" }
  if ($requirePublisher) {
    $signerName = $signature.SignerCertificate.GetNameInfo(
      [System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    if (-not [string]::Equals($signerName, $PublisherName, [System.StringComparison]::Ordinal)) {
      throw "Unexpected signer on ${path}: $($signature.SignerCertificate.Subject)"
    }
  }
}

function Invoke-Installer([string]$directory, [string]$stage) {
  Write-Host "$stage at $directory"
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$directory") -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddMinutes(5)
  while (-not $process.HasExited) {
    if ((Get-Date) -ge $deadline) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      throw "$stage did not exit within five minutes."
    }
    $parent = Split-Path $directory -Parent
    $leaf = Split-Path $directory -Leaf
    $siblings = @(Get-ChildItem -LiteralPath $parent -Directory -Filter "$leaf.*-*" -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty Name)
    Write-Host "$stage running; directory exists=$(Test-Path $directory); siblings=$($siblings -join ', ')"
    Start-Sleep -Seconds 15
  }
  Write-Host "$stage exited with $($process.ExitCode)"
  return $process.ExitCode
}

function Install-At([string]$directory) {
  # NSIS requires /D to be the last argument. Each target is a fresh directory
  # on the runner's local volume, so this also exercises custom directory input.
  $exitCode = Invoke-Installer $directory 'Install'
  if ($exitCode -ne 0) { throw "Installer exited with $exitCode at $directory" }
  $executable = Join-Path $directory $ExecutableName
  if (-not (Test-Path $executable)) { throw "Installed executable missing: $executable" }
  Assert-Signature $executable $true
  return $executable
}

function Assert-InstalledPeSignatures([string]$directory) {
  if ($Unsigned) { return }
  $count = 0
  foreach ($file in Get-ChildItem -LiteralPath $directory -File -Recurse -Force) {
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
      if ($stream.Length -lt 2 -or $stream.ReadByte() -ne 0x4d -or $stream.ReadByte() -ne 0x5a) { continue }
    } finally {
      $stream.Dispose()
    }
    Assert-Signature $file.FullName
    $count++
  }
  if ($count -lt 2) { throw "Only $count signed PE files found under $directory" }
  Write-Host "Verified $count installed PE signatures."
}

function Get-HarnessLogPaths {
  @($env:APPDATA, [Environment]::GetFolderPath('ApplicationData')) |
    Where-Object { $_ } |
    Select-Object -Unique |
    ForEach-Object { Join-Path $_ "$UserDataName\logs\harness.log" }
}

function Assert-OfficeRuntime([string]$executable) {
  $resources = Join-Path (Split-Path $executable) 'resources'
  & node (Join-Path $PSScriptRoot 'verify-office-runtime.cjs') $resources $executable
  if ($LASTEXITCODE -ne 0) { throw 'Installed Office runtime validation failed.' }
}

function Assert-Starts([string]$executable) {
  $logPaths = @(Get-HarnessLogPaths)
  $launchTime = (Get-Date).ToUniversalTime().AddSeconds(-2)
  $desktop = Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) `
    -ArgumentList @('--remote-debugging-port=49329', '--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
  try {
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      if ($desktop.HasExited) { throw "Installed app exited early: $($desktop.ExitCode)" }
      foreach ($logPath in $logPaths) {
        if (Test-Path $logPath) {
          $logFile = Get-Item -LiteralPath $logPath
          if ($logFile.LastWriteTimeUtc -lt $launchTime) { continue }
          $log = Get-Content -LiteralPath $logPath -Raw
          # The log is append-only across launches; the first token belongs to a stopped server.
          $urlMatches = [regex]::Matches($log, 'dsh web: (http://127\.0\.0\.1:\d+/\?token=[^\s]+)')
          if ($urlMatches.Count -gt 0) {
            $match = $urlMatches[$urlMatches.Count - 1]
            $response = $null
            try {
              $response = Invoke-WebRequest -UseBasicParsing -Uri $match.Groups[1].Value -TimeoutSec 3
            } catch { Start-Sleep -Milliseconds 500 }
            if ($response -and $response.StatusCode -eq 200) {
              $script:activeAppDataRoot = Split-Path (Split-Path (Split-Path $logPath -Parent) -Parent) -Parent
              $harnessHome = Join-Path $script:activeAppDataRoot "$UserDataName\harness"
              & node (Join-Path $PSScriptRoot 'verify-installed-ui.mjs') 'http://127.0.0.1:49329' (Join-Path $root 'installed-ui.png') $harnessHome
              if ($LASTEXITCODE -ne 0) { throw 'Installed client UI did not mount.' }
              return
            }
          }
        }
      }
      Start-Sleep -Milliseconds 500
    }
    throw 'Installed Harness did not serve authenticated HTML within three minutes.'
  } finally {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($desktop.Id)" |
      ForEach-Object { $_.ProcessId })
    if (-not $desktop.HasExited) { Stop-Process -Id $desktop.Id -Force }
    foreach ($childId in $children) {
      Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
    }
    foreach ($logPath in $logPaths) {
      if (Test-Path $logPath) {
        Write-Host "Harness log found at $logPath"
        Get-Content -LiteralPath $logPath -Tail 50 |
          ForEach-Object { $_ -replace 'token=[^\s]+', 'token=[redacted]' }
      } else {
        Write-Host "No Harness log at $logPath"
      }
    }
  }
}

Assert-Signature $installer $true
$firstDirectory = Join-Path $root 'install-one'
$secondDirectory = Join-Path $root 'install-two'

$firstExecutable = Install-At $firstDirectory
Assert-InstalledPeSignatures $firstDirectory
Assert-OfficeRuntime $firstExecutable
Assert-Starts $firstExecutable

$profileMarker = Join-Path $script:activeAppDataRoot "$UserDataName\harness\signed-smoke-marker"
New-Item -ItemType Directory -Path (Split-Path $profileMarker) -Force | Out-Null
Set-Content -LiteralPath $profileMarker -Value 'keep-user-data'

# Holding the executable without FILE_SHARE_DELETE must make promotion fail.
# The old installation and user data must remain available afterward.
$lock = [System.IO.File]::Open($firstExecutable, 'Open', 'Read', 'Read')
try {
  $blockedExitCode = Invoke-Installer $firstDirectory 'Locked upgrade'
  if ($blockedExitCode -eq 0) { throw 'Locked same-path upgrade reported success.' }
  if (-not (Test-Path $firstExecutable)) { throw 'Locked upgrade removed the previous application.' }
  Assert-Signature $firstExecutable $true
  if (@(Get-ChildItem -Path "$firstDirectory.new-*" -ErrorAction SilentlyContinue).Count -ne 0) {
    throw 'Locked upgrade left a staging directory.'
  }
} finally {
  $lock.Dispose()
}
Assert-Starts $firstExecutable

$firstExecutable = Install-At $firstDirectory
if ((Get-Content -LiteralPath $profileMarker -Raw).Trim() -ne 'keep-user-data') {
  throw 'Same-path upgrade removed user profile data.'
}
if (@(Get-ChildItem -Path "$firstDirectory.old-*" -ErrorAction SilentlyContinue).Count -ne 0) {
  throw 'Successful upgrade left an old application backup directory.'
}
Assert-Starts $firstExecutable

$secondExecutable = Install-At $secondDirectory
if (-not (Test-Path $firstExecutable)) { throw 'Custom-directory install removed the previous installation.' }
Assert-Signature $firstExecutable $true
Assert-InstalledPeSignatures $secondDirectory
Assert-OfficeRuntime $secondExecutable
Assert-Starts $secondExecutable
Write-Host 'Installer passed first install, locked upgrade rollback, same-path upgrade, custom directory and client UI checks.'
if (-not $Unsigned) { Write-Host 'Installed PE signature checks passed.' }
