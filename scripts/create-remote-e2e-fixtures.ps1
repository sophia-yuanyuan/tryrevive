param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Write-SyntheticPdf {
  param([string]$Path)
  $stream = "BT /F1 12 Tf 72 720 Td (TryRevive synthetic PDF. Goal: finish a hackathon application. Last progress: project summary complete.) Tj ET"
  $objects = @(
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length $([System.Text.Encoding]::ASCII.GetByteCount($stream)) >>`nstream`n$stream`nendstream"
  )
  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append("%PDF-1.4`n")
  $offsets = [System.Collections.Generic.List[int]]::new()
  for ($index = 0; $index -lt $objects.Count; $index += 1) {
    $offsets.Add([System.Text.Encoding]::ASCII.GetByteCount($builder.ToString()))
    [void]$builder.Append("$($index + 1) 0 obj`n$($objects[$index])`nendobj`n")
  }
  $xrefOffset = [System.Text.Encoding]::ASCII.GetByteCount($builder.ToString())
  [void]$builder.Append("xref`n0 $($objects.Count + 1)`n0000000000 65535 f `n")
  foreach ($offset in $offsets) {
    [void]$builder.Append($offset.ToString("0000000000") + " 00000 n `n")
  }
  [void]$builder.Append("trailer`n<< /Size $($objects.Count + 1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n")
  [System.IO.File]::WriteAllBytes($Path, [System.Text.Encoding]::ASCII.GetBytes($builder.ToString()))
}

$audioPath = Join-Path $resolvedOutput "synthetic-project-context.wav"
Add-Type -AssemblyName System.Speech
$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $synthesizer.SetOutputToWaveFile($audioPath)
  $synthesizer.Speak("TryRevive synthetic remote test. My goal is to finish a hackathon application. I completed the project summary and stopped before writing my own responsibilities.")
} finally {
  $synthesizer.Dispose()
}

$pdfPath = Join-Path $resolvedOutput "synthetic-project-context.pdf"
Write-SyntheticPdf -Path $pdfPath

$docxRoot = Join-Path $resolvedOutput "synthetic-docx-source"
[System.IO.Directory]::CreateDirectory((Join-Path $docxRoot "_rels")) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $docxRoot "word")) | Out-Null
Write-Utf8File -Path (Join-Path $docxRoot "[Content_Types].xml") -Content @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@
Write-Utf8File -Path (Join-Path $docxRoot "_rels\.rels") -Content @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@
Write-Utf8File -Path (Join-Path $docxRoot "word\document.xml") -Content @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>TryRevive synthetic DOCX. Goal: finish a certificate application. Last progress: eligibility checked. Stuck at collecting one supporting document.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
'@
$docxPath = Join-Path $resolvedOutput "synthetic-project-context.docx"
Add-Type -AssemblyName System.IO.Compression.FileSystem
if ([System.IO.File]::Exists($docxPath)) {
  [System.IO.File]::Delete($docxPath)
}
[System.IO.Compression.ZipFile]::CreateFromDirectory($docxRoot, $docxPath)

$failurePath = Join-Path $resolvedOutput "synthetic-invalid-upstream.pdf"
[System.IO.File]::WriteAllBytes(
  $failurePath,
  [System.Text.Encoding]::ASCII.GetBytes("This is intentionally not a valid PDF.")
)

@($audioPath, $pdfPath, $docxPath, $failurePath) | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  if ($item.Length -le 0) { throw "Fixture was not created: $($item.Name)" }
  [PSCustomObject]@{ Name = $item.Name; Bytes = $item.Length }
}
