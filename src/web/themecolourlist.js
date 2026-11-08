'use strict';
// The Theme colours window's content (docs/plans/executed/PLAN-theme-colours.md): every colour name a theme may set, in
// groups, each with what it is for; and the example in which each one is used where LexPen uses it, named. No page
// here: themecolours.js draws them, and the tests (Jint, tests/LexPen.Tests/ThemeColoursTests.cs) check that every
// colour name of light.json and dark.json has a line here and is used in the example.

const THEME_COLOUR_GROUPS = [
  ['Backgrounds, text and lines', [
    ['bg', 'The main background: the editor, the preview and the lists'],
    ['bgSide', 'The side panels (Folder, Search, Outline) and the gutter'],
    ['bgBar', 'The menu bar, the tab bar, the toolbars and the status bar'],
    ['bgBarDim', 'The inner bar of a block in another language (an embedded language)'],
    ['bgCode', 'A code block in the preview'],
    ['fg', 'The text'],
    ['fgDim', 'Dimmed text: line numbers, labels, hints'],
    ['border', 'The lines between parts, the borders of fields and menus, the line under a heading'],
    ['accent', 'The main colour: the active tab, a switched-on button, links, a bookmark\'s background'],
    ['hover', 'A row or button under the mouse'],
    ['active', 'The chosen row, a switched-on button'],
  ]],
  ['Marks in the text', [
    ['select', 'Selected text'],
    ['highlight', 'A highlight (and the compare\'s mirrored selection)'],
    ['occurrenceHit', 'The other places of the word at the cursor (Occurrences)'],
    ['occurrenceBox', 'The box around those places'],
    ['findHit', 'Every match of a find'],
    ['findCurrent', 'The current match'],
    ['findCurrentFg', 'The text on the current match'],
    ['findBox', 'The box around the current match'],
    ['bracketMatch', 'The bracket that matches the one at the cursor'],
    ['bracketNoMatch', 'A bracket without a match'],
    ['whitespace', 'Shown spaces, tabs and line ends'],
    ['guide1', 'Indent guide, level 1 (rainbow guides)'],
    ['guide2', 'Indent guide, level 2'],
    ['guide3', 'Indent guide, level 3'],
    ['guide4', 'Indent guide, level 4'],
    ['guide5', 'Indent guide, level 5'],
    ['guide6', 'Indent guide, level 6'],
  ]],
  ['Gutter, panes and bars', [
    ['bookmarkFg', 'A bookmark\'s number in the gutter (on the accent)'],
    ['gutterBgEmbedded', 'The gutter beside lines in another language'],
    ['paneActive', 'The ring around the active pane'],
    ['barChanged', 'The bar when the open file changed on disk; a tab\'s dot'],
    ['barRemoved', 'The bar when the open file was removed on disk; no find matches'],
  ]],
  ['The preview', [
    ['inlineCode', 'The box behind code within a line of text'],
    ['inlineCodeFg', 'The text of code within a line'],
    ['note', 'A note alert ([!NOTE])'],
    ['tip', 'A tip alert ([!TIP])'],
    ['important', 'An important alert ([!IMPORTANT])'],
    ['warning', 'A warning alert ([!WARNING])'],
    ['caution', 'A caution alert ([!CAUTION])'],
  ]],
  ['Files in the Folder pane (git)', [
    ['gitModified', 'A changed file'],
    ['gitAdded', 'An added file'],
    ['gitUntracked', 'A file git does not track'],
    ['gitDeleted', 'A deleted file'],
  ]],
  ['The settings window', [
    ['layerGlobal', 'The line left of a setting for every window'],
    ['layerWindow', 'The line left of a setting for this window'],
    ['layerSet', 'The line left of a setting in the theme set'],
    ['layerScreen', 'The line left of a setting for this screen'],
  ]],
  ['Code (the language colours)', [
    ['keyword', 'Keywords (create, if, return)'],
    ['string', 'Strings'],
    ['comment', 'Comments'],
    ['number', 'Numbers'],
    ['title', 'Titles: the names of functions, procedures, classes; headings'],
    ['attr', 'Attributes, properties, types'],
  ]],
];

