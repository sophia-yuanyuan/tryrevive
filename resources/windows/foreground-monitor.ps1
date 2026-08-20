[CmdletBinding()]
param(
  [ValidateRange(250, 5000)]
  [int]$IntervalMilliseconds = 1000,
  [switch]$Once,
  [ValidateRange(0, 2147483647)]
  [int]$ActivateProcessId = 0,
  [string]$ActivateWindowHandle = ''
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Threading;
using System.Runtime.InteropServices;

public static class TryReviveForegroundWindow {
  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

  [DllImport("kernel32.dll")]
  private static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  private static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);

  [DllImport("user32.dll")]
  private static extern bool ShowWindow(IntPtr windowHandle, int command);

  [DllImport("user32.dll")]
  private static extern bool BringWindowToTop(IntPtr windowHandle);

  [DllImport("user32.dll")]
  private static extern bool SetForegroundWindow(IntPtr windowHandle);

  [DllImport("user32.dll")]
  private static extern IntPtr SetFocus(IntPtr windowHandle);

  public static bool ActivateWindow(IntPtr targetWindow, uint expectedProcessId) {
    if (targetWindow == IntPtr.Zero || !IsWindowVisible(targetWindow)) return false;
    IntPtr foregroundWindow = GetForegroundWindow();
    uint foregroundProcessId;
    uint foregroundThreadId = GetWindowThreadProcessId(foregroundWindow, out foregroundProcessId);
    uint targetProcessId;
    uint targetThreadId = GetWindowThreadProcessId(targetWindow, out targetProcessId);
    if (targetProcessId != expectedProcessId) return false;
    uint currentThreadId = GetCurrentThreadId();
    bool attachedForeground = false;
    bool attachedTarget = false;
    try {
      if (foregroundThreadId != 0 && foregroundThreadId != currentThreadId) {
        attachedForeground = AttachThreadInput(currentThreadId, foregroundThreadId, true);
      }
      if (targetThreadId != 0 && targetThreadId != currentThreadId && targetThreadId != foregroundThreadId) {
        attachedTarget = AttachThreadInput(currentThreadId, targetThreadId, true);
      }
      ShowWindow(targetWindow, 9);
      BringWindowToTop(targetWindow);
      SetForegroundWindow(targetWindow);
      SetFocus(targetWindow);
    }
    finally {
      if (attachedTarget) AttachThreadInput(currentThreadId, targetThreadId, false);
      if (attachedForeground) AttachThreadInput(currentThreadId, foregroundThreadId, false);
    }
    Thread.Sleep(100);
    uint actualProcessId;
    GetWindowThreadProcessId(GetForegroundWindow(), out actualProcessId);
    return actualProcessId == expectedProcessId;
  }

  public static bool IsProcessForeground(uint processId) {
    uint actualProcessId;
    GetWindowThreadProcessId(GetForegroundWindow(), out actualProcessId);
    return actualProcessId == processId;
  }
}
'@

[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

if ($ActivateProcessId -gt 0 -or $ActivateWindowHandle) {
  [long]$numericWindowHandle = 0
  if (
    $ActivateProcessId -le 0 -or
    -not [long]::TryParse($ActivateWindowHandle, [ref]$numericWindowHandle) -or
    $numericWindowHandle -le 0
  ) {
    exit 2
  }
  if ([TryReviveForegroundWindow]::ActivateWindow([IntPtr]::new($numericWindowHandle), [uint32]$ActivateProcessId)) {
    exit 0
  }
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.AppActivate($ActivateProcessId)
  Start-Sleep -Milliseconds 100
  if ([TryReviveForegroundWindow]::IsProcessForeground([uint32]$ActivateProcessId)) {
    exit 0
  }
  exit 2
}

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
