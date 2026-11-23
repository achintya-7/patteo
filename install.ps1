# patteo installer for Windows (PowerShell 5.1+).
#
#   irm https://raw.githubusercontent.com/achintya-7/patteo/main/install.ps1 | iex
#
# Settings come from parameters, or from environment variables so the one-liner above can use them:
#   -Version <x.y.z>   / $env:PATTEO_VERSION      default: latest
#   -InstallDir <path> / $env:PATTEO_INSTALL_DIR  default: %LOCALAPPDATA%\patteo\bin
#   -Uninstall         / $env:PATTEO_UNINSTALL=1  remove the binary and its PATH entry
#   $env:PATTEO_BASE_URL overrides where releases are downloaded from.
#
# The download is checked against the release's checksums.txt before anything is installed.

[CmdletBinding()]
param(
  [string]$Version = $env:PATTEO_VERSION,
  [string]$InstallDir = $env:PATTEO_INSTALL_DIR,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is far faster without the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$Repo = 'achintya-7/patteo'
$BaseUrl = if ($env:PATTEO_BASE_URL) { $env:PATTEO_BASE_URL } else { "https://github.com/$Repo/releases" }
if (-not $Version) { $Version = 'latest' }
if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'patteo\bin' }
if ($env:PATTEO_UNINSTALL -eq '1') { $Uninstall = $true }
$Target = Join-Path $InstallDir 'patteo.exe'

function Fail($message) { throw "patteo install: $message" }

function Remove-FromUserPath($dir) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $current) { return }
  $kept = ($current -split ';') | Where-Object { $_ -and ($_.TrimEnd('\') -ne $dir.TrimEnd('\')) }
  [Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User')
}

if ($Uninstall) {
  if (Test-Path $Target) { Remove-Item -Force $Target; Write-Host "Removed $Target" } else { Write-Host "Nothing to remove at $Target" }
  Remove-FromUserPath $InstallDir
  Write-Host 'Settings stay in %USERPROFILE%\.config\patteo; delete that folder to remove them too.'
  return
}

# Only x64 is published; Windows on Arm runs it through emulation.
$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
if ($arch -notin @('AMD64', 'ARM64')) { Fail "unsupported CPU architecture: $arch" }

$asset = 'patteo-windows-x64.zip'
$urlBase = if ($Version -eq 'latest') { "$BaseUrl/latest/download" } else { "$BaseUrl/download/v$($Version.TrimStart('v'))" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("patteo-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Installing patteo ($Version) for windows-x64"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$urlBase/$asset" -OutFile (Join-Path $tmp $asset)
    Invoke-WebRequest -UseBasicParsing -Uri "$urlBase/checksums.txt" -OutFile (Join-Path $tmp 'checksums.txt')
  } catch {
    Fail "download failed from $urlBase ($($_.Exception.Message))"
  }

  $line = Get-Content (Join-Path $tmp 'checksums.txt') | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
  if (-not $line) { Fail "$asset is not listed in checksums.txt" }
  $want = ($line -split '\s+')[0].ToLowerInvariant()
  $got = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $asset)).Hash.ToLowerInvariant()
  if ($want -ne $got) { Fail "checksum mismatch for $asset (expected $want, got $got); nothing was installed" }

  $unpacked = Join-Path $tmp 'unpacked'   # a fresh directory: Expand-Archive differs on existing ones across versions
  Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath $unpacked
  $exe = Join-Path $unpacked 'patteo.exe'
  if (-not (Test-Path $exe)) { Fail "$asset did not contain patteo.exe" }

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  # A running copy can't be overwritten on Windows; write beside it and swap.
  $staged = "$Target.new"
  Copy-Item -Force $exe $staged
  Move-Item -Force $staged $Target
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

$installed = & $Target --version 2>$null
if (-not $installed) { Fail "installed $Target but it does not run on this machine" }
Write-Host "Installed $installed to $Target"

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$onPath = ($userPath -split ';') | Where-Object { $_.TrimEnd('\') -eq $InstallDir.TrimEnd('\') }
if (-not $onPath) {
  [Environment]::SetEnvironmentVariable('Path', (($userPath, $InstallDir | Where-Object { $_ }) -join ';'), 'User')
  $env:Path = "$env:Path;$InstallDir"
  Write-Host "Added $InstallDir to your user PATH (open a new terminal for other windows to see it)."
}
Write-Host ''
Write-Host 'Run: patteo   (it connects to your local Paseo daemon automatically)'
