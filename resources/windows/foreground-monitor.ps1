[CmdletBinding()]
param(
  [ValidateRange(250, 5000)]
  [int]$IntervalMilliseconds = 1000,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class TryReviveForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);
}
'@

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

do {
  $windowHandle = [TryReviveForegroundWindow]::GetForegroundWindow()
  [uint32]$foregroundProcessId = 0
  [void][TryReviveForegroundWindow]::GetWindowThreadProcessId(
    $windowHandle,
    [ref]$foregroundProcessId
  )

  $foregroundProcess = Get-Process -Id $foregroundProcessId -ErrorAction SilentlyContinue
  if ($null -ne $foregroundProcess) {
    [Console]::Out.WriteLine($foregroundProcess.ProcessName)
    [Console]::Out.Flush()
  }

  if (-not $Once) {
    Start-Sleep -Milliseconds $IntervalMilliseconds
  }
} while (-not $Once)
