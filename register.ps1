# Registers LexPen as a handler for .md files for the current user (no admin needed).
#   .\register.ps1            register the exe in .\publish
#   .\register.ps1 -Remove    undo
# Windows only lets the user pick the default app, so when another app is already
# chosen for .md this opens the Default apps page for LexPen to confirm it there.
param(
    [string]$Exe = (Join-Path $PSScriptRoot 'publish\LexPen.exe'),
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'

$classes = 'HKCU:\Software\Classes'
$progId = 'LexPen.Document'
$ext = '.md'

function Set-Default([string]$key, [string]$value) {
    New-Item $key -Force | Out-Null
    Set-ItemProperty -LiteralPath $key -Name '(default)' -Value $value
}

if ($Remove) {
    Remove-Item "$classes\$progId", "$classes\Applications\LexPen.exe", 'HKCU:\Software\LexPen' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-ItemProperty "$classes\$ext\OpenWithProgids" -Name $progId -ErrorAction SilentlyContinue
    Remove-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name 'LexPen' -ErrorAction SilentlyContinue
    if ((Get-ItemProperty "$classes\$ext" -ErrorAction SilentlyContinue).'(default)' -eq $progId) {
        Remove-ItemProperty "$classes\$ext" -Name '(default)'
    }
    'LexPen file association removed.'
}
else {
    $Exe = (Resolve-Path $Exe).Path
    $command = "`"$Exe`" `"%1`""

    # The document type and how to open it.
    Set-Default "$classes\$progId" 'Markdown Document'
    Set-Default "$classes\$progId\DefaultIcon" "$Exe,0"
    Set-Default "$classes\$progId\shell\open\command" $command

    # Offer it for .md, and make it the default when nothing else was chosen yet.
    Set-Default "$classes\$ext" $progId
    New-Item "$classes\$ext\OpenWithProgids" -Force | Out-Null
    New-ItemProperty "$classes\$ext\OpenWithProgids" -Name $progId -Value '' -Force | Out-Null

    # "Open with" entry.
    Set-Default "$classes\Applications\LexPen.exe\shell\open\command" $command
    New-ItemProperty "$classes\Applications\LexPen.exe" -Name 'FriendlyAppName' -Value 'LexPen' -Force | Out-Null
    New-Item "$classes\Applications\LexPen.exe\SupportedTypes" -Force | Out-Null
    New-ItemProperty "$classes\Applications\LexPen.exe\SupportedTypes" -Name $ext -Value '' -Force | Out-Null

    # Makes LexPen show up under Settings > Apps > Default apps.
    New-Item 'HKCU:\Software\LexPen\Capabilities\FileAssociations' -Force | Out-Null
    New-ItemProperty 'HKCU:\Software\LexPen\Capabilities' -Name 'ApplicationName' -Value 'LexPen' -Force | Out-Null
    New-ItemProperty 'HKCU:\Software\LexPen\Capabilities' -Name 'ApplicationDescription' -Value 'Fast, intuitive and flexible text and code editor' -Force | Out-Null
    New-ItemProperty 'HKCU:\Software\LexPen\Capabilities\FileAssociations' -Name $ext -Value $progId -Force | Out-Null
    New-Item 'HKCU:\Software\RegisteredApplications' -Force | Out-Null
    New-ItemProperty 'HKCU:\Software\RegisteredApplications' -Name 'LexPen' -Value 'Software\LexPen\Capabilities' -Force | Out-Null

    "Registered $Exe for $ext files."
}

# Tell Explorer the associations changed.
Add-Type -Namespace Win32 -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);'
[Win32.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

if (-not $Remove) {
    # Ask Windows which program it would really start for the extension.
    Add-Type -Namespace Win32 -Name Assoc -MemberDefinition '[DllImport("shlwapi.dll", CharSet = CharSet.Unicode)] public static extern int AssocQueryString(int flags, int str, string assoc, string extra, System.Text.StringBuilder result, ref int size);'
    $current = New-Object System.Text.StringBuilder 520
    $size = $current.Capacity
    [void][Win32.Assoc]::AssocQueryString(0, 2 <# ASSOCSTR_EXECUTABLE #>, $ext, 'open', $current, [ref]$size)
    if ("$current" -eq $Exe) {
        "LexPen is the default app for $ext."
    }
    else {
        "Windows currently opens $ext with '$current'. Opening Default apps: click $ext there and choose LexPen."
        Start-Process 'ms-settings:defaultapps?registeredAppUser=LexPen'
    }
}
