[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'This installer is only for the Windows desktop build.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$electronDir = Join-Path $repoRoot 'node_modules\electron'
$packagePath = Join-Path $electronDir 'package.json'
$checksumsPath = Join-Path $electronDir 'checksums.json'
$distPath = Join-Path $electronDir 'dist'
$installingPath = Join-Path $electronDir 'dist.installing'
$pathFile = Join-Path $electronDir 'path.txt'

if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw 'Electron package is missing. Run npm ci first.'
}

$electronPackage = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$version = [string]$electronPackage.version
$artifactName = "electron-v$version-win32-x64.zip"
$checksums = Get-Content -LiteralPath $checksumsPath -Raw | ConvertFrom-Json
$expectedHash = [string]$checksums.$artifactName

if ([string]::IsNullOrWhiteSpace($expectedHash)) {
  throw "No checksum found for $artifactName."
}

$runtimeExe = Join-Path $distPath 'electron.exe'
$runtimeVersion = Join-Path $distPath 'version'
if (
  (Test-Path -LiteralPath $runtimeExe -PathType Leaf) -and
  (Test-Path -LiteralPath $runtimeVersion -PathType Leaf) -and
  ((Get-Content -LiteralPath $runtimeVersion -Raw).Trim().TrimStart('v') -eq $version)
) {
  [IO.File]::WriteAllText($pathFile, 'electron.exe', [Text.UTF8Encoding]::new($false))
  Write-Host "Electron $version is already installed."
  exit 0
}

$cacheRoot = if ([string]::IsNullOrWhiteSpace($env:ELECTRON_CACHE)) {
  Join-Path $repoRoot '.cache\electron'
} else {
  [IO.Path]::GetFullPath($env:ELECTRON_CACHE)
}

[IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
$archivePath = Join-Path $cacheRoot $artifactName
$partialPath = "$archivePath.partial"

function Test-ArchiveHash {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }

  $stream = [IO.File]::OpenRead($Path)
  try {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  $actualHash = ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
  return $actualHash -eq $expectedHash.ToLowerInvariant()
}

if (-not (Test-ArchiveHash -Path $archivePath)) {
  Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue

  $downloadUrl = "https://github.com/electron/electron/releases/download/v$version/$artifactName"
  Write-Host "Downloading official Electron $version for win32-x64..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $partialPath -UseBasicParsing

  if (-not (Test-ArchiveHash -Path $partialPath)) {
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    throw "SHA256 verification failed for $artifactName."
  }

  Move-Item -LiteralPath $partialPath -Destination $archivePath
} else {
  Write-Host "Using verified Electron archive from $archivePath."
}

Remove-Item -LiteralPath $installingPath -Recurse -Force -ErrorAction SilentlyContinue
[IO.Directory]::CreateDirectory($installingPath) | Out-Null

try {
  Expand-Archive -LiteralPath $archivePath -DestinationPath $installingPath -Force

  $installedExe = Join-Path $installingPath 'electron.exe'
  $installedVersionFile = Join-Path $installingPath 'version'
  if (-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
    throw 'The verified Electron archive did not contain electron.exe.'
  }
  if (-not (Test-Path -LiteralPath $installedVersionFile -PathType Leaf)) {
    throw 'The verified Electron archive did not contain a version marker.'
  }

  $installedVersion = (Get-Content -LiteralPath $installedVersionFile -Raw).Trim().TrimStart('v')
  if ($installedVersion -ne $version) {
    throw "Expected Electron $version but archive contained $installedVersion."
  }

  Remove-Item -LiteralPath $distPath -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $installingPath -Destination $distPath
  [IO.File]::WriteAllText($pathFile, 'electron.exe', [Text.UTF8Encoding]::new($false))
} finally {
  Remove-Item -LiteralPath $installingPath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Installed and verified Electron $version at $runtimeExe."
