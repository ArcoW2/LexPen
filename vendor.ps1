# Rebuilds web/vendor from node_modules. Run `npm.cmd install` first.
# Only needed when upgrading a library; the output is kept in the project.
$ErrorActionPreference = 'Stop'
$m = Join-Path $PSScriptRoot 'node_modules'
$out = Join-Path $PSScriptRoot 'web\vendor'

function Join-Files([string[]]$files, [string]$target, [string]$sep) {
    $parts = foreach ($f in $files) { Get-Content (Join-Path $m $f) -Raw }
    Set-Content -Path (Join-Path $out $target) -Value ($parts -join $sep) -NoNewline -Encoding utf8
}

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\katex\fonts" | Out-Null

# Always loaded: markdown renderer + code highlighting.
Join-Files @(
    'markdown-it\dist\markdown-it.min.js',
    'markdown-it-anchor\dist\markdownItAnchor.umd.js',
    'markdown-it-deflist\dist\markdown-it-deflist.min.js',
    'markdown-it-emoji\dist\markdown-it-emoji.min.js',
    'markdown-it-footnote\dist\markdown-it-footnote.min.js',
    'markdown-it-mark\dist\markdown-it-mark.min.js',
    'markdown-it-sub\dist\markdown-it-sub.min.js',
    'markdown-it-sup\dist\markdown-it-sup.min.js',
    'markdown-it-task-lists\dist\markdown-it-task-lists.min.js',
    'markdown-it-texmath\texmath.js',
    '@highlightjs\cdn-assets\highlight.min.js',
    '@highlightjs\cdn-assets\languages\powershell.min.js'   # not in the common set
) 'core.js' ";`n"

# Loaded the first time the editor is shown.
Join-Files @(
    'codemirror\lib\codemirror.js',
    'codemirror\addon\mode\overlay.js',
    'codemirror\mode\xml\xml.js',
    'codemirror\mode\markdown\markdown.js',
    'codemirror\mode\gfm\gfm.js',
    'codemirror\mode\javascript\javascript.js',
    'codemirror\mode\yaml\yaml.js',
    'codemirror\mode\powershell\powershell.js',
    'codemirror\mode\clike\clike.js',
    'codemirror\addon\edit\continuelist.js',
    'codemirror\addon\dialog\dialog.js',
    'codemirror\addon\search\searchcursor.js',
    'codemirror\addon\search\search.js',
    'codemirror\addon\comment\comment.js',
    'codemirror\addon\fold\foldcode.js',
    'codemirror\addon\fold\foldgutter.js',
    'codemirror\addon\fold\brace-fold.js',
    'codemirror\addon\fold\indent-fold.js',
    'codemirror\addon\fold\markdown-fold.js',
    'codemirror\addon\mode\simple.js',      # language packs: colouring rules (simple mode)
    'codemirror\addon\runmode\runmode.js',  # language packs: the same colouring in the preview
    'codemirror\addon\hint\show-hint.js'    # word completion (complete.js)
) 'editor.js' ";`n"
Join-Files @('codemirror\lib\codemirror.css', 'codemirror\addon\dialog\dialog.css', 'codemirror\addon\fold\foldgutter.css',
    'codemirror\addon\hint\show-hint.css') 'editor.css' "`n"

# Loaded only when a document contains math / diagrams.
Copy-Item "$m\katex\dist\katex.min.js", "$m\katex\dist\katex.min.css" "$out\katex"
Copy-Item "$m\katex\dist\fonts\*.woff2" "$out\katex\fonts"
Copy-Item "$m\mermaid\dist\mermaid.min.js" $out

# A PDF (docs/plans/executed/PLAN-pdf-view.md): pdf.js, its viewer, and what it loads as it needs it (character maps, the
# standard fonts, the decoders of some image types).
New-Item -ItemType Directory -Force "$out\pdfjs" | Out-Null
Copy-Item "$m\pdfjs-dist\build\pdf.min.mjs", "$m\pdfjs-dist\build\pdf.worker.min.mjs", "$m\pdfjs-dist\web\pdf_viewer.mjs",
    "$m\pdfjs-dist\web\pdf_viewer.css", "$m\pdfjs-dist\LICENSE" "$out\pdfjs"
foreach ($d in 'cmaps', 'standard_fonts', 'wasm', 'iccs') { Copy-Item "$m\pdfjs-dist\$d" "$out\pdfjs" -Recurse }
Copy-Item "$m\pdfjs-dist\web\images" "$out\pdfjs" -Recurse

# Library versions, shown in the About window.
$versions = [ordered]@{}
foreach ($name in (Get-Content (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).dependencies.PSObject.Properties.Name) {
    $versions[$name] = (Get-Content "$m\$name\package.json" -Raw | ConvertFrom-Json).version
}
$versions | ConvertTo-Json | Set-Content (Join-Path $out 'versions.json') -Encoding utf8

Get-ChildItem $out -File -Recurse | Where-Object Extension -ne '.woff2' |
    ForEach-Object { '{0,10:N0}  {1}' -f $_.Length, $_.FullName.Substring($out.Length + 1) }
