param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$CacheRoot = Join-Path $ProjectRoot "node_modules\.cache\tryrevive-whisper"
$VendorRoot = Join-Path $ProjectRoot "resources\vendor\whisper\windows-x64"
$ArchivePath = Join-Path $CacheRoot "whisper-bin-x64-v1.9.1.zip"
$ModelPath = Join-Path $CacheRoot "ggml-base-q5_1-5359861.bin"
$ArchiveSha256 = "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539"
$ModelSha256 = "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898"
$ArchiveUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip"
$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin?download=true"

function Get-Sha256([string]$Path) {
  $Stream = [System.IO.File]::OpenRead($Path)
  try {
    $Sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $HashBytes = $Sha256.ComputeHash($Stream)
    }
    finally {
      $Sha256.Dispose()
    }
  }
  finally {
    $Stream.Dispose()
  }
  return ([System.BitConverter]::ToString($HashBytes) -replace '-', '').ToLowerInvariant()
}

function Ensure-VerifiedDownload(
  [string]$Path,
  [string]$Uri,
  [string]$ExpectedSha256
) {
  if ((Test-Path -LiteralPath $Path) -and (Get-Sha256 $Path) -eq $ExpectedSha256) { return }
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
  $PartialPath = "$Path.download"
  if (Test-Path -LiteralPath $PartialPath) { Remove-Item -LiteralPath $PartialPath -Force }
  Invoke-WebRequest -Uri $Uri -OutFile $PartialPath
  $ActualSha256 = Get-Sha256 $PartialPath
  if ($ActualSha256 -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $PartialPath -Force
    throw "Whisper dependency checksum mismatch: $ActualSha256"
  }
  Move-Item -LiteralPath $PartialPath -Destination $Path
}

function Remove-VerifiedCacheDirectory([string]$Path) {
  $ResolvedCache = [System.IO.Path]::GetFullPath($CacheRoot).TrimEnd('\')
  $ResolvedTarget = [System.IO.Path]::GetFullPath($Path)
  if (-not $ResolvedTarget.StartsWith("$ResolvedCache\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a directory outside the Whisper cache: $ResolvedTarget"
  }
  if (Test-Path -LiteralPath $ResolvedTarget) {
    Remove-Item -LiteralPath $ResolvedTarget -Recurse -Force
  }
}

$ManifestPath = Join-Path $VendorRoot "manifest.json"
if (Test-Path -LiteralPath $ManifestPath) {
  try {
    $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $RequiredFiles = @(
      "whisper-cli.exe",
      "whisper.dll",
      "ggml.dll",
      "ggml-base.dll",
      "ggml-cpu-x64.dll",
      "ggml-base-q5_1.bin"
    )
    $Complete =
      $Manifest.runtimeVersion -eq "1.9.1" -and
      $Manifest.runtimeArchiveSha256 -eq $ArchiveSha256 -and
      $Manifest.modelSha256 -eq $ModelSha256 -and
      $null -ne $Manifest.files
    foreach ($FileName in $RequiredFiles) {
      $FilePath = Join-Path $VendorRoot $FileName
      $ExpectedFileHash = [string]$Manifest.files.$FileName
      $Complete =
        $Complete -and
        (Test-Path -LiteralPath $FilePath) -and
        (-not [string]::IsNullOrWhiteSpace($ExpectedFileHash)) -and
        ((Get-Sha256 $FilePath) -eq $ExpectedFileHash)
    }
    foreach ($Property in $Manifest.files.PSObject.Properties) {
      $FilePath = Join-Path $VendorRoot $Property.Name
      $Complete =
        $Complete -and
        (Test-Path -LiteralPath $FilePath) -and
        ((Get-Sha256 $FilePath) -eq [string]$Property.Value)
    }
    if ($Complete) {
      [System.IO.File]::WriteAllText(
        $ManifestPath,
        ($Manifest | ConvertTo-Json),
        [System.Text.UTF8Encoding]::new($false)
      )
      Write-Output "Whisper offline runtime already verified."
      exit 0
    }
  }
  catch {
    # Rebuild the generated vendor directory below.
  }
}

New-Item -ItemType Directory -Force -Path $CacheRoot,$VendorRoot | Out-Null
Ensure-VerifiedDownload $ArchivePath $ArchiveUrl $ArchiveSha256
Ensure-VerifiedDownload $ModelPath $ModelUrl $ModelSha256

$ExtractRoot = Join-Path $CacheRoot "extract-v1.9.1"
Remove-VerifiedCacheDirectory $ExtractRoot
Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot
$ReleaseRoot = Join-Path $ExtractRoot "Release"
$RuntimeFiles = @(
  "whisper-cli.exe",
  "whisper.dll",
  "ggml.dll",
  "ggml-base.dll"
)
foreach ($FileName in $RuntimeFiles) {
  Copy-Item -LiteralPath (Join-Path $ReleaseRoot $FileName) -Destination $VendorRoot -Force
}
Get-ChildItem -LiteralPath $ReleaseRoot -File -Filter "ggml-cpu-*.dll" | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $VendorRoot -Force
}
Copy-Item -LiteralPath $ModelPath -Destination (Join-Path $VendorRoot "ggml-base-q5_1.bin") -Force

$FileHashes = [ordered]@{}
Get-ChildItem -LiteralPath $VendorRoot -File | Where-Object {
  $_.Extension -in @('.exe', '.dll', '.bin')
} | Sort-Object Name | ForEach-Object {
  $FileHashes[$_.Name] = Get-Sha256 $_.FullName
}

$Manifest = [ordered]@{
  runtime = "whisper.cpp"
  runtimeVersion = "1.9.1"
  runtimeArchiveSha256 = $ArchiveSha256
  model = "ggml-base-q5_1.bin"
  modelRevision = "5359861c739e955e79d9a303bcbc70fb988958b1"
  modelSha256 = $ModelSha256
  language = "multilingual"
  files = $FileHashes
  generated = $true
}
[System.IO.File]::WriteAllText(
  $ManifestPath,
  ($Manifest | ConvertTo-Json),
  [System.Text.UTF8Encoding]::new($false)
)
Remove-VerifiedCacheDirectory $ExtractRoot
Write-Output "Installed verified Whisper offline runtime in resources/vendor/whisper/windows-x64."
