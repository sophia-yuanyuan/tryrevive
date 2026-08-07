[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Join-Path $repoRoot 'release'
$packagePath = Join-Path $repoRoot 'package.json'
$version = [string](Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version
$setupPath = Join-Path $releaseDir "TryRevive-Setup-$version-x64.exe"
$portablePath = Join-Path $releaseDir "TryRevive-Portable-$version-x64.exe"
$foregroundMonitorSource = Join-Path $repoRoot 'resources\windows\foreground-monitor.ps1'
$foregroundMonitorPackaged = Join-Path $releaseDir 'win-unpacked\resources\foreground-monitor.ps1'

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$Path)

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

  return ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
}

function Assert-WindowsArtifact {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing Windows artifact: $Path"
  }

  $file = Get-Item -LiteralPath $Path
  if ($file.Length -lt 10MB) {
    throw "Windows artifact is unexpectedly small: $($file.Name) ($($file.Length) bytes)"
  }

  $stream = [IO.File]::OpenRead($file.FullName)
  try {
    if ($stream.ReadByte() -ne 0x4D -or $stream.ReadByte() -ne 0x5A) {
      throw "Windows artifact is not a PE executable: $($file.Name)"
    }
  } finally {
    $stream.Dispose()
  }

  return Get-Sha256Hex -Path $file.FullName
}

$setupHash = Assert-WindowsArtifact -Path $setupPath
$portableHash = Assert-WindowsArtifact -Path $portablePath

if ($setupHash -eq $portableHash) {
  throw 'Setup and portable artifacts unexpectedly have the same SHA256 hash.'
}

if (-not (Test-Path -LiteralPath $foregroundMonitorPackaged -PathType Leaf)) {
  throw "Packaged foreground monitor is missing: $foregroundMonitorPackaged"
}
$foregroundMonitorSourceHash = Get-Sha256Hex -Path $foregroundMonitorSource
$foregroundMonitorPackagedHash = Get-Sha256Hex -Path $foregroundMonitorPackaged
if ($foregroundMonitorSourceHash -ne $foregroundMonitorPackagedHash) {
  throw 'Packaged foreground monitor does not match the reviewed source.'
}

$checksumLines = @(
  "$setupHash  $([IO.Path]::GetFileName($setupPath))",
  "$portableHash  $([IO.Path]::GetFileName($portablePath))"
)
$checksumsPath = Join-Path $releaseDir 'SHA256SUMS.txt'
[IO.File]::WriteAllLines($checksumsPath, $checksumLines, [Text.UTF8Encoding]::new($false))

Get-Item -LiteralPath $setupPath, $portablePath | Select-Object Name, Length
Write-Host 'Verified packaged foreground monitor against reviewed source.'
Write-Host "Wrote verified artifact hashes to $checksumsPath."