// The example: a small LexPen in the chosen theme. Every coloured part has data-colour (its colour names) and a title;
// its text names them where that reads naturally.
function themeExampleHtml() {
  const at = (names, html, cls = '') => `<span class="${cls}" data-colour="${names}" title="${names}">${html}</span>`;
  const name = n => `<i class="tx-name">(${n})</i>`;
  const line = (n, html, cls = '') => `<div class="tx-line ${cls}"><span class="tx-ln" data-colour="fgDim" title="fgDim">${n}</span><span class="tx-lt">${html}</span></div>`;
  return `
<div class="tx-menubar" data-colour="bgBar border" title="bgBar border">
  <span>File</span><span>Edit</span><span>View</span>${at('active accent', 'Tools', 'tx-on')}<span>Options</span>
  <span class="tx-gap"></span>${name('bgBar')}
</div>
<div class="tx-body">
  <div class="tx-side" data-colour="bgSide" title="bgSide">
    <div class="tx-head">FOLDER ${name('bgSide')}</div>
    <div class="tx-row">docs</div>
    ${at('gitModified', `app.js ${name('gitModified')}`, 'tx-row tx-git-modified')}
    ${at('gitAdded', `new.js ${name('gitAdded')}`, 'tx-row tx-git-added')}
    ${at('gitUntracked', `notes.txt ${name('gitUntracked')}`, 'tx-row tx-git-untracked')}
    ${at('gitDeleted', `old.js ${name('gitDeleted')}`, 'tx-row tx-git-deleted')}
    ${at('hover', `under the mouse ${name('hover')}`, 'tx-row tx-hover')}
    ${at('active', `the chosen row ${name('active')}`, 'tx-row tx-active')}
  </div>
  <div class="tx-main">
    <div class="tx-tabs" data-colour="bgBar" title="bgBar">
      <span class="tx-tab">main.sql</span>
      ${at('accent', `report.md ${name('accent')}`, 'tx-tab tx-tab-on')}
      ${at('barChanged', `changed.txt ${name('barChanged')}`, 'tx-tab tx-dot tx-dot-changed')}
      ${at('barRemoved', `gone.txt ${name('barRemoved')}`, 'tx-tab tx-dot tx-dot-removed')}
    </div>
    <div class="tx-tabrules"></div>
    <div class="tx-panes">
      <div class="tx-editor" data-colour="paneActive" title="paneActive: the ring around the active pane">
        <div class="tx-gutter-note">${name('paneActive')}</div>
        ${line(1, `This is a ${at('highlight', 'highlight', 'tx-highlight')} ${name('highlight')}`)}
        ${line(2, `This is ${at('select', 'selected text', 'tx-select')} ${name('select')}`)}
        ${line(3, `The ${at('occurrenceHit occurrenceBox', 'word', 'tx-occ')} at the cursor, and the ${at('occurrenceHit occurrenceBox', 'word', 'tx-occ')} again ${name('occurrenceHit, occurrenceBox')}`)}
        ${line(4, `A find ${at('findHit', 'hit', 'tx-find')} and the ${at('findCurrent findCurrentFg findBox', 'current', 'tx-find-current')} one ${name('findHit, findCurrent, findCurrentFg, findBox')}`)}
        ${line(5, `Brackets: call${at('bracketMatch', '(', 'tx-bracket')}total${at('bracketMatch', ')', 'tx-bracket')} and ${at('bracketNoMatch', ']', 'tx-bracket-no')} ${name('bracketMatch, bracketNoMatch')}`)}
        ${line(6, `${at('whitespace', '&middot;&middot;', 'tx-ws')}spaces${at('whitespace', '&rarr;', 'tx-ws')}and a tab${at('whitespace', '&para;', 'tx-ws')} ${name('whitespace')}`)}
        ${line(7, `<span class="tx-bookmark" data-colour="bookmarkFg accent" title="bookmarkFg accent">1</span> a bookmark ${name('bookmarkFg')}`)}
        ${[1, 2, 3, 4, 5, 6].map(g => line(7 + g, `${[...Array(g)].map((_, i) => `<span class="tx-guide" data-colour="guide${i + 1}" title="guide${i + 1}" style="border-left-color: var(--guide${i + 1})"></span>`).join('')}level ${g} ${name('guide' + g)}`)).join('')}
        ${line(14, `${at('keyword', 'create', 'tx-keyword')} ${at('keyword', 'procedure', 'tx-keyword')} ${at('title', 'stock_check', 'tx-title')}(${at('attr', 'integer', 'tx-attr')} limit) ${at('comment', '// keyword, title, attr, comment', 'tx-comment')}`)}
        ${line(15, `&nbsp;&nbsp;${at('keyword', 'select', 'tx-keyword')} * ${at('keyword', 'from', 'tx-keyword')} stock ${at('keyword', 'where', 'tx-keyword')} state = ${at('string', "'open'", 'tx-string')} ${at('keyword', 'and', 'tx-keyword')} qty &lt; ${at('number', '100', 'tx-number')}; ${at('comment', '// string, number', 'tx-comment')}`)}
        <div class="tx-embedded" data-colour="gutterBgEmbedded" title="gutterBgEmbedded">
          <div class="tx-inner-bar" data-colour="bgBarDim" title="bgBarDim">JavaScript ${name('bgBarDim')}</div>
          ${line(16, `${at('keyword', 'const', 'tx-keyword')} n = ${at('number', '1', 'tx-number')}; ${name('gutterBgEmbedded: the gutter')}`)}
        </div>
        ${at('barChanged', 'The file changed on disk. Reload ' + name('barChanged'), 'tx-bar tx-bar-changed')}
        ${at('barRemoved', 'The file was removed from disk ' + name('barRemoved'), 'tx-bar tx-bar-removed')}
      </div>
      <div class="tx-preview" data-colour="bg fg" title="bg fg">
        <div class="tx-h" data-colour="border" title="border: the line under a heading">A heading ${name('fg, border')}</div>
        <p>Text with ${at('inlineCode inlineCodeFg', 'inline code', 'tx-inline')} ${name('inlineCode, inlineCodeFg')} and <span data-colour="fgDim" title="fgDim" class="tx-dim">dimmed text ${name('fgDim')}</span>.</p>
        <div class="tx-codeblock" data-colour="bgCode" title="bgCode">${at('keyword', 'return', 'tx-keyword')} ${at('string', '"a code block"', 'tx-string')}; ${name('bgCode')}</div>
        ${['note', 'tip', 'important', 'warning', 'caution'].map(a => `<div class="tx-alert" data-colour="${a}" title="${a}" style="border-left-color: var(--${a})"><b style="color: var(--${a})">${a[0].toUpperCase() + a.slice(1)}</b> ${name(a)}</div>`).join('')}
        <div class="tx-settings">
          ${[['layerGlobal', 'every window', 'global'], ['layerWindow', 'this window', 'window'], ['layerSet', 'the theme set', 'set'], ['layerScreen', 'this screen', 'screen']]
            .map(([c, what, v]) => `<div class="tx-layer" data-colour="${c}" title="${c}" style="border-left-color: var(--layer-${v})">A setting for ${what} ${name(c)}</div>`).join('')}
        </div>
      </div>
    </div>
  </div>
</div>
<div class="tx-status" data-colour="bgBar fgDim" title="bgBar fgDim">Ln 3, Col 9 &nbsp; UTF-8 &nbsp; SQL ${name('bgBar, fgDim')}</div>`;
}
