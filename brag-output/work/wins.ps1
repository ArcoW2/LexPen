param([switch]$KeepOne, [switch]$All)
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class WX { delegate bool P(IntPtr h, IntPtr l);
[DllImport("user32.dll")] static extern bool EnumWindows(P p, IntPtr l);
[DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
public static List<string> Of(uint pid) { var r = new List<string>(); EnumWindows((h,l)=>{ uint id; GetWindowThreadProcessId(h,out id); if (id==pid && IsWindowVisible(h)) { var sb=new StringBuilder(256); GetWindowText(h,sb,256); r.Add(h+"|"+sb); } return true; }, IntPtr.Zero); return r; } }
"@
$proc = Get-Process LexPen -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*brag-output*' }
if (-not $proc) { "not running"; return }
$ws = [WX]::Of([uint32]$proc.Id)
$close = if ($All) { $ws } elseif ($KeepOne) { $ws | Select-Object -Skip 1 } else { @() }
foreach ($w in $close) { $h = ($w -split '\|')[0]; [void][WX]::PostMessage([IntPtr][long]$h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero); Start-Sleep -Milliseconds 700 }
Start-Sleep 1
[WX]::Of([uint32]$proc.Id)
