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
$speechRuntimeSource = Join-Path $repoRoot 'resources\vendor\whisper\windows-x64'
$speechRuntimePackaged = Join-Path $releaseDir 'win-unpacked\resources\whisper\windows-x64'

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

$speechManifestPath = Join-Path $speechRuntimeSource 'manifest.json'
if (-not (Test-Path -LiteralPath $speechManifestPath -PathType Leaf)) {
  throw "Verified speech runtime manifest is missing: $speechManifestPath"
}
$speechManifest = Get-Content -LiteralPath $speechManifestPath -Raw | ConvertFrom-Json
if ($speechManifest.runtimeVersion -ne '1.9.1') {
  throw 'Verified speech runtime manifest has the wrong runtime version.'
}
$speechFiles = @('manifest.json') + @($speechManifest.files.PSObject.Properties.Name)
foreach ($speechFile in $speechFiles) {
  $sourcePath = Join-Path $speechRuntimeSource $speechFile
  $packagedPath = Join-Path $speechRuntimePackaged $speechFile
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Verified speech runtime source is missing: $sourcePath"
  }
  if (-not (Test-Path -LiteralPath $packagedPath -PathType Leaf)) {
    throw "Packaged speech runtime is missing: $packagedPath"
  }
  if ((Get-Sha256Hex -Path $sourcePath) -ne (Get-Sha256Hex -Path $packagedPath)) {
    throw "Packaged speech runtime file does not match verified source: $speechFile"
  }
  if ($speechFile -ne 'manifest.json') {
    $expectedHash = [string]$speechManifest.files.$speechFile
    if ((Get-Sha256Hex -Path $sourcePath) -ne $expectedHash) {
      throw "Speech runtime source file does not match its verified manifest: $speechFile"
    }
  }
}
$packagedModelHash = Get-Sha256Hex -Path (Join-Path $speechRuntimePackaged 'ggml-base-q5_1.bin')
if ($packagedModelHash -ne '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898') {
  throw 'Packaged offline speech model SHA256 is not the reviewed base-q5_1 model.'
}

$checksumLines = @(
  "$setupHash  $([IO.Path]::GetFileName($setupPath))",
  "$portableHash  $([IO.Path]::GetFileName($portablePath))"
)
$checksumsPath = Join-Path $releaseDir 'SHA256SUMS.txt'
[IO.File]::WriteAllLines($checksumsPath, $checksumLines, [Text.UTF8Encoding]::new($false))

Get-Item -LiteralPath $setupPath, $portablePath | Select-Object Name, Length
Write-Host 'Verified packaged foreground monitor against reviewed source.'
Write-Host 'Verified packaged offline Whisper runtime and model against reviewed sources.'
Write-Host "Wrote verified artifact hashes to $checksumsPath."
