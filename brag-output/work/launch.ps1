$w = $PSScriptRoot
$env:LEXPEN_DATA = "$w\data"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333'
Start-Process -FilePath "$w\app\LexPen.exe" -ArgumentList "$w\demo", "$w\demo\release-notes.md" -WorkingDirectory "$w\demo"
