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

  return Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
}

$setupHash = Assert-WindowsArtifact -Path $setupPath
$portableHash = Assert-WindowsArtifact -Path $portablePath

if ($setupHash.Hash -eq $portableHash.Hash) {
  throw 'Setup and portable artifacts unexpectedly have the same SHA256 hash.'
}

if (-not (Test-Path -LiteralPath $foregroundMonitorPackaged -PathType Leaf)) {
  throw "Packaged foreground monitor is missing: $foregroundMonitorPackaged"
}
$foregroundMonitorSourceHash = Get-FileHash -LiteralPath $foregroundMonitorSource -Algorithm SHA256
$foregroundMonitorPackagedHash = Get-FileHash -LiteralPath $foregroundMonitorPackaged -Algorithm SHA256
if ($foregroundMonitorSourceHash.Hash -ne $foregroundMonitorPackagedHash.Hash) {
  throw 'Packaged foreground monitor does not match the reviewed source.'
}

$checksumLines = @(
  "$($setupHash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($setupPath))",
  "$($portableHash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($portablePath))"
)
$checksumsPath = Join-Path $releaseDir 'SHA256SUMS.txt'
[IO.File]::WriteAllLines($checksumsPath, $checksumLines, [Text.UTF8Encoding]::new($false))

Get-Item -LiteralPath $setupPath, $portablePath | Select-Object Name, Length
Write-Host 'Verified packaged foreground monitor against reviewed source.'
Write-Host "Wrote verified artifact hashes to $checksumsPath."
