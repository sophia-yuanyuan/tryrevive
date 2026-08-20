[CmdletBinding()]
param(
  [ValidateRange(1500, 15000)]
  [int]$HoldMilliseconds = 6000
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class TryReviveNotepadForeground {
  private delegate bool EnumWindowsProc(IntPtr windowHandle, IntPtr parameter);

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

  [DllImport("user32.dll")]
  private static extern bool IsWindowVisible(IntPtr windowHandle);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetWindowText(IntPtr windowHandle, StringBuilder value, int maxCount);

  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);

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

  [DllImport("user32.dll")]
  private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

  public static void ResetIdleClock() {
    const byte shiftKey = 0x10;
    const uint keyUp = 0x0002;
    keybd_event(shiftKey, 0, 0, UIntPtr.Zero);
    keybd_event(shiftKey, 0, keyUp, UIntPtr.Zero);
  }

  public static IntPtr FindVisibleWindow(string titleMarker) {
    IntPtr result = IntPtr.Zero;
    EnumWindows(delegate(IntPtr windowHandle, IntPtr parameter) {
      StringBuilder title = new StringBuilder(512);
      GetWindowText(windowHandle, title, title.Capacity);
      if (IsWindowVisible(windowHandle) && title.ToString().IndexOf(titleMarker, StringComparison.OrdinalIgnoreCase) >= 0) {
        result = windowHandle;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return result;
  }

  public static uint WindowProcessId(IntPtr windowHandle) {
    uint processId;
    GetWindowThreadProcessId(windowHandle, out processId);
    return processId;
  }

  public static bool Activate(IntPtr targetWindow) {
    if (targetWindow == IntPtr.Zero) return false;
    IntPtr foregroundWindow = GetForegroundWindow();
    uint foregroundProcessId;
    uint foregroundThreadId = GetWindowThreadProcessId(foregroundWindow, out foregroundProcessId);
    uint targetProcessId;
    uint targetThreadId = GetWindowThreadProcessId(targetWindow, out targetProcessId);
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
    return ForegroundProcessId() == targetProcessId;
  }

  public static uint ForegroundProcessId() {
    uint processId;
    GetWindowThreadProcessId(GetForegroundWindow(), out processId);
    return processId;
  }
}
'@

$probePath = Join-Path ([IO.Path]::GetTempPath()) ("tryrevive-notepad-{0}.txt" -f [guid]::NewGuid())
[void](New-Item -ItemType File -Path $probePath -Force)
$launcher = Start-Process -FilePath "$env:SystemRoot\System32\notepad.exe" -ArgumentList @($probePath) -PassThru
$ownedProcessIds = @($launcher.Id)

try {
  $windowHandle = [IntPtr]::Zero
  $titleMarker = [IO.Path]::GetFileName($probePath)
  for ($attempt = 0; $attempt -lt 40 -and $windowHandle -eq [IntPtr]::Zero; $attempt += 1) {
    Start-Sleep -Milliseconds 100
    $windowHandle = [TryReviveNotepadForeground]::FindVisibleWindow($titleMarker)
  }
  if ($windowHandle -eq [IntPtr]::Zero) {
    throw 'No owned Notepad window was detected.'
  }
  $ownedProcessIds = @($launcher.Id, [TryReviveNotepadForeground]::WindowProcessId($windowHandle)) |
    Select-Object -Unique

  $activated = $false
  [TryReviveNotepadForeground]::ResetIdleClock()
  for ($attempt = 0; $attempt -lt 10 -and -not $activated; $attempt += 1) {
    $activated = [TryReviveNotepadForeground]::Activate($windowHandle)
    if (-not $activated) {
      Start-Sleep -Milliseconds 150
    }
  }
  if (-not $activated) {
    throw 'Windows did not activate the new Notepad process.'
  }

  Start-Sleep -Milliseconds 1800
  Write-Output 'TRYREVIVE_PROBE_ACTIVATED:notepad'
  Start-Sleep -Milliseconds $HoldMilliseconds
}
finally {
  foreach ($processId in $ownedProcessIds) {
    Stop-Process -Id $processId -ErrorAction SilentlyContinue
  }
  if ($null -ne $launcher -and -not $launcher.HasExited) {
    Stop-Process -Id $launcher.Id -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
}
